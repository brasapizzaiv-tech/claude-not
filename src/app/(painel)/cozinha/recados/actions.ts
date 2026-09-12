"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

export type RecadoTvLinha = { id: string; texto: string; ativo: boolean; ordem: number; ate: string | null; criado_em: string };

export async function listarRecadosTv(): Promise<RecadoTvLinha[]> {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const { data } = await supabase.from("tv_recados").select("id, texto, ativo, ordem, ate, criado_em").order("ordem").order("criado_em");
  return (data as RecadoTvLinha[]) ?? [];
}

export async function salvarRecadoTv(input: { id?: string; texto: string; ate: string | null }) {
  await exigirAcesso("/cozinha");
  const texto = input.texto.trim().slice(0, 200);
  if (texto.length < 2) return { ok: false as const, mensagem: "Escreva o recado." };
  const ate = input.ate && /^\d{4}-\d{2}-\d{2}$/.test(input.ate) ? input.ate : null;
  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("tv_recados").update({ texto, ate }).eq("id", input.id)
    : await supabase.from("tv_recados").insert({ texto, ate, ativo: true });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cozinha/recados");
  return { ok: true as const };
}

export async function alternarRecadoTv(id: string, ativo: boolean) {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const { error } = await supabase.from("tv_recados").update({ ativo }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cozinha/recados");
  return { ok: true as const };
}

export async function excluirRecadoTv(id: string) {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const { error } = await supabase.from("tv_recados").delete().eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cozinha/recados");
  return { ok: true as const };
}
