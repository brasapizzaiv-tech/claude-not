"use server";

// Cardápio do dia pelo app da equipe. Toda ação confere NO SERVIDOR: token
// válido, colaborador ativo, caixinha "faz_cardapio" e PIN batendo (cookie).
// A regra de gravação é a mesma do painel (src/lib/cardapio-dia-core.ts).
import { cookies } from "next/headers";
import { empresaDoColaborador } from "@/lib/empresa";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import * as core from "@/lib/cardapio-dia-core";
import { salvarExcecaoMarmita } from "@/lib/marmitas-cardapio";

export async function colabCardapio(token: string): Promise<{ id: string; nome: string } | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, faz_cardapio, pin")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.ativo || !data.faz_cardapio) return null;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!data.pin || data.pin !== pin) return null;
  return { id: data.id as string, nome: data.nome as string };
}

const SEM_PERMISSAO = { ok: false as const, mensagem: "Sem permissão — entre com o PIN de novo ou peça a liberação ao responsável." };

async function sessao(token: string) {
  const colab = await colabCardapio(token);
  if (!colab) return null;
  return { db: createAdminClient() as core.Db, ator: { nome: colab.nome, colabId: colab.id } as core.Ator };
}
function atualizar(token: string) {
  revalidatePath(`/eu/${token}/cardapio`);
  revalidatePath("/cardapio-do-dia");
}

export async function salvarBuffetApp(token: string, dia: string, d: core.DadosCardapio) {
  const s = await sessao(token);
  if (!s) return SEM_PERMISSAO;
  const empresaId = await empresaDoColaborador(token);
  if (!empresaId) return SEM_PERMISSAO;
  const r = await core.salvarCardapioDia(s.db, dia, d, s.ator, empresaId);
  atualizar(token);
  return r;
}

export async function publicarApp(token: string, dia: string) {
  const s = await sessao(token);
  if (!s) return SEM_PERMISSAO;
  const r = await core.publicarCardapioDia(s.db, dia, s.ator);
  atualizar(token);
  return r;
}

export async function salvarEPublicarApp(token: string, dia: string, d: core.DadosCardapio) {
  const s = await sessao(token);
  if (!s) return SEM_PERMISSAO;
  const empresaId = await empresaDoColaborador(token);
  if (!empresaId) return SEM_PERMISSAO;
  const r = await core.salvarEPublicarCardapioDia(s.db, dia, d, s.ator, empresaId);
  atualizar(token);
  return r;
}

export async function salvarSaladasApp(token: string, dia: string, ids: string[]) {
  const s = await sessao(token);
  if (!s) return SEM_PERMISSAO;
  const r = await core.salvarSaladasDia(s.db, dia, ids, s.ator);
  atualizar(token);
  return r;
}

export async function salvarMarmitaApp(token: string, dia: string, dados: { pratos: string[]; proteinas: string[]; salada: string }) {
  const s = await sessao(token);
  if (!s) return SEM_PERMISSAO;
  const r = await salvarExcecaoMarmita(dia, dados, s.ator.nome);
  if (r.ok) await core.registrarPublicacao(s.db, dia, "marmita", s.ator, r.removida ? "voltou pra rotação" : `${dados.pratos.length} prato(s)`);
  atualizar(token);
  return r;
}
