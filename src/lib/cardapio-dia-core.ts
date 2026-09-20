// Regra de negócio do CARDÁPIO DO DIA (buffet, saladas, catálogo e histórico),
// num lugar só. Quem chama passa o cliente de banco e quem está agindo:
//  - painel (/cardapio-do-dia): cliente com sessão (RLS) + nome do usuário;
//  - app da equipe (/eu/{token}/cardapio): cliente admin + nome do colaborador
//    (a permissão foi conferida antes, pelo token + PIN + faz_cardapio).
// Sem "use server" aqui de propósito: é biblioteca, não ação.
import type { createAdminClient } from "@/lib/supabase/admin";
import { addDiasIso, diaSemanaIso } from "@/lib/dia-cardapio";
import type { KernDia } from "@/lib/marmitas-cardapio";

export type Db = ReturnType<typeof createAdminClient>;
export type Ator = { nome: string; userId?: string | null; colabId?: string | null };

export const GRUPOS = ["proteinas", "carboidratos", "especial"] as const;
export type Grupo = (typeof GRUPOS)[number];

export type DadosCardapio = {
  proteinas: string;   // um item por linha
  carboidratos: string;
  especial: string;
  preco_livre: number | null;
  preco_kg: number | null;
};

export type CardapioDia = {
  data: string;
  proteinas: string | null;
  carboidratos: string | null;
  especial: string | null;
  preco_livre: number | null;
  preco_kg: number | null;
  publicado: boolean;
  publicado_em: string | null;
  publicado_por: string | null;
  alterado_em: string | null;
  alterado_por: string | null;
};
export type StatusCardapio = "vazio" | "rascunho" | "publicado" | "alterado";
export type ItemCatalogo = { id: string; grupo: string; nome: string; usos: number };
export type Publicacao = { id: string; data: string; acao: string; detalhe: string | null; por_nome: string | null; em: string };

// Preços do buffet por dia da semana (os mesmos da tabela de valores do site);
// um dia novo nasce com eles sugeridos.
export const PRECOS_SUGERIDOS: Record<number, { livre: number; kg: number }> = {
  1: { livre: 40.9, kg: 94.9 },
  2: { livre: 40.9, kg: 94.9 },
  3: { livre: 40.9, kg: 94.9 },
  4: { livre: 40.9, kg: 94.9 },
  5: { livre: 45.9, kg: 99.9 },
  6: { livre: 67.9, kg: 149.9 },
};

// A cozinha escrevia "Frango assado M" pra marcar marmita. Marmita agora é
// bloco próprio na TV, então o "M" no fim do nome sai antes de gravar.
export const limparNomePrato = (s: string) => s.replace(/\s+M$/, "").replace(/\s+/g, " ").trim();
export const linhas = (t: string | null | undefined) =>
  (t ?? "").split("\n").map((l) => limparNomePrato(l)).filter(Boolean);
export const chaveNome = (s: string) => limparNomePrato(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const diaValido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Rascunho → Publicado → "Publicado com alterações não publicadas" (alguém
// salvou depois da última publicação; o site segue com a versão publicada).
export function statusCardapio(c: CardapioDia | null): StatusCardapio {
  if (!c) return "vazio";
  if (!c.publicado) return c.proteinas || c.carboidratos || c.especial ? "rascunho" : "vazio";
  if (c.alterado_em && c.publicado_em && Date.parse(c.alterado_em) > Date.parse(c.publicado_em) + 1000) return "alterado";
  return "publicado";
}

export async function registrarPublicacao(db: Db, data: string, acao: Publicacao["acao"], ator: Ator, detalhe?: string) {
  await db.from("cardapio_publicacoes").insert({
    data, acao, detalhe: detalhe ?? null,
    por_nome: ator.nome || null, por_user_id: ator.userId ?? null, por_colab_id: ator.colabId ?? null,
  });
}

// ---------- Buffet ----------
export async function lerCardapioDia(db: Db, data: string): Promise<CardapioDia | null> {
  const { data: row } = await db.from("cardapio_dia").select("*").eq("data", data).maybeSingle();
  return (row as CardapioDia | null) ?? null;
}

export async function listarCardapios(db: Db, de: string, ate: string): Promise<CardapioDia[]> {
  const { data } = await db.from("cardapio_dia").select("*").gte("data", de).lte("data", ate).order("data");
  return (data as CardapioDia[]) ?? [];
}

// Salva SEM mexer no publicado: dia no ar continua no ar (com a versão
// publicada) até alguém apertar Publicar de novo.
export async function salvarCardapioDia(db: Db, data: string, d: DadosCardapio, ator: Ator, empresaId: string) {
  if (!diaValido(data)) return { ok: false as const, mensagem: "Dia inválido." };
  const agora = new Date().toISOString();
  const atual = await lerCardapioDia(db, data);
  const { error } = await db.from("cardapio_dia").upsert(
    {
      empresa_id: empresaId,
      data,
      proteinas: linhas(d.proteinas).join("\n") || null,
      carboidratos: linhas(d.carboidratos).join("\n") || null,
      especial: linhas(d.especial).join("\n") || null,
      preco_livre: d.preco_livre,
      preco_kg: d.preco_kg,
      publicado: atual?.publicado ?? false,
      atualizado_em: agora,
      alterado_em: agora,
      alterado_por: ator.nome || null,
    },
    { onConflict: "empresa_id,data" },
  );
  if (error) return { ok: false as const, mensagem: "Não consegui salvar." };
  // Garante os itens no catálogo (pra busca); os USOS só contam na publicação.
  await garantirNoCatalogo(db, { proteinas: linhas(d.proteinas), carboidratos: linhas(d.carboidratos), especial: linhas(d.especial) });
  await registrarPublicacao(db, data, "salvo", ator);
  return { ok: true as const };
}

// Publica o que está gravado (salve antes). Site e TV passam a mostrar.
export async function publicarCardapioDia(db: Db, data: string, ator: Ator) {
  if (!diaValido(data)) return { ok: false as const, mensagem: "Dia inválido." };
  const atual = await lerCardapioDia(db, data);
  if (!atual || (!atual.proteinas && !atual.carboidratos && !atual.especial)) {
    return { ok: false as const, mensagem: "Coloque pelo menos um prato antes de publicar." };
  }
  const agora = new Date().toISOString();
  const { error } = await db
    .from("cardapio_dia")
    .update({ publicado: true, publicado_em: agora, publicado_por: ator.nome || null, atualizado_em: agora })
    .eq("data", data);
  if (error) return { ok: false as const, mensagem: "Não consegui publicar." };
  await recalcularUsos(db);
  await registrarPublicacao(db, data, "publicado", ator);
  return { ok: true as const };
}

// Salva e publica de uma vez (o botão do painel "Salvar e manter no ar").
export async function salvarEPublicarCardapioDia(db: Db, data: string, d: DadosCardapio, ator: Ator, empresaId: string) {
  const s = await salvarCardapioDia(db, data, d, ator, empresaId);
  if (!s.ok) return s;
  return publicarCardapioDia(db, data, ator);
}

export async function despublicarCardapioDia(db: Db, data: string, ator: Ator) {
  await db.from("cardapio_dia").update({ publicado: false, atualizado_em: new Date().toISOString() }).eq("data", data);
  await registrarPublicacao(db, data, "despublicado", ator);
  return { ok: true as const };
}

export async function apagarCardapioDia(db: Db, data: string, ator: Ator) {
  await db.from("cardapio_dia").delete().eq("data", data);
  await registrarPublicacao(db, data, "apagado", ator);
  return { ok: true as const };
}

// ---------- Catálogo (busca de itens já usados) ----------
export async function listarCatalogo(db: Db): Promise<ItemCatalogo[]> {
  const { data } = await db.from("cardapio_itens").select("id, grupo, nome, usos").eq("ativo", true).order("nome");
  return (data as ItemCatalogo[]) ?? [];
}

// Garante o item no catálogo (sem mexer nos usos). Grafia diferente só em
// acento/maiúscula conta como o mesmo item.
async function garantirNoCatalogo(db: Db, porGrupo: Record<Grupo, string[]>) {
  const { data } = await db.from("cardapio_itens").select("id, grupo, nome, ativo");
  const atuais = (data as { id: string; grupo: string; nome: string; ativo: boolean }[]) ?? [];
  for (const grupo of GRUPOS) {
    for (const nome of porGrupo[grupo]) {
      const achado = atuais.find((i) => i.grupo === grupo && chaveNome(i.nome) === chaveNome(nome));
      if (achado) { if (!achado.ativo) await db.from("cardapio_itens").update({ ativo: true }).eq("id", achado.id); }
      else await db.from("cardapio_itens").insert({ grupo, nome, usos: 0 });
    }
  }
}

// Usos = em quantos dias PUBLICADOS o prato entrou. Recalculado do zero a cada
// publicação (são poucas linhas), então nunca infla com salvamentos repetidos.
export async function recalcularUsos(db: Db) {
  const [{ data: dias }, { data: itens }] = await Promise.all([
    db.from("cardapio_dia").select("proteinas, carboidratos, especial").eq("publicado", true),
    db.from("cardapio_itens").select("id, grupo, nome, usos"),
  ]);
  const cont = new Map<string, number>();
  for (const d of (dias as { proteinas: string | null; carboidratos: string | null; especial: string | null }[]) ?? []) {
    for (const grupo of GRUPOS) for (const nome of new Set(linhas(d[grupo]).map(chaveNome))) {
      const k = grupo + "|" + nome; cont.set(k, (cont.get(k) ?? 0) + 1);
    }
  }
  for (const i of (itens as { id: string; grupo: string; nome: string; usos: number }[]) ?? []) {
    const novo = cont.get(i.grupo + "|" + chaveNome(i.nome)) ?? 0;
    if (novo !== Number(i.usos)) await db.from("cardapio_itens").update({ usos: novo }).eq("id", i.id);
  }
}

// Estatística de uso pra busca do app: vezes na semana e no mês (dias
// publicados) e a última data, contadas a partir do dia que está sendo editado.
export type EstatPrato = { semana: number; mes: number; ultimo: string | null; recente: boolean };
export async function estatisticasPratos(db: Db, dia: string): Promise<Record<string, EstatPrato>> {
  const de = addDiasIso(dia, -31);
  const { data } = await db.from("cardapio_dia").select("data, proteinas, carboidratos, especial").eq("publicado", true).gte("data", de).lt("data", dia).order("data");
  const out: Record<string, EstatPrato> = {};
  const semanaDe = addDiasIso(dia, -7), recenteDe = addDiasIso(dia, -2);
  for (const d of (data as { data: string; proteinas: string | null; carboidratos: string | null; especial: string | null }[]) ?? []) {
    for (const grupo of GRUPOS) for (const nome of new Set(linhas(d[grupo]).map(chaveNome))) {
      const k = grupo + "|" + nome;
      const e = out[k] ?? (out[k] = { semana: 0, mes: 0, ultimo: null, recente: false });
      e.mes++;
      if (d.data >= semanaDe) e.semana++;
      if (d.data >= recenteDe) e.recente = true;
      if (!e.ultimo || d.data > e.ultimo) e.ultimo = d.data;
    }
  }
  return out;
}

export async function criarItensCatalogo(db: Db, grupo: Grupo, texto: string, empresaId: string) {
  const nomes = [...new Set(linhas(texto))];
  if (nomes.length === 0) return { ok: false as const, mensagem: "Nada para cadastrar." };
  const { error } = await db
    .from("cardapio_itens")
    .upsert(
      nomes.map((nome) => ({ empresa_id: empresaId, grupo, nome, usos: 0 })),
      { onConflict: "empresa_id,grupo,nome", ignoreDuplicates: true },
    );
  if (error) return { ok: false as const, mensagem: "Não consegui cadastrar." };
  return { ok: true as const, total: nomes.length };
}

export async function apagarItemCatalogo(db: Db, id: string) {
  await db.from("cardapio_itens").delete().eq("id", id);
  return { ok: true as const };
}

// ---------- Saladas ----------
export const CATEGORIAS_SALADA = ["Folhas", "Maioneses", "Cozidas", "Cruas", "Grãos", "Conservas", "Outros"] as const;
export type CategoriaSalada = (typeof CATEGORIAS_SALADA)[number];
export type SaladaBase = { id: string; nome: string; categoria: CategoriaSalada };

export async function listarSaladasBase(db: Db): Promise<SaladaBase[]> {
  const { data } = await db.from("saladas_base").select("id, nome, categoria").eq("ativo", true).order("nome");
  return (data as SaladaBase[]) ?? [];
}
export async function saladasDoDia(db: Db, data: string): Promise<string[]> {
  const { data: rows } = await db.from("cardapio_dia_saladas").select("salada_id").eq("data", data);
  return ((rows as { salada_id: string }[]) ?? []).map((r) => r.salada_id);
}
export async function padraoSemanaSaladas(db: Db, dow: number): Promise<string[]> {
  const { data } = await db.from("saladas_semana").select("salada_id").eq("dow", dow);
  return ((data as { salada_id: string }[]) ?? []).map((r) => r.salada_id);
}
// Grava o conjunto do dia (substitui). Lista vazia = volta ao padrão da semana.
export async function salvarSaladasDia(db: Db, data: string, ids: string[], ator: Ator) {
  if (!diaValido(data)) return { ok: false as const, mensagem: "Dia inválido." };
  const { error: e1 } = await db.from("cardapio_dia_saladas").delete().eq("data", data);
  if (e1) return { ok: false as const, mensagem: e1.message };
  const unicos = [...new Set(ids)];
  if (unicos.length > 0) {
    const { error: e2 } = await db.from("cardapio_dia_saladas").insert(unicos.map((salada_id) => ({ data, salada_id })));
    if (e2) return { ok: false as const, mensagem: e2.message };
  }
  await registrarPublicacao(db, data, "saladas", ator, unicos.length ? `${unicos.length} salada(s)` : "voltou ao padrão da semana");
  return { ok: true as const };
}
export async function salvarPadraoSemanaSaladas(db: Db, dow: number, ids: string[]) {
  if (!(dow >= 0 && dow <= 6)) return { ok: false as const, mensagem: "Dia inválido." };
  const { error: e1 } = await db.from("saladas_semana").delete().eq("dow", dow);
  if (e1) return { ok: false as const, mensagem: e1.message };
  const unicos = [...new Set(ids)];
  if (unicos.length > 0) {
    const { error: e2 } = await db.from("saladas_semana").insert(unicos.map((salada_id) => ({ dow, salada_id })));
    if (e2) return { ok: false as const, mensagem: e2.message };
  }
  return { ok: true as const };
}
export async function criarSalada(db: Db, nome: string, categoria: CategoriaSalada, empresaId: string) {
  const n = nome.trim().slice(0, 60);
  if (n.length < 2) return { ok: false as const, mensagem: "Escreva o nome da salada." };
  if (!CATEGORIAS_SALADA.includes(categoria)) return { ok: false as const, mensagem: "Categoria inválida." };
  const { data, error } = await db
    .from("saladas_base")
    .upsert({ empresa_id: empresaId, nome: n, categoria, ativo: true }, { onConflict: "empresa_id,nome" })
    .select("id")
    .single();
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, id: (data as { id: string }).id };
}
export async function removerSalada(db: Db, id: string) {
  const { error } = await db.from("saladas_base").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const };
}

// ---------- Cardápio montado pra TV (e pra quem mais quiser o dia inteiro) ----------
export type CardapioTv = {
  dia: string;                    // YYYY-MM-DD do cardápio que vale agora
  buffet: { proteinas: string[]; carboidratos: string[]; especial: string[]; publicado: boolean } | null;
  saladas: { categoria: string; itens: string[] }[] | null;
  kern: KernDia | null;
};
const ORDEM_SALADAS = [...CATEGORIAS_SALADA];

// Buffet do dia (cardapio_dia), saladas (seleção da data ou, sem ela, o padrão
// do dia da semana) e marmitas Kern — tudo do mesmo dia.
// (a marmita vem por parâmetro: este arquivo é importado também pelo navegador
// e não pode puxar o cliente admin do banco.)
export async function montarCardapioDia(db: Db, dia: string, kern: KernDia | null): Promise<CardapioTv> {
  const [{ data: cd }, { data: salDia }, { data: salSemana }] = await Promise.all([
    db.from("cardapio_dia").select("proteinas, carboidratos, especial, publicado").eq("data", dia).maybeSingle(),
    db.from("cardapio_dia_saladas").select("saladas_base(nome, categoria, ativo)").eq("data", dia),
    db.from("saladas_semana").select("saladas_base(nome, categoria, ativo)").eq("dow", diaSemanaIso(dia)),
  ]);
  const sal = (salDia && salDia.length > 0) ? salDia : salSemana;
  const c = cd as { proteinas: string | null; carboidratos: string | null; especial: string | null; publicado: boolean } | null;
  const buffet = c ? { proteinas: linhas(c.proteinas), carboidratos: linhas(c.carboidratos), especial: linhas(c.especial), publicado: !!c.publicado } : null;
  const grupos = new Map<string, string[]>();
  type SalRow = { saladas_base: { nome: string; categoria: string; ativo: boolean } | { nome: string; categoria: string; ativo: boolean }[] | null };
  for (const r of ((sal as unknown as SalRow[]) ?? [])) {
    const s = Array.isArray(r.saladas_base) ? r.saladas_base[0] : r.saladas_base;
    if (!s || !s.ativo) continue;
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, []);
    grupos.get(s.categoria)!.push(s.nome);
  }
  const saladas = ORDEM_SALADAS.filter((g) => grupos.has(g)).map((g) => ({ categoria: g, itens: grupos.get(g)!.sort((a, b) => a.localeCompare(b, "pt-BR")) }));
  return { dia, buffet, saladas: saladas.length ? saladas : null, kern };
}

// ---------- Histórico ----------
export async function historicoPublicacoes(db: Db, opts: { data?: string; limite?: number } = {}): Promise<Publicacao[]> {
  let q = db.from("cardapio_publicacoes").select("id, data, acao, detalhe, por_nome, em").order("em", { ascending: false }).limit(opts.limite ?? 30);
  if (opts.data) q = q.eq("data", opts.data);
  const { data } = await q;
  return (data as Publicacao[]) ?? [];
}
export const ROTULO_ACAO: Record<string, string> = {
  salvo: "salvou", publicado: "publicou", despublicado: "tirou do ar", apagado: "apagou", saladas: "marcou as saladas", marmita: "mudou a marmita",
};
