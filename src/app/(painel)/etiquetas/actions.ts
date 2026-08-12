"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarEtiqueta(dados: {
  produto_id: string;
  colaborador_nome: string;
  validade: string;
}) {
  const supabase = await createClient();

  const { data: prod } = await supabase
    .from("produtos")
    .select("nome")
    .eq("id", dados.produto_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("etiquetas")
    .insert({
      produto_id: dados.produto_id,
      produto_nome: prod?.nome ?? "Produto",
      colaborador_nome: dados.colaborador_nome || null,
      validade: dados.validade || null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false };
  revalidatePath("/etiquetas");
  return { ok: true, id: data.id };
}

export async function excluirEtiqueta(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("etiquetas").delete().eq("id", id);
  revalidatePath("/etiquetas");
}

// Atualiza a validade padrão (dias) de um produto.
export async function salvarValidadeProduto(produtoId: string, dias: number | null) {
  const supabase = await createClient();
  await supabase.from("produtos").update({ validade_dias: dias }).eq("id", produtoId);
  revalidatePath("/etiquetas");
  return { ok: true };
}
