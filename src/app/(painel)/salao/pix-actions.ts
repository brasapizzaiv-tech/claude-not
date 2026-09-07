"use server";

import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { criarCobrancaPix, consultarCobrancaPix, gerarTxid, pixBanco, pixConfigurado } from "@/lib/pix";

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
    await supabase.from("pix_cobrancas").insert({
      txid: cob.txid,
      valor: v,
      descricao: descricao || null,
      origem,
      copia_cola: cob.copiaECola,
      banco: pixBanco(),
      criado_por: userData?.user?.id ?? null,
    });
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
    if (c.pago) {
      await supabase.from("pix_cobrancas").update({ status: "pago", pago_em: new Date().toISOString() }).eq("txid", txid);
      return { ok: true as const, pago: true };
    }
    return { ok: true as const, pago: false };
  } catch {
    return { ok: false as const, pago: false };
  }
}

// Caixa desistiu do QR (cliente vai pagar de outro jeito) ou confirmou na mão
// que viu o Pix cair no app do banco.
export async function encerrarPixCaixa(txid: string, como: "cancelado" | "pago") {
  await exigirAcesso(ROTAS);
  const supabase = await createClient();
  await supabase
    .from("pix_cobrancas")
    .update(como === "pago" ? { status: "pago", pago_em: new Date().toISOString() } : { status: "cancelado" })
    .eq("txid", txid)
    .eq("status", "aguardando");
  return { ok: true as const };
}
