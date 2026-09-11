"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerOfx } from "@/lib/ofx";
import { lancarNota } from "@/app/(painel)/notas/actions";
import { exigirAcesso } from "@/lib/permissoes-server";

export async function importarOfx(texto: string, banco: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  if (!banco?.trim()) return { ok: false, erro: "Escolha o banco do extrato." };
  const trans = lerOfx(texto);
  if (trans.length === 0) return { ok: false, erro: "Nenhuma transação encontrada no arquivo." };

  // Repetida = mesmo código de transação (fitid) já importado deste banco OU
  // importado antigamente sem banco. Em 11/09 o extrato de agosto entrou duas
  // vezes (a 1ª sem escolher o banco) e 245 transações duplicaram na tela —
  // a regra antiga só olhava (banco, fitid) e tratava "sem banco" como outro banco.
  const bancoNome = banco.trim();
  const fitids = [...new Set(trans.map((t) => t.fitid).filter(Boolean))];
  const jaTem = new Set<string>();
  for (let i = 0; i < fitids.length; i += 200) {
    const lote = fitids.slice(i, i + 200);
    const { data: existentes } = await supabase
      .from("transacoes_banco")
      .select("fitid")
      .in("fitid", lote)
      .or(`banco.eq.${bancoNome},banco.is.null`);
    for (const e of (existentes as { fitid: string }[]) ?? []) jaTem.add(e.fitid);
  }

  let novas = 0;
  let repetidas = 0;
  for (const t of trans) {
    if (t.fitid && jaTem.has(t.fitid)) { repetidas++; continue; }
    const { error } = await supabase.from("transacoes_banco").insert({
      data: t.data,
      valor: t.valor,
      descricao: t.descricao,
      fitid: t.fitid,
      banco: bancoNome,
    });
    if (!error) { novas++; if (t.fitid) jaTem.add(t.fitid); }
    else repetidas++;
  }
  revalidatePath("/financeiro/banco");
  return { ok: true, total: trans.length, novas, repetidas };
}

// Cria um lançamento a partir da transação do banco e já concilia.
export async function gerarLancamentoDaTransacao(
  transacaoId: string,
  categoriaId: string,
  observacao?: string,
) {
  await exigirAcesso("/financeiro");
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
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("transacoes_banco")
    .select("data")
    .eq("id", transacaoId)
    .maybeSingle();
  await supabase
    .from("transacoes_banco")
    .update({ lancamento_id: lancamentoId })
    .eq("id", transacaoId);
  // Conciliou = o dinheiro saiu/entrou no banco → marca a conta como paga.
  await supabase
    .from("lancamentos")
    .update({ pago: true, pago_em: (t?.data as string) ?? null })
    .eq("id", lancamentoId);
  revalidatePath("/financeiro/banco");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

// Lança uma nota pendente e já concilia com a transação do banco (marcando paga).
export async function lancarNotaEConciliar(transacaoId: string, notaId: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("transacoes_banco")
    .select("data")
    .eq("id", transacaoId)
    .maybeSingle();
  await lancarNota(notaId, {});
  const { data: lancs } = await supabase
    .from("lancamentos")
    .select("id")
    .eq("nota_id", notaId);
  const ids = ((lancs as { id: string }[]) ?? []).map((l) => l.id);
  if (ids.length > 0) {
    await supabase
      .from("lancamentos")
      .update({ pago: true, pago_em: (t?.data as string) ?? null })
      .in("id", ids);
    await supabase
      .from("transacoes_banco")
      .update({ lancamento_id: ids[0] })
      .eq("id", transacaoId);
  }
  revalidatePath("/financeiro/banco");
  revalidatePath("/notas");
  revalidatePath("/financeiro/contas");
  return { ok: ids.length > 0 };
}

// Concilia várias transações de uma vez (cada uma com seu lançamento sugerido).
export async function conciliarVarias(
  pares: { transacaoId: string; lancamentoId: string }[],
) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  for (const p of pares) {
    if (!p.lancamentoId) continue;
    const { data: t } = await supabase
      .from("transacoes_banco")
      .select("data")
      .eq("id", p.transacaoId)
      .maybeSingle();
    await supabase
      .from("transacoes_banco")
      .update({ lancamento_id: p.lancamentoId })
      .eq("id", p.transacaoId);
    await supabase
      .from("lancamentos")
      .update({ pago: true, pago_em: (t?.data as string) ?? null })
      .eq("id", p.lancamentoId);
  }
  revalidatePath("/financeiro/banco");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

export async function desconciliar(transacaoId: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  await supabase
    .from("transacoes_banco")
    .update({ lancamento_id: null })
    .eq("id", transacaoId);
  revalidatePath("/financeiro/banco");
  return { ok: true };
}

export async function excluirTransacao(formData: FormData) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("transacoes_banco").delete().eq("id", id);
  revalidatePath("/financeiro/banco");
}
