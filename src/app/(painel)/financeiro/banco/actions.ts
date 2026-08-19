"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerOfx } from "@/lib/ofx";

export async function importarOfx(texto: string, banco: string) {
  const supabase = await createClient();
  if (!banco?.trim()) return { ok: false, erro: "Escolha o banco do extrato." };
  const trans = lerOfx(texto);
  if (trans.length === 0) return { ok: false, erro: "Nenhuma transação encontrada no arquivo." };

  // Insere ignorando duplicadas — dedup por (banco, fitid).
  let novas = 0;
  for (const t of trans) {
    const { error } = await supabase.from("transacoes_banco").insert({
      data: t.data,
      valor: t.valor,
      descricao: t.descricao,
      fitid: t.fitid,
      banco: banco.trim(),
    });
    if (!error) novas++;
  }
  revalidatePath("/financeiro/banco");
  return { ok: true, total: trans.length, novas };
}

// Cria um lançamento a partir da transação do banco e já concilia.
export async function gerarLancamentoDaTransacao(
  transacaoId: string,
  categoriaId: string,
  observacao?: string,
) {
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("transacoes_banco")
    .select("data, valor, descricao")
    .eq("id", transacaoId)
    .maybeSingle();
  if (!t) return { ok: false, erro: "Transação não encontrada." };

  const { data: l } = await supabase
    .from("lancamentos")
    .insert({
      data: t.data,
      valor: Math.abs(Number(t.valor)),
      descricao:
        observacao?.trim() || (t.descricao as string) || "Lançamento do extrato",
      categoria_id: categoriaId || null,
      origem: "manual",
      pago: true,
      pago_em: t.data,
    })
    .select("id")
    .single();
  if (!l) return { ok: false, erro: "Não foi possível criar o lançamento." };

  await supabase
    .from("transacoes_banco")
    .update({ lancamento_id: l.id })
    .eq("id", transacaoId);
  revalidatePath("/financeiro/banco");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function conciliar(transacaoId: string, lancamentoId: string) {
  const supabase = await createClient();
  await supabase
    .from("transacoes_banco")
    .update({ lancamento_id: lancamentoId })
    .eq("id", transacaoId);
  revalidatePath("/financeiro/banco");
  return { ok: true };
}

// Concilia várias transações de uma vez (cada uma com seu lançamento sugerido).
export async function conciliarVarias(
  pares: { transacaoId: string; lancamentoId: string }[],
) {
  const supabase = await createClient();
  for (const p of pares) {
    if (!p.lancamentoId) continue;
    await supabase
      .from("transacoes_banco")
      .update({ lancamento_id: p.lancamentoId })
      .eq("id", p.transacaoId);
  }
  revalidatePath("/financeiro/banco");
  return { ok: true };
}

export async function desconciliar(transacaoId: string) {
  const supabase = await createClient();
  await supabase
    .from("transacoes_banco")
    .update({ lancamento_id: null })
    .eq("id", transacaoId);
  revalidatePath("/financeiro/banco");
  return { ok: true };
}

export async function excluirTransacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("transacoes_banco").delete().eq("id", id);
  revalidatePath("/financeiro/banco");
}
