"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const valorNum = (s: string) =>
  Number((s || "").replace(/\./g, "").replace(",", ".")) || 0;

// Preço por quilo do buffet (guardado em pdv_config).
export async function salvarPrecoKg(formData: FormData) {
  const supabase = await createClient();
  const preco = valorNum(formData.get("preco_kg") as string);
  await supabase
    .from("pdv_config")
    .upsert({ chave: "preco_kg", valor: String(preco) });
  revalidatePath("/salao/cardapio");
}

export async function salvarItem(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;
  const categoria = (formData.get("categoria") as string)?.trim() || null;
  const preco = valorNum(formData.get("preco") as string);

  if (id) {
    await supabase.from("pdv_itens").update({ nome, categoria, preco }).eq("id", id);
  } else {
    await supabase.from("pdv_itens").insert({ nome, categoria, preco });
  }
  revalidatePath("/salao/cardapio");
}

export async function excluirItem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("pdv_itens").delete().eq("id", id);
  revalidatePath("/salao/cardapio");
}
