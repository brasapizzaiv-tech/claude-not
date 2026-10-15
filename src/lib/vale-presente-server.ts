// Baixa do vale-presente dentro das vendas (caixa do salão e PDV). Quem chama
// dá baixa ANTES de marcar a conta como paga; se a venda não fechar, devolve.
import type { createClient } from "@/lib/supabase/server";
import { formatarCodigo, normalizarCodigo } from "@/lib/vale-presente";

type Db = Awaited<ReturnType<typeof createClient>>;

export type BaixaVale = { usoId: string; valeId: string; codigo: string; para: string | null; saldo: number; valor: number };

export async function debitarVale(
  supabase: Db,
  codigo: string,
  valor: number,
  origem: "caixa" | "pdv",
  comandaId: string | null,
): Promise<{ ok: true; baixa: BaixaVale } | { ok: false; mensagem: string }> {
  const cod = normalizarCodigo(codigo);
  if (!cod) return { ok: false, mensagem: "Digite o código do vale." };
  const { data, error } = await supabase.rpc("vale_presente_debitar", { p_codigo: cod, p_valor: valor, p_origem: origem, p_comanda: comandaId });
  if (error) return { ok: false, mensagem: error.message };
  const r = data as { ok: boolean; erro?: string; uso_id?: string; vale_id?: string; saldo?: number; para?: string | null; codigo?: string };
  if (!r?.ok) return { ok: false, mensagem: `Vale ${formatarCodigo(cod)}: ${r?.erro ?? "não deu baixa."}` };
  return { ok: true, baixa: { usoId: r.uso_id!, valeId: r.vale_id!, codigo: r.codigo ?? cod, para: r.para ?? null, saldo: Number(r.saldo ?? 0), valor } };
}

export async function estornarBaixas(supabase: Db, baixas: BaixaVale[], obs: string) {
  for (const b of baixas) await supabase.rpc("vale_presente_estornar", { p_uso: b.usoId, p_obs: obs });
}

/** Liga a baixa ao movimento do caixa (pra achar a venda pelo vale). */
export async function ligarBaixaAoMov(supabase: Db, b: BaixaVale, movId: string | null) {
  if (movId) await supabase.from("vales_presente_usos").update({ caixa_mov_id: movId }).eq("id", b.usoId);
}

/** Texto que vai na observação do movimento do caixa. */
export const obsDaBaixa = (b: BaixaVale) =>
  `Vale ${formatarCodigo(b.codigo)}${b.para ? ` · ${b.para}` : ""} · ficou ${b.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
