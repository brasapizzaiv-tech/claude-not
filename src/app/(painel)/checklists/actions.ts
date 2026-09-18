"use server";

// Ações do painel (cadastro dos modelos, revisão do dia e apontamentos).
// Só conferem o acesso e chamam a regra compartilhada (src/lib/checklists-core.ts),
// a mesma que o app da equipe usa.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import * as core from "@/lib/checklists-core";

async function sessao() {
  await exigirAcesso("/checklists");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let nome = user?.email ?? "painel";
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
    if (prof?.nome) nome = prof.nome as string;
  }
  return { db: supabase as unknown as core.Db, ator: { nome } as core.Ator };
}
function atualizar() {
  revalidatePath("/checklists");
  revalidatePath("/checklists/modelos");
  revalidatePath("/checklists/revisao");
  revalidatePath("/checklists/apontamentos");
}

// ---------- Setores ----------
export async function salvarSetor(input: { id?: string; nome: string; cor: string | null }) {
  const { db } = await sessao();
  const nome = (input.nome || "").trim();
  if (nome.length < 2) return { ok: false as const, mensagem: "Escreva o nome do setor." };
  if (input.id) {
    const { error } = await db.from("checklist_setores").update({ nome, cor: input.cor }).eq("id", input.id);
    if (error) return { ok: false as const, mensagem: error.message };
  } else {
    const { data: ultimos } = await db.from("checklist_setores").select("ordem").order("ordem", { ascending: false }).limit(1);
    const ordem = Number((ultimos as { ordem: number }[])?.[0]?.ordem ?? 0) + 1;
    const { error } = await db.from("checklist_setores").insert({ nome, cor: input.cor, ordem });
    if (error) return { ok: false as const, mensagem: error.message };
  }
  atualizar();
  return { ok: true as const };
}

export async function alternarSetor(id: string, ativo: boolean) {
  const { db } = await sessao();
  await db.from("checklist_setores").update({ ativo }).eq("id", id);
  atualizar();
  return { ok: true as const };
}

export async function moverSetor(id: string, delta: number) {
  const { db } = await sessao();
  const setores = await core.listarSetores(db, true);
  const i = setores.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= setores.length) return { ok: true as const };
  await db.from("checklist_setores").update({ ordem: setores[j].ordem }).eq("id", setores[i].id);
  await db.from("checklist_setores").update({ ordem: setores[i].ordem }).eq("id", setores[j].id);
  atualizar();
  return { ok: true as const };
}

// ---------- Modelos ----------
export async function salvarModelo(input: {
  id?: string; nome: string; setor_id: string; momento: core.Momento;
  dias: number[]; servicos: string[]; ativo?: boolean;
}) {
  const { db } = await sessao();
  const nome = (input.nome || "").trim();
  if (nome.length < 2) return { ok: false as const, mensagem: "Escreva o nome da lista." };
  if (!input.setor_id) return { ok: false as const, mensagem: "Escolha o setor." };
  if (!core.MOMENTOS.includes(input.momento)) return { ok: false as const, mensagem: "Momento inválido." };
  const linha = {
    nome, setor_id: input.setor_id, momento: input.momento,
    dias: (input.dias ?? []).filter((d) => d >= 0 && d <= 6),
    servicos: (input.servicos ?? []).filter((s) => (core.SERVICOS as readonly string[]).includes(s)),
  };
  if (input.id) {
    const { error } = await db.from("checklist_modelos").update(linha).eq("id", input.id);
    if (error) return { ok: false as const, mensagem: error.message };
    atualizar();
    return { ok: true as const, id: input.id };
  }
  const { data, error } = await db.from("checklist_modelos").insert(linha).select("id").single();
  if (error) return { ok: false as const, mensagem: error.message };
  atualizar();
  return { ok: true as const, id: (data as { id: string }).id };
}

export async function alternarModelo(id: string, ativo: boolean) {
  const { db } = await sessao();
  await db.from("checklist_modelos").update({ ativo }).eq("id", id);
  atualizar();
  return { ok: true as const };
}

export async function excluirModelo(id: string) {
  const { db } = await sessao();
  const { count } = await db.from("checklist_execucoes").select("id", { count: "exact", head: true }).eq("modelo_id", id);
  if ((count ?? 0) > 0) {
    // Já foi executada: desativa em vez de apagar, pra não perder o histórico.
    await db.from("checklist_modelos").update({ ativo: false }).eq("id", id);
    atualizar();
    return { ok: true as const, desativada: true as const };
  }
  await db.from("checklist_modelos").delete().eq("id", id);
  atualizar();
  return { ok: true as const, desativada: false as const };
}

// ---------- Itens do modelo ----------
export async function salvarItemModelo(input: {
  id?: string; modelo_id: string; texto: string; instrucao: string | null; secao?: string | null;
  tipo: core.TipoItem; exige_foto: boolean; obrigatorio: boolean;
}) {
  const { db } = await sessao();
  const texto = (input.texto || "").trim();
  if (texto.length < 2) return { ok: false as const, mensagem: "Escreva o item." };
  const linha = {
    texto, instrucao: (input.instrucao || "").trim() || null,
    secao: (input.secao || "").trim().toUpperCase() || null,
    tipo: core.TIPOS_ITEM.includes(input.tipo) ? input.tipo : "feito",
    exige_foto: !!input.exige_foto, obrigatorio: !!input.obrigatorio,
  };
  if (input.id) {
    const { error } = await db.from("checklist_modelo_itens").update(linha).eq("id", input.id);
    if (error) return { ok: false as const, mensagem: error.message };
  } else {
    const { data: ult } = await db
      .from("checklist_modelo_itens").select("ordem")
      .eq("modelo_id", input.modelo_id).order("ordem", { ascending: false }).limit(1);
    const ordem = Number((ult as { ordem: number }[])?.[0]?.ordem ?? 0) + 1;
    const { error } = await db.from("checklist_modelo_itens").insert({ ...linha, modelo_id: input.modelo_id, ordem });
    if (error) return { ok: false as const, mensagem: error.message };
  }
  atualizar();
  return { ok: true as const };
}

export async function excluirItemModelo(id: string) {
  const { db } = await sessao();
  const { count } = await db.from("checklist_respostas").select("id", { count: "exact", head: true }).eq("item_id", id);
  if ((count ?? 0) > 0) {
    await db.from("checklist_modelo_itens").update({ ativo: false }).eq("id", id);
    atualizar();
    return { ok: true as const, desativado: true as const };
  }
  await db.from("checklist_modelo_itens").delete().eq("id", id);
  atualizar();
  return { ok: true as const, desativado: false as const };
}

// Nova ordem completa dos itens (arrastar e soltar manda a lista de ids).
export async function reordenarItens(modeloId: string, ids: string[]) {
  const { db } = await sessao();
  for (let i = 0; i < ids.length; i++) {
    await db.from("checklist_modelo_itens").update({ ordem: i + 1 }).eq("id", ids[i]).eq("modelo_id", modeloId);
  }
  atualizar();
  return { ok: true as const };
}

// ---------- Apontamentos ----------
export async function criarApontamentoPainel(input: {
  data_ref: string; texto: string; setor_id?: string | null;
  execucao_id?: string | null; item_id?: string | null; item_texto?: string | null;
  pessoa_nome?: string | null; na_tv?: boolean; ate?: string | null; mostrar_nome?: boolean;
}) {
  const { db, ator } = await sessao();
  const r = await core.criarApontamento(db, input, ator);
  atualizar();
  return r;
}

export async function publicarNaTv(ids: string[], ate: string | null) {
  const { db, ator } = await sessao();
  const r = await core.publicarApontamentos(db, ids, ate, ator);
  atualizar();
  return r;
}

export async function tirarApontamentoDaTv(id: string) {
  const { db } = await sessao();
  const r = await core.tirarDaTv(db, id);
  atualizar();
  return r;
}

export async function resolverApontamentoPainel(id: string, desfazer = false) {
  const { db, ator } = await sessao();
  const r = await core.resolverApontamento(db, id, ator, desfazer);
  atualizar();
  return r;
}

export async function excluirApontamentoPainel(id: string) {
  const { db } = await sessao();
  const r = await core.excluirApontamento(db, id);
  atualizar();
  return r;
}
