"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodificar, distanciaKm, temChaveMapa } from "@/lib/geo";

// ---------- Tipos do carrinho (o cliente manda ids; o servidor resolve preço) ----------
export type LinhaPedido =
  | { kind: "item"; itemId: string; qtd: number }
  | { kind: "pizza"; tamanhoId: string; saborIds: string[]; bordaId: string | null; qtd: number }
  | { kind: "combo"; itemId: string; opcaoIds: string[]; qtd: number };

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

async function resolverPizza(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tamanhoId: string, saborIds: string[], bordaId: string | null,
): Promise<Linha | null> {
  if (!tamanhoId || saborIds.length === 0) return null;
  const [{ data: tam }, { data: sabPrecos }, { data: sabores }] = await Promise.all([
    supabase.from("pdv_pizza_tamanhos").select("nome, max_sabores").eq("id", tamanhoId).single(),
    supabase.from("pdv_pizza_sabor_precos").select("sabor_id, preco").eq("tamanho_id", tamanhoId).in("sabor_id", saborIds),
    supabase.from("pdv_pizza_sabores").select("id, nome").in("id", saborIds),
  ]);
  if (!tam) return null;
  const ids = saborIds.slice(0, tam.max_sabores);
  const precoDe = new Map((sabPrecos ?? []).map((p) => [p.sabor_id, Number(p.preco)]));
  const nomeDe = new Map((sabores ?? []).map((s) => [s.id, s.nome]));
  const usados = ids.filter((id) => precoDe.has(id));
  if (usados.length === 0) return null;
  const media = usados.reduce((s, id) => s + (precoDe.get(id) || 0), 0) / usados.length;
  let bordaNome = "", bordaPreco = 0;
  if (bordaId) {
    const [{ data: b }, { data: bp }] = await Promise.all([
      supabase.from("pdv_pizza_bordas").select("nome").eq("id", bordaId).single(),
      supabase.from("pdv_pizza_borda_precos").select("preco").eq("borda_id", bordaId).eq("tamanho_id", tamanhoId).single(),
    ]);
    if (b) bordaNome = b.nome;
    bordaPreco = Number(bp?.preco ?? 0);
  }
  const preco = r2(media + bordaPreco);
  const nomes = usados.map((id) => nomeDe.get(id) || "?").join(" / ");
  return { descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : ""), qtd: 1, preco, itemId: null };
}

async function resolverCombo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string, opcaoIds: string[],
): Promise<Linha | null> {
  const { data: item } = await supabase.from("pdv_itens").select("nome, preco").eq("id", itemId).single();
  if (!item) return null;
  const nomes: string[] = [];
  let extra = 0;
  if (opcaoIds.length > 0) {
    const cont = new Map<string, number>();
    for (const id of opcaoIds) cont.set(id, (cont.get(id) || 0) + 1);
    const { data: grupos } = await supabase.from("pdv_item_grupos").select("id").eq("item_id", itemId);
    const grupoIds = (grupos ?? []).map((g) => g.id);
    if (grupoIds.length) {
      const { data: ops } = await supabase.from("pdv_item_opcoes").select("id, nome, preco").in("id", [...cont.keys()]).in("grupo_id", grupoIds);
      for (const o of ops ?? []) {
        const qtd = cont.get(o.id) || 0;
        const preco = Number(o.preco);
        extra += preco * qtd;
        const prefixo = qtd > 1 ? `${qtd}× ` : "";
        nomes.push(preco > 0 ? `${prefixo}${o.nome} (+${preco})` : `${prefixo}${o.nome}`);
      }
    }
  }
  const preco = r2(Number(item.preco) + extra);
  const descricao = nomes.length ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}` : item.nome;
  return { descricao, qtd: 1, preco, itemId };
}

// Cria o pedido de delivery: comanda + itens (mesmo lançamento) + registro do
// delivery + impressão na cozinha (roteada por produto, igual ao garçom).
export async function criarPedidoDelivery(d: DadosPedidoDelivery) {
  const supabase = await createClient();
  const validos = (d.itens ?? []).filter((i) => Math.round(Number((i as { qtd?: number }).qtd) || 1) > 0);
  if (validos.length === 0) return { ok: false as const, mensagem: "Pedido sem itens." };
  if (!d.nome.trim()) return { ok: false as const, mensagem: "Informe o nome do cliente." };

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  // Resolve cada linha (preço no servidor).
  const linhas: Linha[] = [];
  for (const it of validos) {
    const q = Math.max(1, Math.round(Number((it as { qtd?: number }).qtd) || 1));
    if (it.kind === "item") {
      const { data: prod } = await supabase.from("pdv_itens").select("nome, preco").eq("id", it.itemId).single();
      if (!prod) continue;
      linhas.push({ descricao: prod.nome, qtd: q, preco: r2(Number(prod.preco)), itemId: it.itemId });
    } else if (it.kind === "pizza") {
      const l = await resolverPizza(supabase, it.tamanhoId, it.saborIds, it.bordaId);
      if (l) linhas.push({ ...l, qtd: q });
    } else {
      const l = await resolverCombo(supabase, it.itemId, it.opcaoIds);
      if (l) linhas.push({ ...l, qtd: q });
    }
  }
  if (linhas.length === 0) return { ok: false as const, mensagem: "Não consegui montar os itens." };

  // Comanda que segura os itens (mesa = nome + tipo, aparece no topo da cozinha).
  const mesa = `${d.nome.trim().split(" ")[0]} · ${d.tipo === "retirada" ? "RETIRADA" : "ENTREGA"}`;
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({ mesa, peso: 0, tara: 0, valor_buffet: 0, livre: false })
    .select("id, numero")
    .single();
  const comandaId = com?.id as string | undefined;
  if (!comandaId) return { ok: false as const, mensagem: "Não foi possível criar a comanda." };

  const lancamentoId = crypto.randomUUID();
  const obs = (d.observacao || "").trim();
  const rows = linhas.map((l, idx) => ({
    comanda_id: comandaId,
    item_id: l.itemId,
    descricao: l.descricao + (idx === 0 && obs ? `\n📝 ${obs}` : ""),
    qtd: l.qtd,
    preco_unit: l.preco,
    criado_por: uid,
    lancamento_id: lancamentoId,
  }));
  await supabase.from("pdv_comanda_itens").insert(rows);

  // Previsão = agora + tempo de preparo configurado.
  const { data: cfg } = await supabase.from("delivery_config").select("tempo_preparo_min").eq("id", 1).maybeSingle();
  const preparoMin = Number(cfg?.tempo_preparo_min ?? 40) || 40;
  const previsaoEm = new Date(Date.now() + preparoMin * 60000).toISOString();

  // Registro do delivery.
  const { data: ped } = await supabase
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
      desconto: r2(Number(d.desconto) || 0),
      desconto_motivo: (d.descontoMotivo || "").trim() || null,
      forma_pagamento: d.formaPagamento || null,
      troco_para: d.trocoPara ?? null,
      origem: d.origem,
      status: "aceito",
      aceito_em: new Date().toISOString(),
      atendente_id: uid,
      observacao: obs || null,
    })
    .select("id")
    .single();

  // Impressão na cozinha: mesmas impressoras que recebem comanda, roteadas por produto.
  const itemIds = linhas.map((l) => l.itemId).filter(Boolean) as string[];
  const { data: cozinhas } = await supabase
    .from("impressoras").select("id, comanda_produtos").eq("ativo", true).eq("recebe_comandas", true);
  const jobs = ((cozinhas as { id: string; comanda_produtos: string[] | null }[]) ?? [])
    .filter((im) => im.comanda_produtos === null || itemIds.some((id) => im.comanda_produtos!.includes(id)))
    .map((im) => ({ tipo: "comanda", ref_id: lancamentoId, impressora_id: im.id }));
  if (jobs.length > 0) await supabase.from("impressao_fila").insert(jobs);

  revalidatePath("/delivery");
  return { ok: true as const, id: ped?.id as string, numero: com?.numero as number };
}

const CARIMBO: Record<string, string> = {
  aceito: "aceito_em", em_preparo: "preparo_em", pronto: "pronto_em",
  saiu: "saiu_em", entregue: "entregue_em", cancelado: "cancelado_em",
};

export async function definirStatusDelivery(id: string, status: string) {
  const supabase = await createClient();
  if (!(status in CARIMBO) && status !== "pendente") return { ok: false as const };
  const { data: ped } = await supabase.from("delivery_pedidos").select("entregador_id, comanda_id").eq("id", id).single();
  if (status === "saiu" && !ped?.entregador_id) return { ok: false as const, mensagem: "Escolha o entregador antes de despachar." };

  const patch: Record<string, unknown> = { status };
  if (status in CARIMBO) patch[CARIMBO[status]] = new Date().toISOString();
  await supabase.from("delivery_pedidos").update(patch).eq("id", id);

  // Fecha/reabre a comanda junto do ciclo.
  if (ped?.comanda_id) {
    if (status === "entregue" || status === "cancelado") {
      await supabase.from("pdv_comandas").update({ status: "fechada", fechada_em: new Date().toISOString() }).eq("id", ped.comanda_id);
    } else {
      await supabase.from("pdv_comandas").update({ status: "aberta", fechada_em: null }).eq("id", ped.comanda_id);
    }
  }
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirEntregador(id: string, entregadorId: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ entregador_id: entregadorId }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPagoDelivery(id: string, pago: boolean) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ pago }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPrevisao(id: string, previsaoISO: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ previsao_em: previsaoISO }).eq("id", id);
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function reimprimirDelivery(id: string) {
  const supabase = await createClient();
  const { data: ped } = await supabase.from("delivery_pedidos").select("comanda_id").eq("id", id).single();
  if (!ped?.comanda_id) return { ok: false as const };
  const { data: item } = await supabase
    .from("pdv_comanda_itens").select("lancamento_id, item_id").eq("comanda_id", ped.comanda_id).order("criado_em").limit(1).maybeSingle();
  const lanc = item?.lancamento_id as string | undefined;
  if (!lanc) return { ok: false as const };
  const { data: itens } = await supabase.from("pdv_comanda_itens").select("item_id").eq("lancamento_id", lanc);
  const itemIds = (itens ?? []).map((i) => i.item_id).filter(Boolean) as string[];
  const { data: cozinhas } = await supabase.from("impressoras").select("id, comanda_produtos").eq("ativo", true).eq("recebe_comandas", true);
  const jobs = ((cozinhas as { id: string; comanda_produtos: string[] | null }[]) ?? [])
    .filter((im) => im.comanda_produtos === null || itemIds.some((x) => im.comanda_produtos!.includes(x)))
    .map((im) => ({ tipo: "comanda", ref_id: lanc, impressora_id: im.id }));
  if (jobs.length > 0) await supabase.from("impressao_fila").insert(jobs);
  return { ok: true as const, enviado: jobs.length };
}

// ---------- Entregadores ----------
export async function criarEntregador(formData: FormData) {
  const supabase = await createClient();
  const nome = ((formData.get("nome") as string) || "").trim();
  const telefone = ((formData.get("telefone") as string) || "").trim();
  if (!nome) return;
  await supabase.from("entregadores").insert({ nome, telefone: telefone || null });
  revalidatePath("/delivery/entregadores");
}

export async function alternarEntregador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("entregadores").update({ ativo: !ativo }).eq("id", id);
  revalidatePath("/delivery/entregadores");
}

// Calcula a taxa de entrega pela distância (endereço → restaurante).
export async function calcularEntrega(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const supabase = await createClient();
  const { data: cfg } = await supabase
    .from("delivery_config")
    .select("origem_lat, origem_lng, taxa_base, preco_km, raio_max_km, tempo_preparo_min")
    .eq("id", 1)
    .maybeSingle();
  if (cfg?.origem_lat == null || cfg?.origem_lng == null) {
    return { ok: false as const, mensagem: "Configure o endereço do restaurante em Delivery → Config." };
  }
  const partes = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade || "Ivoti", "RS", endereco.cep]
    .map((x) => (x || "").trim()).filter(Boolean);
  const destino = await geocodificar(partes.join(", "));
  if (!destino) return { ok: false as const, mensagem: "Não encontrei esse endereço no mapa. Confira a rua/número." };

  const km = await distanciaKm({ lat: Number(cfg.origem_lat), lng: Number(cfg.origem_lng) }, destino);
  if (km == null) return { ok: false as const, mensagem: "Não consegui medir a distância." };

  const base = Number(cfg.taxa_base ?? 0);
  const porKm = Number(cfg.preco_km ?? 0);
  const taxa = Math.round((base + porKm * km) * 100) / 100;
  const raio = Number(cfg.raio_max_km ?? 0);
  const foraDeArea = raio > 0 && km > raio;
  return {
    ok: true as const,
    distanciaKm: km, taxa, foraDeArea,
    lat: destino.lat, lng: destino.lng,
    aproximado: !temChaveMapa(),
  };
}

// Salva a config do delivery e geocodifica o endereço do restaurante.
export async function salvarConfigDelivery(formData: FormData) {
  const supabase = await createClient();
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
  const origemEndereco = String(formData.get("origem_endereco") ?? "").trim();

  const patch: Record<string, unknown> = {
    id: 1,
    origem_endereco: origemEndereco || null,
    taxa_base: num("taxa_base"),
    preco_km: num("preco_km"),
    raio_max_km: num("raio_max_km"),
    tempo_preparo_min: Math.round(num("tempo_preparo_min")) || 40,
    aberto: formData.get("aberto") === "on",
    atualizado_em: new Date().toISOString(),
  };
  if (origemEndereco) {
    const c = await geocodificar(origemEndereco);
    if (c) { patch.origem_lat = c.lat; patch.origem_lng = c.lng; }
  }
  await supabase.from("delivery_config").upsert(patch, { onConflict: "id" });
  revalidatePath("/delivery/config");
}

// Busca cliente por telefone (autocompleta o Novo pedido).
export async function buscarClientePorTelefone(termo: string) {
  const supabase = await createClient();
  const t = (termo || "").replace(/\D/g, "");
  if (t.length < 4) return [];
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, telefone, logradouro, numero, complemento, bairro, municipio, cep")
    .ilike("telefone", `%${t}%`)
    .limit(6);
  return (data ?? []) as {
    id: string; nome: string; telefone: string | null;
    logradouro: string | null; numero: string | null; complemento: string | null;
    bairro: string | null; municipio: string | null; cep: string | null;
  }[];
}
