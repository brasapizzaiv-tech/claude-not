"use server";

// Saladas — ações do painel; a regra fica em src/lib/cardapio-dia-core.ts.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import * as core from "@/lib/cardapio-dia-core";
import type { CategoriaSalada, SaladaBase } from "./saladas-tipos";

async function sessao() {
  await exigirAcesso("/cardapio-do-dia");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let nome = user?.email ?? "painel";
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
    if (prof?.nome) nome = prof.nome as string;
  }
  return { db: supabase as unknown as core.Db, ator: { nome, userId: user?.id ?? null } as core.Ator };
}
const atualizar = () => revalidatePath("/cardapio-do-dia");

export async function listarSaladasBase(): Promise<SaladaBase[]> {
  const supabase = await createClient();
  return core.listarSaladasBase(supabase as unknown as core.Db);
}
export async function saladasDoDia(data: string): Promise<string[]> {
  const supabase = await createClient();
  return core.saladasDoDia(supabase as unknown as core.Db, data);
}
export async function padraoSemanaSaladas(dow: number): Promise<string[]> {
  const supabase = await createClient();
  return core.padraoSemanaSaladas(supabase as unknown as core.Db, dow);
}
export async function salvarSaladasDia(data: string, ids: string[]) {
  const { db, ator } = await sessao();
  const r = await core.salvarSaladasDia(db, data, ids, ator);
  atualizar();
  return r;
}
export async function criarSalada(nome: string, categoria: CategoriaSalada) {
  const { db } = await sessao();
  const r = await core.criarSalada(db, nome, categoria);
  atualizar();
  return r;
}
export async function removerSalada(id: string) {
  const { db } = await sessao();
  const r = await core.removerSalada(db, id);
  atualizar();
  return r;
}
export async function salvarPadraoSemanaSaladas(dow: number, ids: string[]) {
  const { db } = await sessao();
  const r = await core.salvarPadraoSemanaSaladas(db, dow, ids);
  atualizar();
  return r;
}
