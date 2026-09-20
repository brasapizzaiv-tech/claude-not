"use server";

// Ações do painel — só conferem o acesso e chamam a regra compartilhada em
// src/lib/cardapio-dia-core.ts (a mesma que o app da equipe usa).
import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import * as core from "@/lib/cardapio-dia-core";
import { salvarExcecaoMarmita } from "@/lib/marmitas-cardapio";

export type { DadosCardapio, Grupo } from "@/lib/cardapio-dia-core";

async function sessao() {
  await exigirAcesso("/cardapio-do-dia");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let nome = user?.email ?? "painel";
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
    if (prof?.nome) nome = prof.nome as string;
  }
  const db = supabase as unknown as core.Db;
  const ator: core.Ator = { nome, userId: user?.id ?? null };
  return { db, ator };
}
const atualizar = () => revalidatePath("/cardapio-do-dia");

// Salva; com publicar=true também publica (botão "Publicar no site").
export async function salvarCardapio(data: string, d: core.DadosCardapio, publicar: boolean) {
  const { db, ator } = await sessao();
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const, erro: "Não consegui identificar a empresa." };
  const r = publicar
    ? await core.salvarEPublicarCardapioDia(db, data, d, ator, empresaId)
    : await core.salvarCardapioDia(db, data, d, ator, empresaId);
  atualizar();
  return r.ok ? { ok: true as const } : { ok: false as const, erro: r.mensagem };
}

export async function publicarCardapio(data: string) {
  const { db, ator } = await sessao();
  const r = await core.publicarCardapioDia(db, data, ator);
  atualizar();
  return r.ok ? { ok: true as const } : { ok: false as const, erro: r.mensagem };
}

export async function criarItens(grupo: core.Grupo, texto: string) {
  const { db } = await sessao();
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const, erro: "Não consegui identificar a empresa." };
  const r = await core.criarItensCatalogo(db, grupo, texto, empresaId);
  atualizar();
  return r.ok ? { ok: true as const, total: r.total } : { ok: false as const, erro: r.mensagem };
}

export async function apagarItem(id: string) {
  const { db } = await sessao();
  await core.apagarItemCatalogo(db, id);
  atualizar();
  return { ok: true as const };
}

export async function despublicarCardapio(data: string) {
  const { db, ator } = await sessao();
  await core.despublicarCardapioDia(db, data, ator);
  atualizar();
  return { ok: true as const };
}

export async function apagarCardapio(data: string) {
  const { db, ator } = await sessao();
  await core.apagarCardapioDia(db, data, ator);
  atualizar();
  return { ok: true as const };
}

// Marmitas Kern: exceção só deste dia (regra e trava de janela no core).
export async function salvarMarmitaDia(data: string, dados: { pratos: string[]; proteinas: string[]; salada: string }) {
  const { db, ator } = await sessao();
  const r = await salvarExcecaoMarmita(data, dados, ator.nome);
  if (r.ok) {
    await core.registrarPublicacao(db, data, "marmita", ator, r.removida ? "voltou pra rotação" : `${dados.pratos.length} prato(s)`);
  }
  atualizar();
  return r;
}
