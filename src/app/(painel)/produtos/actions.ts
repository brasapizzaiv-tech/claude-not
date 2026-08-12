"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarProduto(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;

  const unidade = ((formData.get("unidade") as string) || "un").trim();
  const estoqueMinimoRaw = (formData.get("estoque_minimo") as string) || "0";
  const estoque_minimo = Number(estoqueMinimoRaw.replace(",", ".")) || 0;
  const estoqueIdealRaw = (formData.get("estoque_ideal") as string) || "0";
  const estoque_ideal = Number(estoqueIdealRaw.replace(",", ".")) || 0;
  const observacoes =
    (formData.get("observacoes") as string)?.trim() || null;
  const categoria_id =
    (formData.get("categoria_id") as string)?.trim() || null;
  const dias = (campo: string) => {
    const v = (formData.get(campo) as string)?.trim();
    return v ? Number(v) || null : null;
  };

  const payload = {
    nome,
    unidade,
    estoque_minimo,
    estoque_ideal,
    validade_congelado: dias("validade_congelado"),
    validade_resfriado: dias("validade_resfriado"),
    validade_ambiente: dias("validade_ambiente"),
    observacoes,
    categoria_id,
  };

  if (id) {
    await supabase.from("produtos").update(payload).eq("id", id);
  } else {
    await supabase.from("produtos").insert(payload);
  }
  revalidatePath("/produtos");
}

export async function excluirProduto(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("produtos").update({ ativo: false }).eq("id", id);
  revalidatePath("/produtos");
}
