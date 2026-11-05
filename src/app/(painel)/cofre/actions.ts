"use server";

// Cofre no painel (migration 0269). Toda ação confere a permissão "cofre" e grava
// quem fez. As regras moram em src/lib/cofre-core.ts, as mesmas do app da equipe.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";
import * as core from "@/lib/cofre-core";
import type { MovimentoNovo, Quantidades } from "@/lib/cofre";

async function ctx(): Promise<core.Ctx> {
  await exigirAcesso("/cofre");
  const db = await createClient();
  const empresaId = await empresaAtualId();
  if (!empresaId) throw new Error("Não identifiquei a empresa deste acesso.");
  const { data: u } = await db.auth.getUser();
  let quem: string | null = null;
  if (u.user) {
    const { data: p } = await db.from("profiles").select("nome").eq("id", u.user.id).maybeSingle();
    quem = (p?.nome as string | null) || u.user.email || null;
  }
  return { db, empresaId, quem };
}

export async function registrarMovimento(d: MovimentoNovo) {
  const r = await core.registrarMovimento(await ctx(), d);
  revalidatePath("/cofre");
  return r;
}

export async function pagarConta(d: { quantidades: Quantidades; descricao: string; categoriaId?: string | null; lancamentoId?: string | null }) {
  const r = await core.pagarConta(await ctx(), d);
  revalidatePath("/cofre");
  revalidatePath("/financeiro/contas");
  return r;
}

export async function buscarContasAbertas(termo: string) {
  return core.buscarContasAbertas(await ctx(), termo);
}

export async function conferirCofre(d: { contado: Quantidades; motivo?: string }) {
  const r = await core.conferirCofre(await ctx(), d);
  revalidatePath("/cofre");
  return r;
}

export async function salvarFaixas(faixas: { centavos: number; minimo: number; maximo: number }[]) {
  const r = await core.salvarFaixas(await ctx(), faixas);
  revalidatePath("/cofre");
  return r;
}

export async function marcarEncomenda(d: { quantidades: Quantidades; obs?: string }) {
  const r = await core.marcarEncomenda(await ctx(), d);
  revalidatePath("/cofre");
  return r;
}

export async function cancelarEncomenda(id: string) {
  const r = await core.cancelarEncomenda(await ctx(), id);
  revalidatePath("/cofre");
  return r;
}

export async function desfazerMovimento(id: string) {
  const r = await core.desfazerMovimento(await ctx(), id);
  revalidatePath("/cofre");
  return r;
}

/** Só para a tela do painel: os dados com a mesma conferência das ações. */
export async function dadosDoCofre() {
  return core.carregarDados(await ctx());
}
