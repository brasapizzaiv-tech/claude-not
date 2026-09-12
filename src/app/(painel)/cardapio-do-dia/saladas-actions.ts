"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

export const CATEGORIAS_SALADA = ["Folhas", "Maioneses", "Cozidas", "Cruas", "Grãos", "Conservas", "Outros"] as const;
export type CategoriaSalada = (typeof CATEGORIAS_SALADA)[number];
export type SaladaBase = { id: string; nome: string; categoria: CategoriaSalada };

// Base de saladas (ativas) — o cadastro do dia é marcar quais entram.
export async function listarSaladasBase(): Promise<SaladaBase[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("saladas_base").select("id, nome, categoria").eq("ativo", true).order("nome");
  return (data as SaladaBase[]) ?? [];
}

export async function saladasDoDia(data: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("cardapio_dia_saladas").select("salada_id").eq("data", data);
  return ((rows as { salada_id: string }[]) ?? []).map((r) => r.salada_id);
}

// Grava o conjunto do dia (substitui o que havia).
export async function salvarSaladasDia(data: string, ids: string[]) {
  await exigirAcesso("/cardapio-do-dia");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false as const, mensagem: "Dia inválido." };
  const supabase = await createClient();
  const { error: e1 } = await supabase.from("cardapio_dia_saladas").delete().eq("data", data);
  if (e1) return { ok: false as const, mensagem: e1.message };
  const unicos = [...new Set(ids)];
  if (unicos.length > 0) {
    const { error: e2 } = await supabase.from("cardapio_dia_saladas").insert(unicos.map((salada_id) => ({ data, salada_id })));
    if (e2) return { ok: false as const, mensagem: e2.message };
  }
  revalidatePath("/cardapio-do-dia");
  return { ok: true as const };
}

export async function criarSalada(nome: string, categoria: CategoriaSalada) {
  await exigirAcesso("/cardapio-do-dia");
  const n = nome.trim().slice(0, 60);
  if (n.length < 2) return { ok: false as const, mensagem: "Escreva o nome da salada." };
  if (!CATEGORIAS_SALADA.includes(categoria)) return { ok: false as const, mensagem: "Categoria inválida." };
  const supabase = await createClient();
  // Se já existia (inclusive desativada), reativa na categoria escolhida.
  const { data, error } = await supabase
    .from("saladas_base")
    .upsert({ nome: n, categoria, ativo: true }, { onConflict: "nome" })
    .select("id")
    .single();
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cardapio-do-dia");
  return { ok: true as const, id: (data as { id: string }).id };
}

// Tira da base (não apaga: os dias antigos continuam com o histórico).
export async function removerSalada(id: string) {
  await exigirAcesso("/cardapio-do-dia");
  const supabase = await createClient();
  const { error } = await supabase.from("saladas_base").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cardapio-do-dia");
  return { ok: true as const };
}
