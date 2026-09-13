"use server";

// Ações do app do entregador (/entrega/{token}). Sem login: o token do link
// identifica o boy; tudo roda no servidor com o admin client e só devolve os
// pedidos de entrega que dizem respeito a ele.
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarPedido } from "@/lib/whatsapp";

const r2 = (n: number) => Math.round(n * 100) / 100;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const inicioDiaSP = (iso: string) => `${iso}T00:00:00-03:00`;
const fimDiaSP = (iso: string) => `${iso}T23:59:59-03:00`;

export type Boy = { id: string; nome: string; valor_tele: number | null; valor_fixo_dia: number | null; valor_fixo_noite: number | null };

async function boyDoToken(token: string): Promise<Boy | null> {
  if (!/^[0-9a-f]{16,64}$/i.test(token || "")) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("entregadores").select("id, nome, ativo, valor_tele, valor_fixo_dia, valor_fixo_noite").eq("token", token).maybeSingle();
  const b = data as (Boy & { ativo: boolean }) | null;
  if (!b || !b.ativo) return null;
  return { id: b.id, nome: b.nome, valor_tele: b.valor_tele != null ? Number(b.valor_tele) : null, valor_fixo_dia: b.valor_fixo_dia != null ? Number(b.valor_fixo_dia) : null, valor_fixo_noite: b.valor_fixo_noite != null ? Number(b.valor_fixo_noite) : null };
}

export async function sessaoEntregador(token: string) {
  return boyDoToken(token);
}

export type EntregaBoy = {
  id: string; numero: number | null; nome: string; telefone: string | null;
  endereco: string; referencia: string | null; lat: number | null; lng: number | null;
  status: string; forma_pagamento: string | null; troco_para: number | null; pago: boolean;
  total: number; taxa_entrega: number; taxa_motoboy: number | null;
  previsao_em: string | null; agendado_para: string | null; saiu_em: string | null; entregue_em: string | null;
  observacao: string | null; recebido_forma: string | null; recebido_valor: number | null;
  entregador_id: string | null; area_nome: string | null;
};

const CAMPOS = "id, comanda_id, nome, telefone, logradouro, numero, complemento, bairro, cidade, referencia, lat, lng, status, forma_pagamento, troco_para, pago, taxa_entrega, taxa_motoboy, desconto, previsao_em, agendado_para, saiu_em, entregue_em, observacao, recebido_forma, recebido_valor, entregador_id, area_nome, pdv_comandas(numero)";

type Row = Record<string, unknown> & { comanda_id: string | null; pdv_comandas: { numero: number } | { numero: number }[] | null };

async function montar(rows: Row[]): Promise<EntregaBoy[]> {
  const admin = createAdminClient();
  const ids = [...new Set(rows.map((r) => r.comanda_id).filter(Boolean))] as string[];
  const soma = new Map<string, number>();
  if (ids.length) {
    const { data: itens } = await admin.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", ids);
    for (const it of (itens as { comanda_id: string; qtd: number; preco_unit: number | null }[]) ?? []) {
      soma.set(it.comanda_id, (soma.get(it.comanda_id) ?? 0) + Number(it.qtd) * Number(it.preco_unit || 0));
    }
  }
  return rows.map((r) => {
    const c = Array.isArray(r.pdv_comandas) ? r.pdv_comandas[0] : r.pdv_comandas;
    const sub = soma.get(r.comanda_id ?? "") ?? 0;
    const g = (k: string) => r[k];
    return {
      id: g("id") as string,
      numero: c?.numero ?? null,
      nome: g("nome") as string,
      telefone: (g("telefone") as string) ?? null,
      endereco: [g("logradouro"), g("numero")].filter(Boolean).join(", ") + [g("complemento"), g("bairro"), g("cidade")].filter(Boolean).map((x) => ` · ${x}`).join(""),
      referencia: (g("referencia") as string) ?? null,
      lat: g("lat") != null ? Number(g("lat")) : null,
      lng: g("lng") != null ? Number(g("lng")) : null,
      status: g("status") as string,
      forma_pagamento: (g("forma_pagamento") as string) ?? null,
      troco_para: g("troco_para") != null ? Number(g("troco_para")) : null,
      pago: !!g("pago"),
      total: r2(sub + Number(g("taxa_entrega") ?? 0) - Number(g("desconto") ?? 0)),
      taxa_entrega: Number(g("taxa_entrega") ?? 0),
      taxa_motoboy: g("taxa_motoboy") != null ? Number(g("taxa_motoboy")) : null,
      previsao_em: (g("previsao_em") as string) ?? null,
      agendado_para: (g("agendado_para") as string) ?? null,
      saiu_em: (g("saiu_em") as string) ?? null,
      entregue_em: (g("entregue_em") as string) ?? null,
      observacao: (g("observacao") as string) ?? null,
      recebido_forma: (g("recebido_forma") as string) ?? null,
      recebido_valor: g("recebido_valor") != null ? Number(g("recebido_valor")) : null,
      entregador_id: (g("entregador_id") as string) ?? null,
      area_nome: (g("area_nome") as string) ?? null,
    };
  });
}

// Fila do boy: as dele (a caminho ou esperando sair), as prontas sem ninguém
// (pra "pegar") e as que ele já entregou hoje.
export async function minhasEntregas(token: string) {
  const b = await boyDoToken(token);
  if (!b) return null;
  const admin = createAdminClient();
  const hoje = hojeSP();
  const [{ data: minhas }, { data: livres }, { data: feitas }] = await Promise.all([
    admin.from("delivery_pedidos").select(CAMPOS).eq("tipo", "entrega").eq("entregador_id", b.id).in("status", ["aceito", "em_preparo", "pronto", "saiu"]).order("saiu_em", { ascending: true, nullsFirst: false }).order("previsao_em"),
    admin.from("delivery_pedidos").select(CAMPOS).eq("tipo", "entrega").is("entregador_id", null).in("status", ["pronto", "em_preparo"]).order("previsao_em"),
    admin.from("delivery_pedidos").select(CAMPOS).eq("tipo", "entrega").eq("entregador_id", b.id).eq("status", "entregue").gte("entregue_em", inicioDiaSP(hoje)).order("entregue_em", { ascending: false }),
  ]);
  return {
    boy: b,
    minhas: await montar((minhas as Row[]) ?? []),
    disponiveis: await montar((livres as Row[]) ?? []),
    entreguesHoje: await montar((feitas as Row[]) ?? []),
  };
}

// "Peguei essa": vincula um pedido ao boy. ref = id do pedido (QR do cupom,
// "ENTREGA:<id>") ou o nº da comanda digitado.
export async function pegarEntrega(token: string, ref: string) {
  const b = await boyDoToken(token);
  if (!b) return { ok: false as const, mensagem: "Link inválido." };
  const admin = createAdminClient();
  const txt = (ref || "").trim();
  const uuid = txt.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null;
  let pedidoId: string | null = null;
  if (uuid) {
    const { data } = await admin.from("delivery_pedidos").select("id").or(`id.eq.${uuid},comanda_id.eq.${uuid}`).limit(1).maybeSingle();
    pedidoId = (data as { id: string } | null)?.id ?? null;
  } else if (/^\d{1,6}$/.test(txt)) {
    const { data: com } = await admin.from("pdv_comandas").select("id").eq("numero", Number(txt)).eq("status", "aberta").order("aberta_em", { ascending: false }).limit(1).maybeSingle();
    if (com) {
      const { data } = await admin.from("delivery_pedidos").select("id").eq("comanda_id", (com as { id: string }).id).limit(1).maybeSingle();
      pedidoId = (data as { id: string } | null)?.id ?? null;
    }
  }
  if (!pedidoId) return { ok: false as const, mensagem: "Não achei esse pedido." };
  const { data: p } = await admin.from("delivery_pedidos").select("id, tipo, status, entregador_id").eq("id", pedidoId).single();
  const ped = p as { id: string; tipo: string; status: string; entregador_id: string | null } | null;
  if (!ped) return { ok: false as const, mensagem: "Não achei esse pedido." };
  if (ped.tipo !== "entrega") return { ok: false as const, mensagem: "Esse pedido é de retirada." };
  if (["entregue", "cancelado"].includes(ped.status)) return { ok: false as const, mensagem: "Esse pedido já foi finalizado." };
  if (ped.entregador_id && ped.entregador_id !== b.id) {
    const { data: outro } = await admin.from("entregadores").select("nome").eq("id", ped.entregador_id).maybeSingle();
    return { ok: false as const, mensagem: `Esse pedido já está com ${(outro as { nome: string } | null)?.nome ?? "outro entregador"}.` };
  }
  await admin.from("delivery_pedidos").update({ entregador_id: b.id }).eq("id", ped.id);
  return { ok: true as const, id: ped.id };
}

// "Saí com essas": vira "saiu" e fixa quanto o boy ganha em cada uma
// (taxa da área, senão o valor por tele do boy).
export async function sairComEntregas(token: string, ids: string[]) {
  const b = await boyDoToken(token);
  if (!b) return { ok: false as const, mensagem: "Link inválido." };
  const admin = createAdminClient();
  const lista = (ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!lista.length) return { ok: false as const, mensagem: "Marque pelo menos uma entrega." };
  const { data: peds } = await admin.from("delivery_pedidos").select("id, status, entregador_id, area_id, taxa_motoboy").in("id", lista);
  const agora = new Date().toISOString();
  let n = 0;
  for (const p of (peds as { id: string; status: string; entregador_id: string | null; area_id: string | null; taxa_motoboy: number | null }[]) ?? []) {
    if (p.entregador_id && p.entregador_id !== b.id) continue;
    if (!["aceito", "em_preparo", "pronto"].includes(p.status)) continue;
    let taxaBoy = p.taxa_motoboy != null ? Number(p.taxa_motoboy) : null;
    if (taxaBoy == null && p.area_id) {
      const { data: a } = await admin.from("delivery_areas").select("taxa_motoboy").eq("id", p.area_id).maybeSingle();
      const t = (a as { taxa_motoboy: number | null } | null)?.taxa_motoboy;
      if (t != null) taxaBoy = Number(t);
    }
    if (taxaBoy == null) taxaBoy = b.valor_tele ?? 0;
    await admin.from("delivery_pedidos").update({ entregador_id: b.id, status: "saiu", saiu_em: agora, taxa_motoboy: taxaBoy }).eq("id", p.id);
    await avisarPedido(p.id, "saiu");
    n++;
  }
  return { ok: true as const, n };
}

// "Entreguei": fecha o pedido com o que foi recebido na porta.
export async function marcarEntregue(token: string, id: string, recebido: { forma: string; valor: number }) {
  const b = await boyDoToken(token);
  if (!b) return { ok: false as const, mensagem: "Link inválido." };
  const admin = createAdminClient();
  const { data: p } = await admin.from("delivery_pedidos").select("id, status, entregador_id, comanda_id, pago").eq("id", id).maybeSingle();
  const ped = p as { id: string; status: string; entregador_id: string | null; comanda_id: string | null; pago: boolean } | null;
  if (!ped || ped.entregador_id !== b.id) return { ok: false as const, mensagem: "Esse pedido não está com você." };
  if (ped.status === "entregue") return { ok: true as const };
  const forma = ["Dinheiro", "Cartão", "Pix", "Já pago"].includes(recebido.forma) ? recebido.forma : "Já pago";
  const valor = forma === "Já pago" ? 0 : Math.max(0, r2(Number(recebido.valor) || 0));
  const agora = new Date().toISOString();
  await admin.from("delivery_pedidos").update({
    status: "entregue", entregue_em: agora, saiu_em: ped.status === "saiu" ? undefined : agora,
    pago: true, recebido_forma: forma, recebido_valor: valor,
    ...(forma !== "Já pago" && !ped.pago ? { forma_pagamento: forma } : {}),
  }).eq("id", ped.id);
  if (ped.comanda_id) await admin.from("pdv_comandas").update({ status: "fechada", fechada_em: agora }).eq("id", ped.comanda_id);
  await avisarPedido(ped.id, "entregue");
  return { ok: true as const };
}

// Posição do GPS (a cada ~15 s com o app aberto).
export async function registrarPosicao(token: string, lat: number, lng: number, precisao: number | null) {
  const b = await boyDoToken(token);
  if (!b) return { ok: false as const };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false as const };
  const admin = createAdminClient();
  const em = new Date().toISOString();
  await Promise.all([
    admin.from("entregadores").update({ ultima_lat: lat, ultima_lng: lng, ultima_pos_em: em }).eq("id", b.id),
    admin.from("entregador_posicoes").insert({ entregador_id: b.id, lat, lng, precisao: precisao != null && Number.isFinite(precisao) ? Math.round(precisao) : null }),
  ]);
  return { ok: true as const };
}

// Meus ganhos no mês: entregas, o que ganhou por tele, o que recebeu na porta
// por forma e os acertos já pagos.
export async function meusGanhos(token: string, ano: number, mes: number) {
  const b = await boyDoToken(token);
  if (!b) return null;
  const admin = createAdminClient();
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  const [{ data: peds }, { data: acertos }] = await Promise.all([
    admin.from("delivery_pedidos").select("taxa_motoboy, recebido_forma, recebido_valor, entregue_em").eq("entregador_id", b.id).eq("status", "entregue").gte("entregue_em", inicioDiaSP(ini)).lte("entregue_em", fimDiaSP(fim)),
    admin.from("entregador_acertos").select("data, fixo, teles_qtd, teles_valor, total, obs").eq("entregador_id", b.id).gte("data", ini).lte("data", fim).order("data", { ascending: false }),
  ]);
  const rows = (peds as { taxa_motoboy: number | null; recebido_forma: string | null; recebido_valor: number | null }[]) ?? [];
  const porForma = { Dinheiro: 0, Cartão: 0, Pix: 0 } as Record<string, number>;
  let teles = 0;
  for (const r of rows) {
    teles += Number(r.taxa_motoboy ?? 0);
    if (r.recebido_forma && r.recebido_forma in porForma) porForma[r.recebido_forma] += Number(r.recebido_valor ?? 0);
  }
  const ac = (acertos as { data: string; fixo: number; teles_qtd: number; teles_valor: number; total: number; obs: string | null }[]) ?? [];
  return {
    entregas: rows.length,
    teles: r2(teles),
    fixos: r2(ac.reduce((s, a) => s + Number(a.fixo), 0)),
    porForma,
    acertos: ac.map((a) => ({ ...a, fixo: Number(a.fixo), teles_valor: Number(a.teles_valor), total: Number(a.total) })),
  };
}

export async function historicoEntregas(token: string, data: string) {
  const b = await boyDoToken(token);
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("delivery_pedidos").select(CAMPOS)
    .eq("entregador_id", b.id)
    .or(`and(entregue_em.gte.${inicioDiaSP(data)},entregue_em.lte.${fimDiaSP(data)}),and(saiu_em.gte.${inicioDiaSP(data)},saiu_em.lte.${fimDiaSP(data)})`)
    .order("entregue_em", { ascending: false });
  return montar((rows as Row[]) ?? []);
}
