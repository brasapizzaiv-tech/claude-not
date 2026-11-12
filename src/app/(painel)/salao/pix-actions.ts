"use server";

import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { cancelarCobrancaPix, criarCobrancaPix, consultarCobrancaPix, devolverPix, gerarTxid, pixBanco, pixConfigurado } from "@/lib/pix";
import { moedaBR } from "@/lib/format";

const ROTAS = ["/salao", "/pdv"];

// Gera uma cobrança Pix (QR na tela) pro valor informado. Usada pelo caixa do
// salão e pelo PDV de balcão. Fica registrada em pix_cobrancas.
export async function gerarPixCaixa(valor: number, descricao: string, origem: "caixa" | "pdv" = "caixa") {
  await exigirAcesso(ROTAS);
  if (!pixConfigurado()) return { ok: false as const, erro: "Pix online não configurado." };
  const v = Math.round(Number(valor) * 100) / 100;
  if (!(v > 0)) return { ok: false as const, erro: "Valor inválido." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  try {
    const cob = await criarCobrancaPix({ txid: gerarTxid(), valor: v, expiracaoSeg: 1800, descricao: descricao || "Brasa" });
    const { error: errGravar } = await supabase.from("pix_cobrancas").insert({
      txid: cob.txid,
      valor: v,
      descricao: descricao || null,
      origem,
      copia_cola: cob.copiaECola,
      banco: pixBanco(),
      criado_por: userData?.user?.id ?? null,
    });
    // Sem o registro, o Pix pago não aparece em Pix recebidos nem pode ser
    // estornado (PAG-10): não mostra o QR; cancela a cobrança no banco.
    if (errGravar) {
      await cancelarCobrancaPix(cob.txid).catch(() => {});
      return { ok: false as const, erro: "não consegui registrar a cobrança no sistema" };
    }
    return { ok: true as const, txid: cob.txid, copiaECola: cob.copiaECola };
  } catch (e) {
    return { ok: false as const, erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

// Consulta no banco se a cobrança caiu. Quando cai, marca como paga.
export async function consultarPixCaixa(txid: string) {
  await exigirAcesso(ROTAS);
  const supabase = await createClient();
  const { data } = await supabase.from("pix_cobrancas").select("status").eq("txid", txid).maybeSingle();
  const atual = (data as { status: string } | null)?.status;
  if (atual === "pago") return { ok: true as const, pago: true };
  if (atual === "cancelado") return { ok: true as const, pago: false, cancelado: true };
  try {
    const c = await consultarCobrancaPix(txid);
    // Guarda o que o banco respondeu (pra conferência quando algo estranho acontecer).
    const statusBanco = `${c.status} pix=${c.temPix ? c.recebido.toFixed(2) : "-"} orig=${c.original.toFixed(2)} ${c.ambiente}`;
    if (c.pago) {
      await supabase
        .from("pix_cobrancas")
        .update({ status: "pago", pago_em: new Date().toISOString(), status_banco: statusBanco, valor_recebido: c.recebido, e2eid: c.e2eid })
        .eq("txid", txid);
      return { ok: true as const, pago: true };
    }
    await supabase.from("pix_cobrancas").update({ status_banco: statusBanco }).eq("txid", txid);
    return { ok: true as const, pago: false };
  } catch {
    return { ok: false as const, pago: false };
  }
}

// Caixa desistiu do QR (cliente vai pagar de outro jeito) ou confirmou na mão
// que viu o Pix cair no app do banco.
//
// Cancelar (PAG-02): pergunta ao banco antes. Se o Pix já caiu, NÃO cancela:
// devolve pago=true pra tela receber como Pix (ou, se a conta já foi fechada de
// outro jeito, fica registrado como "PAGO SEM VENDA", pra devolver ou acertar).
// Se não caiu, cancela também no banco, pra o QR deixar de ser pagável.
export async function encerrarPixCaixa(
  txid: string,
  como: "cancelado" | "pago",
  /** A conta ainda está na tela: se já foi pago, a tela recebe como Pix (não é "sem venda"). */
  aindaNaConta = false,
): Promise<{ ok: true; pago?: boolean; valor?: number }> {
  await exigirAcesso(ROTAS);
  const supabase = await createClient();
  if (como === "pago") {
    await supabase
      .from("pix_cobrancas")
      .update({ status: "pago", pago_em: new Date().toISOString() })
      .eq("txid", txid)
      .eq("status", "aguardando");
    return { ok: true as const };
  }
  // Já resolvida (paga pela consulta, confirmada na mão, cancelada antes): não
  // pergunta ao banco nem cancela lá — isso atrasava o "Pagar" seguinte e podia
  // remover uma cobrança que o caixa já deu como paga.
  const { data: reg } = await supabase.from("pix_cobrancas").select("status").eq("txid", txid).maybeSingle();
  const stReg = (reg as { status: string } | null)?.status;
  if (stReg && stReg !== "aguardando") return { ok: true as const, ...(stReg === "pago" ? { pago: true } : {}) };
  try {
    const c = await consultarCobrancaPix(txid);
    if (c.pago) {
      const { data: atual } = await supabase.from("pix_cobrancas").select("descricao").eq("txid", txid).maybeSingle();
      const desc = (atual as { descricao: string | null } | null)?.descricao ?? "";
      await supabase
        .from("pix_cobrancas")
        .update({
          status: "pago",
          pago_em: new Date().toISOString(),
          valor_recebido: c.recebido,
          e2eid: c.e2eid,
          status_banco: `${c.status} pix=${c.recebido.toFixed(2)} — pago quando o caixa ia cancelar`,
          descricao: aindaNaConta || desc.startsWith("PAGO SEM VENDA") ? desc : `PAGO SEM VENDA — ${desc}`.slice(0, 200),
        })
        .eq("txid", txid)
        .eq("status", "aguardando");
      return { ok: true as const, pago: true, valor: c.recebido };
    }
  } catch {
    // Banco sem responder: cancela no sistema mesmo assim e tenta cancelar lá.
  }
  let noBanco = "cancelado no banco";
  try {
    await cancelarCobrancaPix(txid);
  } catch (e) {
    noBanco = `não consegui cancelar no banco (${(e instanceof Error ? e.message : String(e)).slice(0, 60)})`;
  }
  await supabase
    .from("pix_cobrancas")
    .update({ status: "cancelado", status_banco: noBanco })
    .eq("txid", txid)
    .eq("status", "aguardando");
  return { ok: true as const };
}

// Estorno (devolução) de um Pix recebido, pela API do banco. Funciona pra
// cobranças do caixa/PDV (pix_cobrancas) e do app de pedidos (delivery_pedidos).
// Não reabre comanda nem mexe no caixa — só devolve o dinheiro e registra.
export async function estornarPix(txid: string, valor: number, motivo: string) {
  await exigirAcesso("/salao");
  const v = Math.round(Number(valor) * 100) / 100;
  const just = (motivo || "").trim();
  if (!(v > 0)) return { ok: false as const, erro: "Valor inválido." };
  if (just.length < 3) return { ok: false as const, erro: "Informe o motivo." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  type Cob = { txid: string; valor: number; status: string; e2eid: string | null; valor_devolvido: number; devolucoes: unknown[] };
  const cob = (await supabase.from("pix_cobrancas").select("txid, valor, status, e2eid, valor_devolvido, devolucoes").eq("txid", txid).maybeSingle()).data as Cob | null;

  // DEL-03: o Pix do app de pedidos nasce com linha em pix_cobrancas (src/lib/delivery-pix.ts).
  if (!cob) return { ok: false as const, erro: "Cobrança não encontrada." };
  if (cob.status !== "pago") return { ok: false as const, erro: "Só dá pra estornar Pix que foi pago." };
  const resta = Math.round((Number(cob.valor) - Number(cob.valor_devolvido ?? 0)) * 100) / 100;
  if (v > resta + 0.005) return { ok: false as const, erro: `Só dá pra devolver até ${moedaBR(resta)}.` };

  // Identificador do Pix recebido (e2eid): vem da consulta ao banco.
  let e2eid = cob.e2eid;
  if (!e2eid) {
    try {
      const c = await consultarCobrancaPix(txid);
      e2eid = c.e2eid;
      if (e2eid) await supabase.from("pix_cobrancas").update({ e2eid, valor_recebido: c.recebido }).eq("txid", txid);
    } catch (e) {
      return { ok: false as const, erro: `Não consegui consultar o banco: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}` };
    }
  }
  if (!e2eid) return { ok: false as const, erro: "O banco não informou o identificador desse Pix (ainda não consta como recebido)." };

  const idDev = ("D" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 35);
  let dev: Awaited<ReturnType<typeof devolverPix>>;
  try {
    dev = await devolverPix(e2eid, idDev, v);
  } catch (e) {
    // Tempo esgotado: o banco pode ter feito a devolução sem a resposta chegar.
    // Tentar de novo geraria OUTRA devolução (id novo) — então manda conferir antes.
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false as const, erro: "O banco demorou pra responder e a devolução PODE ter sido feita. Confira no extrato do Sicoob antes de tentar de novo." };
    }
    return { ok: false as const, erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }

  const registro = { id: dev.id, rtrId: dev.rtrId, valor: v, motivo: just, por: userData?.user?.email ?? userData?.user?.id ?? null, em: new Date().toISOString(), status: dev.status };
  await supabase
    .from("pix_cobrancas")
    .update({
      valor_devolvido: Math.round((Number(cob.valor_devolvido ?? 0) + v) * 100) / 100,
      devolucoes: [...((cob.devolucoes as unknown[]) ?? []), registro],
    })
    .eq("txid", txid);
  return { ok: true as const, status: dev.status === "DEVOLVIDO" ? "concluída" : "em processamento" };
}
