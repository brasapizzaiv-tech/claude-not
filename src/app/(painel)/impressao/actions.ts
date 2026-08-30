"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Gestão das impressoras (Central de Impressões) — vale para todos os tipos de
// documento (etiquetas hoje; comandas/cupons no futuro).
export async function criarImpressora(nome: string) {
  const supabase = await createClient();
  const n = nome?.trim();
  if (!n) return { ok: false as const };
  await supabase.from("impressoras").insert({ nome: n });
  revalidatePath("/impressao");
  return { ok: true as const };
}

// Cadastra rápido uma impressora detectada no PC (nome = nome do Windows).
export async function criarImpressoraDetectada(windowsName: string) {
  const supabase = await createClient();
  const n = windowsName?.trim();
  if (!n) return { ok: false as const };
  await supabase.from("impressoras").insert({ nome: n, impressora_windows: n });
  revalidatePath("/impressao");
  return { ok: true as const };
}

export async function renomearImpressora(id: string, nome: string) {
  const supabase = await createClient();
  const n = nome?.trim();
  if (!n) return { ok: false as const };
  await supabase.from("impressoras").update({ nome: n }).eq("id", id);
  revalidatePath("/impressao");
  return { ok: true as const };
}

export async function definirImpressoraWindows(id: string, nome: string) {
  const supabase = await createClient();
  await supabase.from("impressoras").update({ impressora_windows: nome?.trim() || null }).eq("id", id);
  revalidatePath("/impressao");
  return { ok: true as const };
}

export async function definirImpressoraAtiva(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("impressoras").update({ ativo }).eq("id", id);
  revalidatePath("/impressao");
  return { ok: true as const };
}
