"use server";

// Cofre pelo app da equipe. Toda ação confere NO SERVIDOR: token válido,
// colaborador ativo, caixinha "faz_cofre" e PIN batendo (cookie). As regras moram
// em src/lib/cofre-core.ts, as mesmas do painel.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinConfere } from "@/lib/pin-colaborador";
import * as core from "@/lib/cofre-core";
import type { MovimentoNovo, Quantidades } from "@/lib/cofre";

const SEM_PERMISSAO = { ok: false as const, mensagem: "Sem permissão. Entre com o PIN de novo ou peça a liberação ao responsável." };

export async function colabCofre(token: string): Promise<{ id: string; nome: string; empresaId: string } | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_cofre, pin, empresa_id")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo || !data.faz_cofre) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || !(await pinConfere(token, pin))) return null;
  return { id: data.id as string, nome: data.nome as string, empresaId: data.empresa_id as string };
}

async function ctx(token: string): Promise<core.Ctx | null> {
  const colab = await colabCofre(token);
  if (!colab) return null;
  return { db: createAdminClient() as unknown as core.Db, empresaId: colab.empresaId, quem: colab.nome };
}

function atualizar(token: string) {
  revalidatePath(`/eu/${token}/cofre`);
  revalidatePath("/cofre");
}

export async function dadosCofreApp(token: string) {
  const c = await ctx(token);
  return c ? core.carregarDados(c) : null;
}

export async function registrarMovimentoApp(token: string, d: MovimentoNovo) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.registrarMovimento(c, d);
  atualizar(token);
  return r;
}

export async function pagarContaApp(token: string, d: { quantidades: Quantidades; descricao: string; categoriaId?: string | null; lancamentoId?: string | null }) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.pagarConta(c, d);
  atualizar(token);
  revalidatePath("/financeiro/contas");
  return r;
}

export async function buscarContasAbertasApp(token: string, termo: string) {
  const c = await ctx(token);
  return c ? core.buscarContasAbertas(c, termo) : [];
}

export async function conferirCofreApp(token: string, d: { contado: Quantidades; motivo?: string }) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.conferirCofre(c, d);
  atualizar(token);
  return r;
}

export async function salvarFaixasApp(token: string, faixas: { centavos: number; minimo: number; maximo: number }[]) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.salvarFaixas(c, faixas);
  atualizar(token);
  return r;
}

export async function marcarEncomendaApp(token: string, d: { quantidades: Quantidades; obs?: string }) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.marcarEncomenda(c, d);
  atualizar(token);
  return r;
}

export async function cancelarEncomendaApp(token: string, id: string) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.cancelarEncomenda(c, id);
  atualizar(token);
  return r;
}

export async function desfazerMovimentoApp(token: string, id: string) {
  const c = await ctx(token);
  if (!c) return SEM_PERMISSAO;
  const r = await core.desfazerMovimento(c, id);
  atualizar(token);
  return r;
}
