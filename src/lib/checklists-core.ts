// Checklists de rotina (caixa, salão, cozinha, copa) — regra compartilhada
// entre o painel (/checklists), o app da equipe (/eu/{token}/checklist) e a TV
// da cozinha (apontamentos). Quem chama passa o cliente de banco e quem age.
// Sem "use server": é biblioteca.
import type { createAdminClient } from "@/lib/supabase/admin";

export type Db = ReturnType<typeof createAdminClient>;
export type Ator = { nome: string; colabId?: string | null };

export const MOMENTOS = ["abertura", "turno", "fechamento"] as const;
export type Momento = (typeof MOMENTOS)[number];
export const ROTULO_MOMENTO: Record<Momento, string> = {
  abertura: "Abertura",
  turno: "Durante o turno",
  fechamento: "Fechamento",
};
export const SERVICOS = ["almoco", "rodizio", "delivery"] as const;
export type Servico = (typeof SERVICOS)[number];
export const ROTULO_SERVICO: Record<Servico, string> = { almoco: "Almoço", rodizio: "Rodízio", delivery: "Delivery" };
export const TIPOS_ITEM = ["feito", "numero", "texto", "contagem"] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];
export const ROTULO_TIPO: Record<TipoItem, string> = {
  feito: "Marcar feito",
  numero: "Número",
  texto: "Texto livre",
  contagem: "Contagem",
};
export const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Agrupa os itens pelas seções da folha ("ANTES DE COMEÇAR", "PREPARO"…),
// mantendo a ordem. Item sem seção cai num grupo sem título.
export function porSecao<T extends { secao?: string | null }>(itens: T[]): { secao: string | null; itens: T[] }[] {
  const out: { secao: string | null; itens: T[] }[] = [];
  for (const i of itens) {
    const s = i.secao?.trim() || null;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.secao === s) ultimo.itens.push(i);
    else out.push({ secao: s, itens: [i] });
  }
  return out;
}

export type Setor = { id: string; nome: string; cor: string | null; ordem: number; ativo: boolean };
export type ModeloItem = {
  id: string; modelo_id: string; texto: string; instrucao: string | null; secao: string | null;
  tipo: TipoItem; exige_foto: boolean; obrigatorio: boolean; ordem: number; ativo: boolean;
};
export type Modelo = {
  id: string; setor_id: string; nome: string; momento: Momento;
  dias: number[]; servicos: string[]; ordem: number; ativo: boolean; bloqueia: boolean;
};
export type Resposta = {
  id: string; execucao_id: string; item_id: string; feito: boolean;
  valor: number | null; texto: string | null; foto_url: string | null;
  por_nome: string | null; em: string;
};
export type Execucao = {
  id: string; modelo_id: string; data: string;
  iniciado_em: string; iniciado_nome: string | null;
  concluido_em: string | null; concluido_nome: string | null;
};
export type Apontamento = {
  id: string; data_ref: string; setor_id: string | null; setor_nome: string | null;
  execucao_id: string | null; item_id: string | null; item_texto: string | null;
  texto: string; na_tv: boolean; ate: string | null; mostrar_nome: boolean; pessoa_nome: string | null;
  resolvido_em: string | null; resolvido_por: string | null;
  publicado_em: string | null; publicado_por: string | null; criado_em: string;
};

// ---------- datas (sempre no fuso de São Paulo) ----------
export const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const addDiasIso = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
export const diaSemanaIso = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};
export const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
export const diaValido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
// Momento provável agora: antes das 11h é abertura, depois das 21h é fechamento.
export function momentoAgora(agora = Date.now()): Momento {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour12: false, hour: "2-digit" }).format(new Date(agora)));
  if (h >= 21 || h < 5) return "fechamento";
  if (h < 11) return "abertura";
  return "turno";
}

// ---------- leitura ----------
export async function listarSetores(db: Db, incluirInativos = false): Promise<Setor[]> {
  let q = db.from("checklist_setores").select("id, nome, cor, ordem, ativo").order("ordem").order("nome");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data } = await q;
  return (data as Setor[]) ?? [];
}

export async function listarModelos(db: Db, incluirInativos = false): Promise<Modelo[]> {
  let q = db.from("checklist_modelos").select("id, setor_id, nome, momento, dias, servicos, ordem, ativo, bloqueia").order("ordem").order("nome");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data } = await q;
  return (data as Modelo[]) ?? [];
}

export async function listarItens(db: Db, modeloIds: string[]): Promise<ModeloItem[]> {
  if (modeloIds.length === 0) return [];
  const { data } = await db
    .from("checklist_modelo_itens")
    .select("id, modelo_id, texto, instrucao, secao, tipo, exige_foto, obrigatorio, ordem, ativo")
    .in("modelo_id", modeloIds)
    .eq("ativo", true)
    .order("ordem");
  return (data as ModeloItem[]) ?? [];
}

// O modelo vale neste dia? Sem dia e sem serviço marcado, vale todo dia.
export function valeNoDia(m: Modelo, dia: string, servicos: Servico[] = []): boolean {
  if (!m.ativo) return false;
  const dow = diaSemanaIso(dia);
  if ((m.dias ?? []).length > 0 && !m.dias.includes(dow)) return false;
  if ((m.servicos ?? []).length > 0) {
    if (servicos.length === 0) return true; // sem saber o serviço do dia, não esconde
    if (!m.servicos.some((s) => servicos.includes(s as Servico))) return false;
  }
  return true;
}

export async function execucoesDoDia(db: Db, dia: string): Promise<Execucao[]> {
  const { data } = await db
    .from("checklist_execucoes")
    .select("id, modelo_id, data, iniciado_em, iniciado_nome, concluido_em, concluido_nome")
    .eq("data", dia);
  return (data as Execucao[]) ?? [];
}

export async function respostasDe(db: Db, execucaoIds: string[]): Promise<Resposta[]> {
  if (execucaoIds.length === 0) return [];
  const { data } = await db
    .from("checklist_respostas")
    .select("id, execucao_id, item_id, feito, valor, texto, foto_url, por_nome, em")
    .in("execucao_id", execucaoIds);
  return (data as Resposta[]) ?? [];
}

// Situação de uma lista num dia: quantos itens, quantos respondidos, se os
// obrigatórios estão prontos.
export type Situacao = {
  total: number; feitos: number; pendentes: number;
  faltamObrigatorios: number; concluida: boolean; iniciada: boolean; pct: number;
};
export function situacao(itens: ModeloItem[], respostas: Resposta[], exec: Execucao | null): Situacao {
  const porItem = new Map(respostas.map((r) => [r.item_id, r]));
  let feitos = 0, faltam = 0;
  for (const i of itens) {
    const r = porItem.get(i.id);
    const ok = itemRespondido(i, r);
    if (ok) feitos++;
    if (i.obrigatorio && !ok) faltam++;
  }
  const total = itens.length;
  return {
    total, feitos, pendentes: total - feitos, faltamObrigatorios: faltam,
    concluida: !!exec?.concluido_em, iniciada: !!exec,
    pct: total === 0 ? 0 : Math.round((feitos / total) * 100),
  };
}
// Item respondido = o que o tipo dele exige (e a foto, quando pedida).
export function itemRespondido(i: ModeloItem, r: Resposta | undefined): boolean {
  if (!r) return false;
  if (i.exige_foto && !r.foto_url) return false;
  if (i.tipo === "numero" || i.tipo === "contagem") return r.valor != null;
  if (i.tipo === "texto") return !!(r.texto && r.texto.trim());
  return r.feito;
}

// ---------- execução ----------
// Abre (ou devolve) a execução do modelo no dia. A chave única modelo+dia é o
// que impede duas pessoas criarem listas paralelas.
export async function abrirExecucao(db: Db, modeloId: string, dia: string, ator: Ator) {
  const { data: existente } = await db
    .from("checklist_execucoes")
    .select("id, modelo_id, data, iniciado_em, iniciado_nome, concluido_em, concluido_nome")
    .eq("modelo_id", modeloId).eq("data", dia).maybeSingle();
  if (existente) return { ok: true as const, execucao: existente as Execucao, jaExistia: true as const };
  const { data, error } = await db
    .from("checklist_execucoes")
    .insert({ modelo_id: modeloId, data: dia, iniciado_por: ator.colabId ?? null, iniciado_nome: ator.nome })
    .select("id, modelo_id, data, iniciado_em, iniciado_nome, concluido_em, concluido_nome")
    .single();
  if (error) {
    // Corrida: outra pessoa criou no mesmo instante — usa a dela.
    const { data: outra } = await db
      .from("checklist_execucoes")
      .select("id, modelo_id, data, iniciado_em, iniciado_nome, concluido_em, concluido_nome")
      .eq("modelo_id", modeloId).eq("data", dia).maybeSingle();
    if (outra) return { ok: true as const, execucao: outra as Execucao, jaExistia: true as const };
    return { ok: false as const, mensagem: "Não consegui abrir a lista." };
  }
  return { ok: true as const, execucao: data as Execucao, jaExistia: false as const };
}

export async function salvarResposta(
  db: Db,
  execucaoId: string,
  itemId: string,
  dados: { feito?: boolean; valor?: number | null; texto?: string | null; foto_url?: string | null },
  ator: Ator,
) {
  const linha: Record<string, unknown> = {
    execucao_id: execucaoId, item_id: itemId,
    por_id: ator.colabId ?? null, por_nome: ator.nome, em: new Date().toISOString(),
  };
  if (dados.feito !== undefined) linha.feito = dados.feito;
  if (dados.valor !== undefined) linha.valor = dados.valor;
  if (dados.texto !== undefined) linha.texto = dados.texto;
  if (dados.foto_url !== undefined) linha.foto_url = dados.foto_url;
  const { error } = await db.from("checklist_respostas").upsert(linha, { onConflict: "execucao_id,item_id" });
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const };
}

export async function concluirExecucao(db: Db, execucaoId: string, ator: Ator) {
  const { data: exec } = await db.from("checklist_execucoes").select("id, modelo_id").eq("id", execucaoId).maybeSingle();
  if (!exec) return { ok: false as const, mensagem: "Lista não encontrada." };
  const [itens, respostas] = await Promise.all([
    listarItens(db, [exec.modelo_id as string]),
    respostasDe(db, [execucaoId]),
  ]);
  const s = situacao(itens, respostas, null);
  if (s.faltamObrigatorios > 0) {
    return { ok: false as const, mensagem: `Faltam ${s.faltamObrigatorios} item(ns) obrigatório(s).` };
  }
  await db
    .from("checklist_execucoes")
    .update({ concluido_em: new Date().toISOString(), concluido_por: ator.colabId ?? null, concluido_nome: ator.nome })
    .eq("id", execucaoId);
  return { ok: true as const };
}

// ---------- apontamentos ----------
export async function criarApontamento(
  db: Db,
  input: {
    data_ref: string; texto: string; setor_id?: string | null;
    execucao_id?: string | null; item_id?: string | null; item_texto?: string | null;
    pessoa_nome?: string | null; na_tv?: boolean; ate?: string | null; mostrar_nome?: boolean;
  },
  ator: Ator,
) {
  const texto = (input.texto || "").trim();
  if (texto.length < 3) return { ok: false as const, mensagem: "Escreva o que precisa ser corrigido." };
  if (!diaValido(input.data_ref)) return { ok: false as const, mensagem: "Dia inválido." };
  let setorNome: string | null = null;
  if (input.setor_id) {
    const { data: s } = await db.from("checklist_setores").select("nome").eq("id", input.setor_id).maybeSingle();
    setorNome = (s?.nome as string) ?? null;
  }
  const naTv = !!input.na_tv;
  const { data, error } = await db
    .from("checklist_apontamentos")
    .insert({
      data_ref: input.data_ref, texto,
      setor_id: input.setor_id ?? null, setor_nome: setorNome,
      execucao_id: input.execucao_id ?? null, item_id: input.item_id ?? null, item_texto: input.item_texto ?? null,
      pessoa_nome: input.pessoa_nome ?? null, mostrar_nome: !!input.mostrar_nome,
      na_tv: naTv, ate: input.ate ?? null,
      publicado_em: naTv ? new Date().toISOString() : null, publicado_por: naTv ? ator.nome : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, id: (data as { id: string }).id };
}

// Publica (ou tira) na TV. `ate` vazio = sem prazo (fica até resolver).
export async function publicarApontamentos(db: Db, ids: string[], ate: string | null, ator: Ator) {
  if (ids.length === 0) return { ok: true as const, n: 0 };
  const { error } = await db
    .from("checklist_apontamentos")
    .update({ na_tv: true, ate, publicado_em: new Date().toISOString(), publicado_por: ator.nome })
    .in("id", ids);
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, n: ids.length };
}

export async function tirarDaTv(db: Db, id: string) {
  const { error } = await db.from("checklist_apontamentos").update({ na_tv: false }).eq("id", id);
  return error ? { ok: false as const, mensagem: error.message } : { ok: true as const };
}

export async function resolverApontamento(db: Db, id: string, ator: Ator, desfazer = false) {
  const { error } = await db
    .from("checklist_apontamentos")
    .update(desfazer
      ? { resolvido_em: null, resolvido_por: null }
      : { resolvido_em: new Date().toISOString(), resolvido_por: ator.nome, na_tv: false })
    .eq("id", id);
  return error ? { ok: false as const, mensagem: error.message } : { ok: true as const };
}

export async function excluirApontamento(db: Db, id: string) {
  const { error } = await db.from("checklist_apontamentos").delete().eq("id", id);
  return error ? { ok: false as const, mensagem: error.message } : { ok: true as const };
}

// O que está valendo na TV agora: publicado, não resolvido e dentro do prazo.
export type ApontamentoTv = { id: string; setor: string | null; texto: string; pessoa: string | null; data: string };
export async function apontamentosAtivos(db: Db, dia = hojeSP()): Promise<Apontamento[]> {
  const { data } = await db
    .from("checklist_apontamentos")
    .select("*")
    .eq("na_tv", true)
    .is("resolvido_em", null)
    .or(`ate.is.null,ate.gte.${dia}`)
    .order("data_ref", { ascending: false })
    .order("criado_em")
    .limit(24);
  return (data as Apontamento[]) ?? [];
}
export async function apontamentosTv(db: Db, dia = hojeSP()): Promise<ApontamentoTv[]> {
  const rows = await apontamentosAtivos(db, dia);
  return rows.map((a) => ({
    id: a.id,
    setor: a.setor_nome,
    texto: a.texto,
    pessoa: a.mostrar_nome ? a.pessoa_nome : null,
    data: a.data_ref,
  }));
}

// Título do bloco na TV: "ONTEM" quando todos são do dia anterior.
export function tituloApontamentos(itens: ApontamentoTv[], hoje = hojeSP()): string {
  if (itens.length === 0) return "PONTOS DE ATENÇÃO";
  const datas = new Set(itens.map((i) => i.data));
  if (datas.size === 1) {
    const d = [...datas][0];
    if (d === hoje) return "PONTOS DE ATENÇÃO — HOJE";
    if (d === addDiasIso(hoje, -1)) return "PONTOS DE ATENÇÃO — ONTEM";
    return `PONTOS DE ATENÇÃO — ${dataCurta(d)}`;
  }
  return "PONTOS DE ATENÇÃO";
}

// Quantos apontamentos cabem dentro da tela do cardápio; acima disso o bloco
// vira página própria na rotação (nunca espremer nem rolar).
export const APONTAMENTOS_NA_TELA = 4;
export const APONTAMENTOS_POR_PAGINA = 8;
