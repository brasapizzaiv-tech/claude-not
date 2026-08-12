"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerOfx } from "@/lib/ofx";

export async function importarOfx(texto: string) {
  const supabase = await createClient();
  const trans = lerOfx(texto);
  if (trans.length === 0) return { ok: false, erro: "Nenhuma transação encontrada no arquivo." };

  // Insere ignorando duplicadas (fitid único).
  let novas = 0;
  for (const t of trans) {
    const { error } = await supabase.from("transacoes_banco").insert({
      data: t.data,
      valor: t.valor,
      descricao: t.descricao,
      fitid: t.fitid,
    });
    if (!error) novas++;
  }
  revalidatePath("/financeiro/banco");
  return { ok: true, total: trans.length, novas };
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
