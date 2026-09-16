// Regra de negócio do CARDÁPIO DO DIA (buffet, saladas, catálogo e histórico),
// num lugar só. Quem chama passa o cliente de banco e quem está agindo:
//  - painel (/cardapio-do-dia): cliente com sessão (RLS) + nome do usuário;
//  - app da equipe (/eu/{token}/cardapio): cliente admin + nome do colaborador
//    (a permissão foi conferida antes, pelo token + PIN + faz_cardapio).
// Sem "use server" aqui de propósito: é biblioteca, não ação.
import type { createAdminClient } from "@/lib/supabase/admin";

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

export const linhas = (t: string | null | undefined) =>
  (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
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
export async function salvarCardapioDia(db: Db, data: string, d: DadosCardapio, ator: Ator) {
  if (!diaValido(data)) return { ok: false as const, mensagem: "Dia inválido." };
  const agora = new Date().toISOString();
  const atual = await lerCardapioDia(db, data);
  const { error } = await db.from("cardapio_dia").upsert(
    {
      data,
      proteinas: d.proteinas.trim() || null,
      carboidratos: d.carboidratos.trim() || null,
      especial: d.especial.trim() || null,
      preco_livre: d.preco_livre,
      preco_kg: d.preco_kg,
      publicado: atual?.publicado ?? false,
      atualizado_em: agora,
      alterado_em: agora,
      alterado_por: ator.nome || null,
    },
    { onConflict: "data" },
  );
  if (error) return { ok: false as const, mensagem: "Não consegui salvar." };
  await contarUsos(db, { proteinas: linhas(d.proteinas), carboidratos: linhas(d.carboidratos), especial: linhas(d.especial) });
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
  await registrarPublicacao(db, data, "publicado", ator);
  return { ok: true as const };
}

// Salva e publica de uma vez (o botão do painel "Salvar e manter no ar").
export async function salvarEPublicarCardapioDia(db: Db, data: string, d: DadosCardapio, ator: Ator) {
  const s = await salvarCardapioDia(db, data, d, ator);
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

// Garante o item no catálogo e soma 1 no contador de usos.
async function contarUsos(db: Db, porGrupo: Record<Grupo, string[]>) {
  const { data } = await db.from("cardapio_itens").select("id, grupo, nome, usos");
  const atuais = (data as { id: string; grupo: string; nome: string; usos: number }[]) ?? [];
  for (const grupo of GRUPOS) {
    for (const nome of porGrupo[grupo]) {
      const achado = atuais.find((i) => i.grupo === grupo && i.nome === nome);
      if (achado) await db.from("cardapio_itens").update({ usos: achado.usos + 1, ativo: true }).eq("id", achado.id);
      else await db.from("cardapio_itens").insert({ grupo, nome, usos: 1 });
    }
  }
}

export async function criarItensCatalogo(db: Db, grupo: Grupo, texto: string) {
  const nomes = [...new Set(linhas(texto))];
  if (nomes.length === 0) return { ok: false as const, mensagem: "Nada para cadastrar." };
  const { error } = await db
    .from("cardapio_itens")
    .upsert(nomes.map((nome) => ({ grupo, nome })), { onConflict: "grupo,nome", ignoreDuplicates: true });
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
export async function criarSalada(db: Db, nome: string, categoria: CategoriaSalada) {
  const n = nome.trim().slice(0, 60);
  if (n.length < 2) return { ok: false as const, mensagem: "Escreva o nome da salada." };
  if (!CATEGORIAS_SALADA.includes(categoria)) return { ok: false as const, mensagem: "Categoria inválida." };
  const { data, error } = await db
    .from("saladas_base")
    .upsert({ nome: n, categoria, ativo: true }, { onConflict: "nome" })
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
