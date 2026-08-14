"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;
  const whatsapp = (formData.get("whatsapp") as string)?.trim() || null;

  if (id) {
    await supabase.from("colaboradores").update({ nome, whatsapp }).eq("id", id);
  } else {
    await supabase.from("colaboradores").insert({ nome, whatsapp });
  }
  revalidatePath("/colaboradores");
}

// Zera o PIN do colaborador (ele cria um novo no próximo acesso ao app).
export async function zerarPinColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ pin: null }).eq("id", id);
  revalidatePath("/colaboradores");
}

export async function excluirColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ ativo: false }).eq("id", id);
  revalidatePath("/colaboradores");
}
