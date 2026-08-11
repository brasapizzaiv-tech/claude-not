"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarCategoria(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;

  if (id) {
    await supabase.from("categorias").update({ nome }).eq("id", id);
  } else {
    // Ignora se já existir (nome é único).
    await supabase.from("categorias").upsert({ nome }, { onConflict: "nome" });
  }
  revalidatePath("/categorias");
  revalidatePath("/produtos");
}

export async function excluirCategoria(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  // Produtos ligados a ela ficam "Sem categoria" (categoria_id vira nulo).
  await supabase.from("categorias").delete().eq("id", id);
  revalidatePath("/categorias");
  revalidatePath("/produtos");
}
