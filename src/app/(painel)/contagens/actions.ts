"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function criarContagem(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const descricao =
    (formData.get("descricao") as string)?.trim() ||
    `Contagem ${new Date().toLocaleDateString("pt-BR")}`;

  const { data, error } = await supabase
    .from("contagens")
    .insert({ descricao, responsavel_id: user?.id ?? null })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/contagens/${data.id}`);
}

type ItemContagem = {
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
};

export async function salvarContagemItens(
  contagemId: string,
  itens: ItemContagem[],
) {
  const supabase = await createClient();

  // Só grava itens com algum valor lançado.
  const paraGravar = itens
    .filter((i) => i.qtd_estoque > 0 || i.qtd_pedir > 0)
    .map((i) => ({ ...i, contagem_id: contagemId }));

  if (paraGravar.length > 0) {
    await supabase
      .from("contagem_itens")
      .upsert(paraGravar, { onConflict: "contagem_id,produto_id" });
  }

  // Remove itens que foram zerados (existiam antes, agora sem valor).
  const idsComValor = new Set(paraGravar.map((i) => i.produto_id));
  const zerados = itens
    .filter((i) => !idsComValor.has(i.produto_id))
    .map((i) => i.produto_id);
  if (zerados.length > 0) {
    await supabase
      .from("contagem_itens")
      .delete()
      .eq("contagem_id", contagemId)
      .in("produto_id", zerados);
  }

  revalidatePath(`/contagens/${contagemId}`);
  return { ok: true, gravados: paraGravar.length };
}

export async function finalizarContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase
    .from("contagens")
    .update({ status: "finalizada" })
    .eq("id", id);
  revalidatePath(`/contagens/${id}`);
  revalidatePath("/contagens");
}

export async function reabrirContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagens").update({ status: "rascunho" }).eq("id", id);
  revalidatePath(`/contagens/${id}`);
  revalidatePath("/contagens");
}

export async function excluirContagem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagens").delete().eq("id", id);
  revalidatePath("/contagens");
}
