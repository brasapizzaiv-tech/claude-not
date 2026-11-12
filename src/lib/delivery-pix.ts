// Pix pago no app do cliente (/pedir) — Onda 5 do delivery próprio.
//
// DEL-01: ao cair o Pix, a venda entra no caixa aberto (antes só marcava o
//         pedido como pago e a venda ficava fora do caixa e do faturamento).
// DEL-02: quem confere não é só a tela do cliente — a rotina de 5 em 5 min
//         (/api/delivery/pix) chama a mesma função, então quem paga e fecha o
//         navegador não fica com o pedido "não pago" (e o boy não cobra de novo).
// DEL-03: a cobrança do app ganha linha em pix_cobrancas (origem "delivery"),
//         então aparece na lista de Pix do caixa e o estorno acha.
// DEL-10: Pix que cai num pedido já cancelado (ou já recebido de outro jeito)
//         não vira "pago" calado: fica "pago_devolver" e aparece na Saúde.
//
// Roda com a chave administrativa (o app do cliente não tem login): a empresa
// vem SEMPRE do próprio pedido e entra escrita em cada consulta.
import type { createAdminClient } from "@/lib/supabase/admin";
import { consultarCobrancaPix, pixBanco } from "@/lib/pix";
import { registrarErro } from "@/lib/saude";
import { moedaBR } from "@/lib/format";

type Admin = ReturnType<typeof createAdminClient>;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const FORMA_PIX_APP = "Pix online";
// pix_status: "aguardando" → "pago" (venda nossa, vai pro caixa) ou
// "pago_devolver" (caiu num pedido cancelado ou que já tinha sido recebido de
// outro jeito: NUNCA vai pro caixa; a Saúde avisa pra devolver).
export const PIX_DEVOLVER = "pago_devolver";

type PedidoPix = {
  id: string; empresa_id: string; comanda_id: string | null; cliente_id: string | null; nome: string; tipo: string;
  taxa_entrega: number | null; desconto: number | null; numero_turno: number | null; status: string; pago: boolean;
  forma_pagamento: string | null; pix_txid: string | null; pix_status: string | null; pix_mov_id: string | null;
};
const CAMPOS = "id, empresa_id, comanda_id, cliente_id, nome, tipo, taxa_entrega, desconto, numero_turno, status, pago, forma_pagamento, pix_txid, pix_status, pix_mov_id";

/** Guarda a cobrança do app junto das do caixa (lista de Pix e estorno). false = não gravou (não mostrar o QR). */
export async function registrarCobrancaApp(db: Admin, d: { empresaId: string; txid: string; valor: number; copiaECola: string; descricao: string }): Promise<boolean> {
  const { error } = await db.from("pix_cobrancas").insert({
    empresa_id: d.empresaId, txid: d.txid, valor: r2(d.valor), descricao: d.descricao.slice(0, 200), origem: "delivery",
    status: "aguardando", copia_cola: d.copiaECola, banco: pixBanco(),
  });
  if (error) {
    await registrarErro("delivery:pix-registrar", error, { txid: d.txid }, d.empresaId);
    return false;
  }
  return true;
}

/**
 * Lança no caixa aberto a venda de um pedido com Pix do app já pago. Pode ser
 * chamada várias vezes: só a primeira grava (pix_mov_id é a trava). Sem caixa
 * aberto não faz nada — a rotina tenta de novo até o caixa abrir.
 */
export async function lancarPixAppNoCaixa(db: Admin, pedidoId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data } = await db.from("delivery_pedidos").select(CAMPOS).eq("id", pedidoId).maybeSingle();
  const p = data as PedidoPix | null;
  if (!p) return { ok: false, motivo: "pedido não encontrado" };
  if (p.pix_mov_id) return { ok: true };
  // Só a venda que o PIX DO APP pagou: um pedido recebido no caixa com o Pix
  // caindo depois não entra de novo (esse vira "pago_devolver").
  if (p.status === "cancelado" || p.pix_status !== "pago" || !p.pago || p.forma_pagamento !== FORMA_PIX_APP) {
    return { ok: false, motivo: "não é Pix do app pago de pedido ativo" };
  }

  const { data: cx } = await db.from("pdv_caixas").select("id").eq("empresa_id", p.empresa_id).eq("status", "aberto")
    .order("aberto_em", { ascending: false }).limit(1).maybeSingle();
  if (!cx?.id) return { ok: false, motivo: "caixa fechado" };

  // O valor é o que o cliente PAGOU (a cobrança), não o total recalculado agora.
  const { data: cob } = await db.from("pix_cobrancas").select("valor, valor_recebido, valor_devolvido")
    .eq("txid", p.pix_txid ?? "").eq("empresa_id", p.empresa_id).maybeSingle();
  const cb = cob as { valor: number; valor_recebido: number | null; valor_devolvido: number | null } | null;
  if (cb && Number(cb.valor_devolvido ?? 0) > 0) return { ok: false, motivo: "Pix já devolvido" };
  const valor = r2(Number(cb?.valor_recebido ?? cb?.valor ?? 0));
  if (!(valor > 0)) return { ok: false, motivo: "cobrança sem valor" };

  const numero = p.numero_turno ?? "?";
  const { data: mov, error } = await db.from("pdv_caixa_mov").insert({
    empresa_id: p.empresa_id, caixa_id: cx.id, tipo: "venda", descricao: `Delivery #${numero} · ${p.nome} (Pix do app)`,
    forma_pagamento: FORMA_PIX_APP, valor, comanda_id: p.comanda_id,
  }).select("id").single();
  if (error || !mov) {
    await registrarErro("delivery:pix-caixa", error ?? "sem movimento", { pedido: p.id }, p.empresa_id);
    return { ok: false, motivo: "não gravou no caixa" };
  }
  const movId = (mov as { id: string }).id;
  // Trava: se outra chamada lançou ao mesmo tempo (ou o pedido acabou de ser cancelado), desfaz a nossa.
  const { data: travou } = await db.from("delivery_pedidos").update({ pix_mov_id: movId })
    .eq("id", p.id).is("pix_mov_id", null).neq("status", "cancelado").select("id");
  if (!travou || travou.length === 0) {
    await db.from("pdv_caixa_mov").delete().eq("id", movId);
    return { ok: true };
  }
  if (p.comanda_id) {
    const { data: itens } = await db.from("pdv_comanda_itens").select("id, qtd, preco_unit, pago").eq("comanda_id", p.comanda_id);
    for (const i of (itens ?? []) as { id: string; qtd: number; preco_unit: number | null; pago: boolean }[]) {
      if (i.pago) continue;
      const v = r2(Number(i.qtd) * Number(i.preco_unit || 0));
      await db.from("pdv_comanda_itens").update({ valor_pago: v, base_pago: v, pago: true }).eq("id", i.id);
    }
    await db.from("pdv_comandas").update({ forma_pagamento: FORMA_PIX_APP, servico: 0, ...(p.cliente_id ? { cliente_id: p.cliente_id } : {}) }).eq("id", p.comanda_id);
  }
  return { ok: true };
}

/** Consulta o banco e, se o Pix caiu, marca o pedido pago e lança no caixa. */
export async function confirmarPixApp(db: Admin, pedidoId: string): Promise<{ ok: boolean; pago: boolean; cancelado?: boolean }> {
  const { data } = await db.from("delivery_pedidos").select(CAMPOS).eq("id", pedidoId).maybeSingle();
  const p = data as PedidoPix | null;
  if (!p?.pix_txid) return { ok: false, pago: false };
  if (p.pix_status === "pago") {
    if (p.status !== "cancelado" && !p.pix_mov_id) await lancarPixAppNoCaixa(db, p.id);
    return { ok: true, pago: true, cancelado: p.status === "cancelado" };
  }
  if (p.pix_status === PIX_DEVOLVER) return { ok: true, pago: true, cancelado: p.status === "cancelado" };
  if (p.pix_status !== "aguardando") return { ok: true, pago: false };

  let c: Awaited<ReturnType<typeof consultarCobrancaPix>>;
  try { c = await consultarCobrancaPix(p.pix_txid); } catch { return { ok: true, pago: false }; }
  if (!c.pago) return { ok: true, pago: false };

  const agora = new Date().toISOString();
  await db.from("pix_cobrancas").update({ status: "pago", pago_em: agora, valor_recebido: c.recebido, e2eid: c.e2eid })
    .eq("txid", p.pix_txid).eq("empresa_id", p.empresa_id).eq("status", "aguardando");

  // Vira pago SÓ se o pedido segue ativo e ainda não foi recebido de outro
  // jeito — conferido no próprio update (o cancelamento ou o "Receber" podem
  // acontecer entre a leitura e aqui).
  const { data: virou } = await db.from("delivery_pedidos")
    .update({ pago: true, pix_status: "pago", forma_pagamento: FORMA_PIX_APP })
    .eq("id", p.id).eq("pix_status", "aguardando").eq("pago", false).neq("status", "cancelado").select("id");
  if (virou && virou.length) {
    await lancarPixAppNoCaixa(db, p.id);
    return { ok: true, pago: true };
  }

  // Não virou: outra chamada já marcou, o pedido foi cancelado, ou já tinha sido recebido.
  const { data: d2 } = await db.from("delivery_pedidos").select(CAMPOS).eq("id", p.id).maybeSingle();
  const p2 = d2 as PedidoPix | null;
  if (!p2 || p2.pix_status === "pago" || p2.pix_status === PIX_DEVOLVER) {
    return { ok: true, pago: true, cancelado: p2?.status === "cancelado" };
  }
  const { data: marcou } = await db.from("delivery_pedidos").update({ pix_status: PIX_DEVOLVER })
    .eq("id", p.id).eq("pix_status", "aguardando").select("id");
  if (marcou && marcou.length) {
    const porque = p2.status === "cancelado"
      ? "que já estava cancelado"
      : `que já tinha sido recebido${p2.forma_pagamento ? ` em ${p2.forma_pagamento}` : ""} (pago em dobro)`;
    await registrarErro(
      "delivery:pix-devolver",
      `Pix de ${moedaBR(c.recebido)} pago no pedido #${p2.numero_turno ?? "?"} (${p2.nome}), ${porque}. Devolva em Caixa → Pix.`,
      { pedido: p.id, txid: p.pix_txid },
      p.empresa_id,
    );
  }
  return { ok: true, pago: true, cancelado: p2.status === "cancelado" };
}

// Em grupos de 5: cada consulta ao banco pode levar até 8 s e a rotina tem 60 s.
async function emGrupos<T>(lista: T[], fn: (x: T) => Promise<boolean>) {
  let n = 0;
  for (let i = 0; i < lista.length; i += 5) {
    n += (await Promise.all(lista.slice(i, i + 5).map(fn))).filter(Boolean).length;
  }
  return n;
}

/** Rotina (DEL-02): confere os Pix do app esperando e lança os pagos que ficaram sem caixa. */
export async function conferirPixDoApp(db: Admin) {
  const agora = Date.now();
  const [{ data: esperando }, { data: semCaixa }] = await Promise.all([
    // A cobrança vale 30 min: as das últimas 3 h bastam (as mais novas primeiro).
    db.from("delivery_pedidos").select("id").eq("pix_status", "aguardando").not("pix_txid", "is", null)
      .gte("pix_criado_em", new Date(agora - 3 * 3600_000).toISOString())
      .order("pix_criado_em", { ascending: false }).limit(25),
    // Pagos pelo Pix do app esperando o caixa abrir (no máximo 7 dias pra trás).
    db.from("delivery_pedidos").select("id").eq("pix_status", "pago").eq("pago", true).eq("forma_pagamento", FORMA_PIX_APP)
      .is("pix_mov_id", null).neq("status", "cancelado")
      .gte("pix_criado_em", new Date(agora - 7 * 86400_000).toISOString())
      .order("pix_criado_em").limit(50),
  ]);
  const esp = (esperando ?? []) as { id: string }[];
  const sc = (semCaixa ?? []) as { id: string }[];
  const pagos = await emGrupos(esp, async ({ id }) => (await confirmarPixApp(db, id)).pago);
  const lancados = await emGrupos(sc, async ({ id }) => (await lancarPixAppNoCaixa(db, id)).ok);
  return { esperando: esp.length, pagos, semCaixa: sc.length, lancados };
}
