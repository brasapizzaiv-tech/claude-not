// Núcleo do pedido de delivery — usado pelo painel (atendente logado) e pelo
// app público do cliente (/pedir, via admin client). Todo preço é resolvido
// AQUI no servidor; o navegador só manda ids.
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodificar, distanciaKm, temChaveMapa } from "@/lib/geo";
import { areaDoPonto, aplicarPromoTele, promosPossiveisHoje, type AreaEntrega, type PromoTele } from "@/lib/delivery-areas";
import { nomesDosSabores } from "@/lib/pizza-sabores";
import { fmtKg } from "@/lib/peso-kg";
import { precoComEtapas, problemaDasEscolhas } from "@/lib/combo-preco";

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
  origem: "app" | "whatsapp" | "instagram" | "telefone" | "balcao" | "convenio";
  observacao?: string;
  itens: LinhaPedido[];
  agendadoPara?: string | null; // ISO — pedido pra um horário marcado (senão é pra agora)
  areaId?: string | null;       // área de entrega em que o endereço caiu
  areaNome?: string | null;
};

// combo/promo: pro cashback poder deixar de fora combos e itens em promoção.
type Linha = { descricao: string; qtd: number; preco: number; itemId: string | null; combo?: boolean; promo?: boolean };

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
  const nomes = nomesDosSabores(usados, (id) => nomeDe.get(id) || "?");
  return { descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : ""), qtd: 1, preco, itemId: null };
}

// Item com etapas: combo do delivery ou marmita com complementos (migration
// 0263). Preço = item + etapas (src/lib/combo-preco.ts): etapa comum soma,
// etapa de pizza cobra a média dos sabores. Confere mínimo/máximo/repetição.
// No combo a cozinha recebe uma linha por etapa ("Grande: Calabresa / Brasa");
// nos complementos, uma linha por opção, como sempre foi.
export async function resolverCombo(db: Db, itemId: string, opcaoIds: string[]): Promise<Linha | null> {
  const { data: item } = await db.from("pdv_itens").select("nome, preco, promo_preco, combo").eq("id", itemId).single();
  if (!item) return null;
  const ehCombo = !!(item as { combo?: boolean }).combo;
  const { data: gs } = await db.from("pdv_item_grupos").select("id, nome, min, max, permite_repetir, media, ordem, pdv_pizza_tamanhos(nome)").eq("item_id", itemId).order("ordem");
  type G = { id: string; nome: string; min: number; max: number; permite_repetir: boolean; media: boolean; pdv_pizza_tamanhos: { nome: string } | { nome: string }[] | null };
  const grupos = (gs as G[] | null) ?? [];
  const ops = opcaoIds.length && grupos.length
    ? (((await db.from("pdv_item_opcoes").select("id, grupo_id, nome, preco").in("id", [...new Set(opcaoIds)]).in("grupo_id", grupos.map((g) => g.id)).eq("ativo", true)).data) as { id: string; grupo_id: string; nome: string; preco: number }[] | null) ?? []
    : [];
  const opDe = new Map(ops.map((o) => [o.id, o]));
  const porGrupo: Record<string, string[]> = {};
  for (const id of opcaoIds) { const o = opDe.get(id); if (o) (porGrupo[o.grupo_id] ??= []).push(id); }
  if (problemaDasEscolhas(grupos, porGrupo)) return null;
  const preco = precoComEtapas(precoVenda(item), grupos, Object.fromEntries(Object.entries(porGrupo).map(([g, ids]) => [g, ids.map((id) => Number(opDe.get(id)!.preco))])));
  const linhas: string[] = [];
  for (const g of grupos) {
    const ids = porGrupo[g.id] ?? [];
    if (ids.length === 0) continue;
    if (ehCombo) {
      const tam = Array.isArray(g.pdv_pizza_tamanhos) ? g.pdv_pizza_tamanhos[0] : g.pdv_pizza_tamanhos;
      const nomes = g.media ? nomesDosSabores(ids, (id) => opDe.get(id)?.nome ?? "?") : contarNomes(ids, (id) => opDe.get(id)?.nome ?? "?");
      linhas.push(`${tam?.nome ?? g.nome}: ${nomes}`);
    } else {
      const cont = new Map<string, number>();
      for (const id of ids) cont.set(id, (cont.get(id) || 0) + 1);
      for (const [id, n] of cont) { const o = opDe.get(id)!; const p = Number(o.preco); linhas.push(`${n > 1 ? `${n}× ` : ""}${o.nome}${p > 0 ? ` (+${p})` : ""}`); }
    }
  }
  const descricao = linhas.length ? `${item.nome}\n${linhas.map((n) => `- ${n}`).join("\n")}` : item.nome;
  return { descricao, qtd: 1, preco, itemId, combo: true, promo: Number(item.promo_preco ?? 0) > 0 };
}

// "2× Guaraná / Coca" (uma etapa de lista no combo).
function contarNomes(ids: string[], nomeDe: (id: string) => string) {
  const cont = new Map<string, number>();
  for (const id of ids) cont.set(id, (cont.get(id) || 0) + 1);
  return [...cont].map(([id, n]) => `${n > 1 ? `${n}× ` : ""}${nomeDe(id)}`).join(" / ");
}

// Áreas ativas e promoções ativas (carregadas juntas; poucas linhas).
export async function areasEPromos(db: Db) {
  const [{ data: areas }, { data: promos }] = await Promise.all([
    db.from("delivery_areas").select("id, nome, cor, valor, taxa_motoboy, tempo_min, poligono, ativo").eq("ativo", true).order("ordem"),
    db.from("delivery_promocoes_tele").select("id, nome, tipo, valor, area_ids, pedido_minimo, dias, hora_ini, hora_fim, validade, ativo").eq("ativo", true),
  ]);
  return {
    areas: ((areas as unknown as AreaEntrega[]) ?? []).map((a) => ({ ...a, valor: Number(a.valor) })),
    promos: ((promos as unknown as PromoTele[]) ?? []).map((p) => ({ ...p, valor: Number(p.valor), pedido_minimo: p.pedido_minimo != null ? Number(p.pedido_minimo) : null })),
  };
}

// Taxa de entrega: por ÁREA desenhada no mapa quando houver áreas ativas
// (fora de todas = não entregamos); sem áreas, pela distância até o
// restaurante (config). Devolve também a promoção que pode valer hoje.
export async function calcularTaxaEntrega(db: Db, endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const { data: cfg } = await db
    .from("delivery_config")
    .select("origem_lat, origem_lng, taxa_base, preco_km, raio_max_km")
    .maybeSingle();
  const c = cfg as { origem_lat?: number; origem_lng?: number; taxa_base?: number; preco_km?: number; raio_max_km?: number } | null;
  if (c?.origem_lat == null || c?.origem_lng == null) {
    return { ok: false as const, mensagem: "Configure o endereço do restaurante em Delivery → Config." };
  }
  const partes = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade || "Ivoti", "RS", endereco.cep]
    .map((x) => (x || "").trim()).filter(Boolean);
  const destino = await geocodificar(partes.join(", "));
  if (!destino) return { ok: false as const, mensagem: "Não encontrei esse endereço no mapa. Confira a rua/número." };

  const { areas, promos } = await areasEPromos(db);
  if (areas.length > 0) {
    const area = areaDoPonto(areas, destino.lat, destino.lng);
    if (!area) {
      return { ok: true as const, distanciaKm: null, taxa: 0, foraDeArea: true, lat: destino.lat, lng: destino.lng, aproximado: !temChaveMapa(), areaId: null, areaNome: null, tempoMin: null, promosHoje: [] as PromoTele[] };
    }
    return {
      ok: true as const, distanciaKm: null, taxa: r2(area.valor), foraDeArea: false,
      lat: destino.lat, lng: destino.lng, aproximado: !temChaveMapa(),
      areaId: area.id, areaNome: area.nome, tempoMin: area.tempo_min,
      promosHoje: promosPossiveisHoje(promos, area.id, Date.now()),
    };
  }

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
    areaId: null, areaNome: null, tempoMin: null,
    promosHoje: promosPossiveisHoje(promos, null, Date.now()),
  };
}

// Enfileira a comanda de um lançamento nas impressoras de cozinha (vias por produto).
// temPizza: o lançamento tem pizza montada (item_id nulo) → vai também pra
// impressora marcada "recebe pizzas".
export async function enfileirarCozinha(db: Db, lancamentoId: string, itemIds: string[], temPizza = false) {
  const { data: cozinhas } = await db
    .from("impressoras").select("id, comanda_produtos, recebe_pizzas").eq("ativo", true).eq("recebe_comandas", true);
  const jobs = ((cozinhas as { id: string; comanda_produtos: string[] | null; recebe_pizzas: boolean | null }[]) ?? [])
    .filter((im) => im.comanda_produtos === null || itemIds.some((id) => im.comanda_produtos!.includes(id)) || (temPizza && !!im.recebe_pizzas))
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
  return enfileirarLancamento(db, lanc);
}

// Manda (de novo) um pedido pra cozinha: cada impressora recebe só o que é
// dela (produtos marcados, pizzas). Devolve quantas vias entraram na fila.
export async function enfileirarLancamento(db: Db, lanc: string) {
  const { data: itens } = await db.from("pdv_comanda_itens").select("item_id").eq("lancamento_id", lanc);
  const todos = (itens ?? []) as { item_id: string | null }[];
  if (todos.length === 0) return 0;
  const itemIds = todos.map((i) => i.item_id).filter(Boolean) as string[];
  return enfileirarCozinha(db, lanc, itemIds, todos.some((i) => i.item_id === null));
}

// "Reimprimir na cozinha" (garçom e comanda do caixa). Item lançado pela tela
// da comanda no caixa não tem lançamento (nunca foi pra cozinha): ganha um
// agora, juntando os soltos daquela comanda, e vai.
export async function reimprimirNaCozinha(db: Db, comandaId: string, lancamentoId: string | null) {
  let lanc = lancamentoId;
  if (!lanc) {
    const { data: soltos } = await db.from("pdv_comanda_itens").select("id").eq("comanda_id", comandaId).is("lancamento_id", null);
    const ids = ((soltos as { id: string }[]) ?? []).map((x) => x.id);
    if (ids.length === 0) return { ok: false as const, mensagem: "Nada pra mandar pra cozinha." };
    lanc = crypto.randomUUID();
    await db.from("pdv_comanda_itens").update({ lancamento_id: lanc }).in("id", ids);
  } else {
    const { data: dono } = await db.from("pdv_comanda_itens").select("id").eq("lancamento_id", lanc).eq("comanda_id", comandaId).limit(1).maybeSingle();
    if (!dono) return { ok: false as const, mensagem: "Esse pedido não é desta comanda." };
  }
  const vias = await enfileirarLancamento(db, lanc);
  if (vias === 0) return { ok: false as const, mensagem: "Nenhuma impressora da cozinha recebe esses itens (confira em Impressoras)." };
  return { ok: true as const, vias };
}

// Resolve as linhas do pedido (item simples / pizza / combo) com preço do
// servidor e observação por item. Usado pelo delivery E pelo garçom.
export async function resolverLinhas(db: Db, itens: LinhaPedido[]): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (const it of itens) {
    const q = Math.max(1, Math.round(Number((it as { qtd?: number }).qtd) || 1));
    const obsItem = ((it as { obs?: string }).obs || "").trim().slice(0, 200);
    const comObs = (l: Linha): Linha => (obsItem ? { ...l, descricao: `${l.descricao}\nObs: ${obsItem}` } : l);
    if (it.kind === "item") {
      const { data: prod } = await db.from("pdv_itens").select("nome, preco, promo_preco, por_kg").eq("id", it.itemId).single();
      if (!prod) continue;
      // Vendido por kg (migration 0259): a quantidade é o peso (0,452) e a descrição leva os kg.
      const porKg = !!(prod as { por_kg?: boolean }).por_kg;
      const kg = porKg ? Math.round(Math.min(20, Math.max(0, Number((it as { qtd?: number }).qtd) || 0)) * 1000) / 1000 : 0;
      if (porKg && kg <= 0) continue;
      const nome = (prod as { nome: string }).nome;
      linhas.push(comObs({ descricao: porKg ? `${nome} (${fmtKg(kg)})` : nome, qtd: porKg ? kg : q, preco: r2(precoVenda(prod as { preco?: number; promo_preco?: number })), itemId: it.itemId, promo: Number((prod as { promo_preco?: number | null }).promo_preco ?? 0) > 0 }));
    } else if (it.kind === "pizza") {
      const l = await resolverPizza(db, it.tamanhoId, it.saborIds, it.bordaId);
      if (l) linhas.push(comObs({ ...l, qtd: q }));
    } else {
      const l = await resolverCombo(db, it.itemId, it.opcaoIds);
      if (l) linhas.push(comObs({ ...l, qtd: q }));
    }
  }
  return linhas;
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
    // Pedido mínimo (R$, sem a taxa) — conferido sobre o subtotal REAL.
    pedidoMinimo?: number;
    // De qual restaurante é este pedido. Obrigatório quando quem chama usa a
    // chave administrativa (o cardápio público), porque aí as regras do banco
    // não filtram nada. Do painel pode vir vazio: o banco já filtra.
    empresaId?: string | null;
    // Cliente quer usar o saldo de cashback neste pedido (só o app, por ora).
    usarCashback?: boolean;
  },
) {
  const empresaId = opts.empresaId ?? null;
  const validos = (d.itens ?? []).filter((i) => Math.round(Number((i as { qtd?: number }).qtd) || 1) > 0);
  if (validos.length === 0) return { ok: false as const, mensagem: "Pedido sem itens." };
  if (!d.nome.trim()) return { ok: false as const, mensagem: "Informe o nome do cliente." };

  const linhas = await resolverLinhas(db, validos);
  if (linhas.length === 0) return { ok: false as const, mensagem: "Não consegui montar os itens." };
  if (opts.pedidoMinimo && opts.pedidoMinimo > 0) {
    const sub = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
    if (sub < opts.pedidoMinimo) {
      return { ok: false as const, mensagem: `O pedido mínimo é R$ ${opts.pedidoMinimo.toFixed(2).replace(".", ",")} (sem contar a entrega). Faltam R$ ${(opts.pedidoMinimo - sub).toFixed(2).replace(".", ",")}.` };
    }
  }

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

  // Promoção da tele (grátis / % / R$) — decidida AQUI, sobre o subtotal real.
  let taxaEntrega = d.tipo === "retirada" ? 0 : r2(Number(d.taxaEntrega) || 0);
  let taxaMotivo: string | null = null;
  if (d.tipo === "entrega" && taxaEntrega > 0) {
    const { promos } = await areasEPromos(db);
    const subtotalPromo = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
    const ap = aplicarPromoTele(taxaEntrega, promos, { areaId: d.areaId ?? null, subtotal: subtotalPromo, agora: Date.now() });
    taxaEntrega = ap.taxa; taxaMotivo = ap.motivo;
  }

  // Cashback: config da empresa (uma linha) e, se o cliente quer usar, quanto.
  const subtotalItens = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
  const cbQuery = db.from("cashback_config").select("ativo, max_resgate, canais, sem_combos, sem_promos");
  const { data: cbRow } = await (empresaId ? cbQuery.eq("empresa_id", empresaId) : cbQuery).maybeSingle();
  const cb = cbRow as { ativo: boolean; max_resgate: number | null; canais: string[]; sem_combos: boolean; sem_promos: boolean } | null;
  let cashbackDesejado = 0;
  if (opts.usarCashback && cb?.ativo && d.clienteId && (cb.canais ?? []).includes(d.origem === "app" ? "app" : "delivery")) {
    const { data: saldo } = await db.rpc("cashback_saldo", { p_cliente: d.clienteId });
    const teto = cb.max_resgate != null ? Number(cb.max_resgate) : Infinity;
    cashbackDesejado = r2(Math.max(0, Math.min(Number(saldo ?? 0), teto, subtotalItens - desconto)));
  }
  if (cashbackDesejado > 0) {
    desconto = r2(desconto + cashbackDesejado);
    descontoMotivo = [descontoMotivo, "Cashback"].filter(Boolean).join(" · ");
  }
  // Base do cashback que este pedido VAI gerar na entrega: itens elegíveis,
  // sem a taxa, com a parte proporcional dos descontos (cupom + cashback usado).
  const elegivel = r2(linhas
    .filter((l) => !(cb?.sem_combos !== false && l.combo) && !(cb?.sem_promos !== false && l.promo))
    .reduce((s, l) => s + l.preco * l.qtd, 0));
  const cashbackBase = subtotalItens > 0 ? r2(Math.max(0, elegivel * (1 - Math.min(desconto, subtotalItens) / subtotalItens))) : 0;

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
    descricao: l.descricao + (idx === 0 && obs ? `\nObs: ${obs}` : ""),
    qtd: l.qtd,
    preco_unit: l.preco,
    criado_por: opts.criadoPor,
    lancamento_id: lancamentoId,
  }));
  await db.from("pdv_comanda_itens").insert(rows);

  // Painel e cardápio público chamam este mesmo núcleo. Quando vem do
  // cardápio, o acesso é com a chave administrativa e não passa pelas regras
  // do banco — então a empresa entra escrita. Quando vem do painel, o banco
  // já filtra e o mesmo filtro só confirma.
  const cfgQuery = db.from("delivery_config").select("tempo_preparo_min");
  const { data: cfg } = await (empresaId ? cfgQuery.eq("empresa_id", empresaId) : cfgQuery).maybeSingle();
  const preparoMin = Number((cfg as { tempo_preparo_min?: number } | null)?.tempo_preparo_min ?? 40) || 40;
  // Agendado: a previsão É o horário marcado.
  const previsaoEm = d.agendadoPara ? new Date(d.agendadoPara).toISOString() : new Date(Date.now() + preparoMin * 60000).toISOString();

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
      agendado_para: d.agendadoPara ? new Date(d.agendadoPara).toISOString() : null,
      taxa_entrega: taxaEntrega,
      taxa_motivo: taxaMotivo,
      area_id: d.areaId ?? null,
      area_nome: d.areaNome ?? null,
      desconto,
      desconto_motivo: descontoMotivo,
      cashback_base: cashbackBase,
      forma_pagamento: d.formaPagamento || null,
      troco_para: d.trocoPara ?? null,
      origem: d.origem,
      status: opts.status,
      aceito_em: opts.status === "aceito" ? new Date().toISOString() : null,
      atendente_id: opts.atendenteId,
      observacao: obs || null,
    })
    .select("id, numero_turno")
    .single();

  // Cashback usado: consome do saldo agora (o que vence antes primeiro). Se
  // outro pedido gastou no meio-tempo e veio menos, acerta o desconto.
  const pedidoId = (ped as { id: string } | null)?.id ?? null;
  if (pedidoId && cashbackDesejado > 0 && d.clienteId) {
    const { data: usado } = await db.rpc("cashback_resgatar", { p_cliente: d.clienteId, p_pedido: pedidoId, p_valor: cashbackDesejado });
    const real = r2(Number(usado ?? 0));
    if (real !== cashbackDesejado) {
      desconto = r2(desconto - cashbackDesejado + real);
      if (real <= 0) descontoMotivo = (descontoMotivo ?? "").split(" · ").filter((m) => m !== "Cashback").join(" · ") || null;
      await db.from("delivery_pedidos").update({ desconto, desconto_motivo: descontoMotivo, cashback_resgate: real }).eq("id", pedidoId);
    } else {
      await db.from("delivery_pedidos").update({ cashback_resgate: real }).eq("id", pedidoId);
    }
    cashbackDesejado = real;
  }

  // Agendado NÃO imprime agora: a cozinha recebe quando o pedido for pra "em preparo".
  if (opts.status === "aceito" && !d.agendadoPara) {
    const itemIds = linhas.map((l) => l.itemId).filter(Boolean) as string[];
    await enfileirarCozinha(db, lancamentoId, itemIds, linhas.some((l) => l.itemId === null));
  }

  const subtotalLinhas = r2(linhas.reduce((s, l) => s + l.preco * l.qtd, 0));
  const taxaFinal = taxaEntrega;
  return {
    ok: true as const,
    id: (ped as { id: string } | null)?.id as string,
    // Nº do delivery é o do turno (migration 0237); o da comanda é a reserva.
    numero: ((ped as { numero_turno?: number | null } | null)?.numero_turno ?? (com as { numero?: number } | null)?.numero) as number | undefined,
    taxa: taxaFinal,
    taxaMotivo,
    desconto,
    cashbackUsado: cashbackDesejado,
    total: r2(subtotalLinhas + taxaFinal - desconto),
  };
}
