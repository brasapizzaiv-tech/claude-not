// Núcleo do pedido de delivery — usado pelo painel (atendente logado) e pelo
// app público do cliente (/pedir, via admin client). Todo preço é resolvido
// AQUI no servidor; o navegador só manda ids.
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodificar, distanciaKm, temChaveMapa } from "@/lib/geo";

// Aceita tanto o client do servidor (cookies/RLS) quanto o admin client.
// Tipagem estrutural mínima pra os dois passarem.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export type LinhaPedido =
  | { kind: "item"; itemId: string; qtd: number; obs?: string }
  | { kind: "pizza"; tamanhoId: string; saborIds: string[]; bordaId: string | null; qtd: number; obs?: string }
  | { kind: "combo"; itemId: string; opcaoIds: string[]; qtd: number; obs?: string };

export type DadosPedidoDelivery = {
  clienteId?: string | null;
  nome: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco?: {
    logradouro?: string; numero?: string; complemento?: string; bairro?: string;
    cidade?: string; referencia?: string; cep?: string;
  };
  distanciaKm?: number | null;
  lat?: number | null;
  lng?: number | null;
  taxaEntrega: number;
  desconto: number;
  descontoMotivo?: string;
  formaPagamento: string;
  trocoPara?: number | null;
  origem: "app" | "whatsapp" | "instagram" | "telefone" | "balcao";
  observacao?: string;
  itens: LinhaPedido[];
};

type Linha = { descricao: string; qtd: number; preco: number; itemId: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

// Preço de venda: promoção ativa (promo_preco > 0) substitui o preço normal.
const precoVenda = (p: { preco?: number | null; promo_preco?: number | null } | null) => { const promo = Number(p?.promo_preco ?? 0); return promo > 0 ? promo : Number(p?.preco ?? 0); };

async function resolverPizza(db: Db, tamanhoId: string, saborIds: string[], bordaId: string | null): Promise<Linha | null> {
  if (!tamanhoId || saborIds.length === 0) return null;
  const [{ data: tam }, { data: sabPrecos }, { data: sabores }] = await Promise.all([
    db.from("pdv_pizza_tamanhos").select("nome, max_sabores").eq("id", tamanhoId).single(),
    db.from("pdv_pizza_sabor_precos").select("sabor_id, preco").eq("tamanho_id", tamanhoId).in("sabor_id", saborIds),
    db.from("pdv_pizza_sabores").select("id, nome").in("id", saborIds),
  ]);
  if (!tam) return null;
  const ids = saborIds.slice(0, tam.max_sabores);
  const precoDe = new Map((sabPrecos ?? []).map((p: { sabor_id: string; preco: number }) => [p.sabor_id, Number(p.preco)]));
  const nomeDe = new Map((sabores ?? []).map((s: { id: string; nome: string }) => [s.id, s.nome]));
  const usados = ids.filter((id) => precoDe.has(id));
  if (usados.length === 0) return null;
  const media = usados.reduce((s, id) => s + (precoDe.get(id) || 0), 0) / usados.length;
  let bordaNome = "", bordaPreco = 0;
  if (bordaId) {
    const [{ data: b }, { data: bp }] = await Promise.all([
      db.from("pdv_pizza_bordas").select("nome").eq("id", bordaId).single(),
      db.from("pdv_pizza_borda_precos").select("preco").eq("borda_id", bordaId).eq("tamanho_id", tamanhoId).single(),
    ]);
    if (b) bordaNome = b.nome;
    bordaPreco = Number(bp?.preco ?? 0);
  }
  const preco = r2(media + bordaPreco);
  const nomes = usados.map((id) => nomeDe.get(id) || "?").join(" / ");
  return { descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : ""), qtd: 1, preco, itemId: null };
}

async function resolverCombo(db: Db, itemId: string, opcaoIds: string[]): Promise<Linha | null> {
  const { data: item } = await db.from("pdv_itens").select("nome, preco, promo_preco").eq("id", itemId).single();
  if (!item) return null;
  const nomes: string[] = [];
  let extra = 0;
  if (opcaoIds.length > 0) {
    const cont = new Map<string, number>();
    for (const id of opcaoIds) cont.set(id, (cont.get(id) || 0) + 1);
    const { data: grupos } = await db.from("pdv_item_grupos").select("id").eq("item_id", itemId);
    const grupoIds = ((grupos ?? []) as { id: string }[]).map((g) => g.id);
    if (grupoIds.length) {
      const { data: ops } = await db.from("pdv_item_opcoes").select("id, nome, preco").in("id", [...cont.keys()]).in("grupo_id", grupoIds);
      for (const o of (ops ?? []) as { id: string; nome: string; preco: number }[]) {
        const qtd = cont.get(o.id) || 0;
        const preco = Number(o.preco);
        extra += preco * qtd;
        const prefixo = qtd > 1 ? `${qtd}× ` : "";
        nomes.push(preco > 0 ? `${prefixo}${o.nome} (+${preco})` : `${prefixo}${o.nome}`);
      }
    }
  }
  const preco = r2(precoVenda(item) + extra);
  const descricao = nomes.length ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}` : item.nome;
  return { descricao, qtd: 1, preco, itemId };
}

// Taxa de entrega pela distância (endereço → restaurante), usando a config.
export async function calcularTaxaEntrega(db: Db, endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const { data: cfg } = await db
    .from("delivery_config")
    .select("origem_lat, origem_lng, taxa_base, preco_km, raio_max_km")
    .eq("id", 1)
    .maybeSingle();
  const c = cfg as { origem_lat?: number; origem_lng?: number; taxa_base?: number; preco_km?: number; raio_max_km?: number } | null;
  if (c?.origem_lat == null || c?.origem_lng == null) {
    return { ok: false as const, mensagem: "Configure o endereço do restaurante em Delivery → Config." };
  }
  const partes = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade || "Ivoti", "RS", endereco.cep]
    .map((x) => (x || "").trim()).filter(Boolean);
  const destino = await geocodificar(partes.join(", "));
  if (!destino) return { ok: false as const, mensagem: "Não encontrei esse endereço no mapa. Confira a rua/número." };

  const km = await distanciaKm({ lat: Number(c.origem_lat), lng: Number(c.origem_lng) }, destino);
  if (km == null) return { ok: false as const, mensagem: "Não consegui medir a distância." };

  const taxa = r2(Number(c.taxa_base ?? 0) + Number(c.preco_km ?? 0) * km);
  const raio = Number(c.raio_max_km ?? 0);
  return {
    ok: true as const,
    distanciaKm: km, taxa,
    foraDeArea: raio > 0 && km > raio,
    lat: destino.lat, lng: destino.lng,
    aproximado: !temChaveMapa(),
  };
}

// Enfileira a comanda de um lançamento nas impressoras de cozinha (vias por produto).
export async function enfileirarCozinha(db: Db, lancamentoId: string, itemIds: string[]) {
  const { data: cozinhas } = await db
    .from("impressoras").select("id, comanda_produtos").eq("ativo", true).eq("recebe_comandas", true);
  const jobs = ((cozinhas as { id: string; comanda_produtos: string[] | null }[]) ?? [])
    .filter((im) => im.comanda_produtos === null || itemIds.some((id) => im.comanda_produtos!.includes(id)))
    .map((im) => ({ tipo: "comanda", ref_id: lancamentoId, impressora_id: im.id }));
  if (jobs.length > 0) await db.from("impressao_fila").insert(jobs);
  return jobs.length;
}

// Reimprime (ou imprime pela 1ª vez) a comanda de um pedido já criado.
export async function imprimirComandaDoPedido(db: Db, pedidoId: string) {
  const { data: ped } = await db.from("delivery_pedidos").select("comanda_id").eq("id", pedidoId).single();
  const comandaId = (ped as { comanda_id: string | null } | null)?.comanda_id;
  if (!comandaId) return 0;
  const { data: item } = await db
    .from("pdv_comanda_itens").select("lancamento_id").eq("comanda_id", comandaId).order("criado_em").limit(1).maybeSingle();
  const lanc = (item as { lancamento_id: string | null } | null)?.lancamento_id;
  if (!lanc) return 0;
  const { data: itens } = await db.from("pdv_comanda_itens").select("item_id").eq("lancamento_id", lanc);
  const itemIds = ((itens ?? []) as { item_id: string | null }[]).map((i) => i.item_id).filter(Boolean) as string[];
  return enfileirarCozinha(db, lanc, itemIds);
}

// Cria o pedido: comanda + itens (mesmo lançamento) + registro do delivery.
// status "aceito" (painel) imprime na hora; "pendente" (app do cliente) só
// imprime quando o restaurante aceitar.
export async function criarPedidoDeliveryCore(
  db: Db,
  d: DadosPedidoDelivery,
  opts: {
    status: "pendente" | "aceito";
    atendenteId: string | null;
    criadoPor: string | null;
    // Cupom já validado (ativo/validade/usos) — o desconto é calculado AQUI,
    // sobre o subtotal real resolvido no servidor.
    cupom?: { codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null } | null;
  },
) {
  const validos = (d.itens ?? []).filter((i) => Math.round(Number((i as { qtd?: number }).qtd) || 1) > 0);
  if (validos.length === 0) return { ok: false as const, mensagem: "Pedido sem itens." };
  if (!d.nome.trim()) return { ok: false as const, mensagem: "Informe o nome do cliente." };

  const linhas: Linha[] = [];
  for (const it of validos) {
    const q = Math.max(1, Math.round(Number((it as { qtd?: number }).qtd) || 1));
    // Observação do item (ex.: "sem cebola") vira uma linha extra na descrição.
    const obsItem = ((it as { obs?: string }).obs || "").trim().slice(0, 200);
    const comObs = (l: Linha): Linha => (obsItem ? { ...l, descricao: `${l.descricao}\n📝 ${obsItem}` } : l);
    if (it.kind === "item") {
      const { data: prod } = await db.from("pdv_itens").select("nome, preco, promo_preco").eq("id", it.itemId).single();
      if (!prod) continue;
      linhas.push(comObs({ descricao: (prod as { nome: string }).nome, qtd: q, preco: r2(precoVenda(prod as { preco?: number; promo_preco?: number })), itemId: it.itemId }));
    } else if (it.kind === "pizza") {
      const l = await resolverPizza(db, it.tamanhoId, it.saborIds, it.bordaId);
      if (l) linhas.push(comObs({ ...l, qtd: q }));
    } else {
      const l = await resolverCombo(db, it.itemId, it.opcaoIds);
      if (l) linhas.push(comObs({ ...l, qtd: q }));
    }
  }
  if (linhas.length === 0) return { ok: false as const, mensagem: "Não consegui montar os itens." };

  // Desconto do cupom sobre o subtotal REAL (resolvido acima).
  let desconto = r2(Number(d.desconto) || 0);
  let descontoMotivo = (d.descontoMotivo || "").trim() || null;
  if (opts.cupom) {
    const subtotal = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
    if (opts.cupom.minimo != null && subtotal < Number(opts.cupom.minimo)) {
      return { ok: false as const, mensagem: `O cupom ${opts.cupom.codigo} vale só pra pedidos a partir de R$ ${Number(opts.cupom.minimo).toFixed(2).replace(".", ",")}.` };
    }
    const valorCupom = opts.cupom.tipo === "percent"
      ? r2(subtotal * Number(opts.cupom.valor) / 100)
      : Math.min(subtotal, r2(Number(opts.cupom.valor)));
    desconto = r2(desconto + valorCupom);
    descontoMotivo = [descontoMotivo, `Cupom ${opts.cupom.codigo}`].filter(Boolean).join(" · ");
  }

  const mesa = `${d.nome.trim().split(" ")[0]} · ${d.tipo === "retirada" ? "RETIRADA" : "ENTREGA"}`;
  const { data: com } = await db
    .from("pdv_comandas")
    .insert({ mesa, peso: 0, tara: 0, valor_buffet: 0, livre: false })
    .select("id, numero")
    .single();
  const comandaId = (com as { id: string } | null)?.id;
  if (!comandaId) return { ok: false as const, mensagem: "Não foi possível criar a comanda." };

  const lancamentoId = crypto.randomUUID();
  const obs = (d.observacao || "").trim();
  const rows = linhas.map((l, idx) => ({
    comanda_id: comandaId,
    item_id: l.itemId,
    descricao: l.descricao + (idx === 0 && obs ? `\n📝 ${obs}` : ""),
    qtd: l.qtd,
    preco_unit: l.preco,
    criado_por: opts.criadoPor,
    lancamento_id: lancamentoId,
  }));
  await db.from("pdv_comanda_itens").insert(rows);

  const { data: cfg } = await db.from("delivery_config").select("tempo_preparo_min").eq("id", 1).maybeSingle();
  const preparoMin = Number((cfg as { tempo_preparo_min?: number } | null)?.tempo_preparo_min ?? 40) || 40;
  const previsaoEm = new Date(Date.now() + preparoMin * 60000).toISOString();

  const { data: ped } = await db
    .from("delivery_pedidos")
    .insert({
      comanda_id: comandaId,
      cliente_id: d.clienteId ?? null,
      nome: d.nome.trim(),
      telefone: d.telefone.trim(),
      tipo: d.tipo,
      logradouro: d.endereco?.logradouro ?? null,
      numero: d.endereco?.numero ?? null,
      complemento: d.endereco?.complemento ?? null,
      bairro: d.endereco?.bairro ?? null,
      cidade: d.endereco?.cidade ?? null,
      referencia: d.endereco?.referencia ?? null,
      cep: d.endereco?.cep ?? null,
      distancia_km: d.distanciaKm ?? null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      previsao_em: previsaoEm,
      taxa_entrega: d.tipo === "retirada" ? 0 : r2(Number(d.taxaEntrega) || 0),
      desconto,
      desconto_motivo: descontoMotivo,
      forma_pagamento: d.formaPagamento || null,
      troco_para: d.trocoPara ?? null,
      origem: d.origem,
      status: opts.status,
      aceito_em: opts.status === "aceito" ? new Date().toISOString() : null,
      atendente_id: opts.atendenteId,
      observacao: obs || null,
    })
    .select("id")
    .single();

  if (opts.status === "aceito") {
    const itemIds = linhas.map((l) => l.itemId).filter(Boolean) as string[];
    await enfileirarCozinha(db, lancamentoId, itemIds);
  }

  return {
    ok: true as const,
    id: (ped as { id: string } | null)?.id as string,
    numero: (com as { numero?: number } | null)?.numero as number | undefined,
    desconto,
  };
}
