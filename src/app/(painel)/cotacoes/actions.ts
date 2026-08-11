"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function criarCotacao(formData: FormData) {
  const supabase = await createClient();

  const descricao =
    (formData.get("descricao") as string)?.trim() ||
    `Cotação ${new Date().toLocaleDateString("pt-BR")}`;
  const contagem_id = (formData.get("contagem_id") as string)?.trim() || null;

  const { data, error } = await supabase
    .from("cotacoes")
    .insert({ descricao, contagem_id })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/cotacoes/${data.id}`);
}

type ItemCotacao = { produto_id: string; qtd: number };

export async function salvarCotacaoItens(
  cotacaoId: string,
  itens: ItemCotacao[],
) {
  const supabase = await createClient();

  const paraGravar = itens
    .filter((i) => i.qtd > 0)
    .map((i) => ({ ...i, cotacao_id: cotacaoId }));

  if (paraGravar.length > 0) {
    await supabase
      .from("cotacao_itens")
      .upsert(paraGravar, { onConflict: "cotacao_id,produto_id" });
  }

  const comValor = new Set(paraGravar.map((i) => i.produto_id));
  const zerados = itens
    .filter((i) => !comValor.has(i.produto_id))
    .map((i) => i.produto_id);
  if (zerados.length > 0) {
    await supabase
      .from("cotacao_itens")
      .delete()
      .eq("cotacao_id", cotacaoId)
      .in("produto_id", zerados);
  }

  revalidatePath(`/cotacoes/${cotacaoId}`);
  return { ok: true, gravados: paraGravar.length };
}

// Convida um fornecedor para a cotação (cria o link/token se ainda não existe).
export async function convidarFornecedor(
  cotacaoId: string,
  fornecedorId: string,
) {
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("cotacao_fornecedores")
    .select("id")
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();

  if (!existente) {
    await supabase.from("cotacao_fornecedores").insert({
      cotacao_id: cotacaoId,
      fornecedor_id: fornecedorId,
      token: randomUUID().replace(/-/g, ""),
    });
  }
  revalidatePath(`/cotacoes/${cotacaoId}/fornecedores`);
}

export async function removerFornecedor(
  cotacaoId: string,
  fornecedorId: string,
) {
  const supabase = await createClient();
  await supabase
    .from("cotacao_precos")
    .delete()
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId);
  await supabase
    .from("cotacao_fornecedores")
    .delete()
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId);
  revalidatePath(`/cotacoes/${cotacaoId}/fornecedores`);
}

export async function fecharCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").update({ status: "fechada" }).eq("id", id);
  revalidatePath(`/cotacoes/${id}`);
  revalidatePath("/cotacoes");
}

export async function reabrirCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").update({ status: "aberta" }).eq("id", id);
  revalidatePath(`/cotacoes/${id}`);
  revalidatePath("/cotacoes");
}

export async function excluirCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").delete().eq("id", id);
  revalidatePath("/cotacoes");
}
