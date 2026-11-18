"use server";

// Fichas técnicas (0320). Toda ação confere a permissão "fichas" no servidor.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { explicarErro } from "@/lib/erro-amigavel";
import { UNIDADES } from "@/lib/fichas";

type R = { ok: true } | { ok: false; erro: string };
const ERRO_REDE = "Não consegui salvar. Confira a internet e tente de novo.";

async function db() {
  await exigirAcesso("/fichas-tecnicas");
  return createClient();
}
const num = (v: FormDataEntryValue | string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // "1.234,5" ou "0,5"
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max) || null;
const atualizar = (id?: string) => { revalidatePath("/fichas-tecnicas"); if (id) revalidatePath(`/fichas-tecnicas/${id}`); };

export async function criarFicha(formData: FormData) {
  const supabase = await db();
  const nome = texto(formData.get("nome"), 120);
  if (!nome || nome.length < 2) return { ok: false as const, erro: "Escreva o nome da ficha." };
  const { data, error } = await supabase.from("fichas_tecnicas").insert({ nome, categoria: texto(formData.get("categoria"), 60) }).select("id").single();
  if (error) return { ok: false as const, erro: error.code === "23505" ? "Já existe uma ficha com esse nome." : explicarErro(error) };
  atualizar();
  redirect(`/fichas-tecnicas/${(data as { id: string }).id}`);
}

export async function salvarFicha(id: string, formData: FormData): Promise<R> {
  const supabase = await db();
  const nome = texto(formData.get("nome"), 120);
  if (!nome || nome.length < 2) return { ok: false, erro: "Escreva o nome da ficha." };
  const rendimento = num(formData.get("rendimento_kg"));
  if (rendimento != null && rendimento <= 0) return { ok: false, erro: "O rendimento tem que ser maior que zero." };
  const { error } = await supabase.from("fichas_tecnicas").update({
    nome,
    categoria: texto(formData.get("categoria"), 60),
    rendimento_kg: rendimento,
    rendimento_texto: texto(formData.get("rendimento_texto"), 60),
    base: formData.get("base") === "on",
    obs: texto(formData.get("obs"), 2000),
    atualizado_em: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe uma ficha com esse nome." : explicarErro(error) };
  atualizar(id);
  return { ok: true };
}

export async function excluirFicha(id: string): Promise<R> {
  const supabase = await db();
  const { count } = await supabase.from("ficha_itens").select("id", { count: "exact", head: true }).eq("sub_ficha_id", id);
  if ((count ?? 0) > 0) return { ok: false, erro: `Esta ficha é usada dentro de ${count} outra(s). Tire de lá antes de excluir.` };
  const { error } = await supabase.from("fichas_tecnicas").delete().eq("id", id);
  if (error) return { ok: false, erro: ERRO_REDE };
  atualizar();
  redirect("/fichas-tecnicas");
}

/** Liga um prato do cardápio a esta ficha (ou tira, com fichaId null). Um prato tem uma ficha; a ficha serve a vários pratos. */
export async function ligarPrato(fichaId: string, cardapioItemId: string, ligar: boolean): Promise<R> {
  const supabase = await db();
  let q = supabase.from("cardapio_itens").update({ ficha_id: ligar ? fichaId : null }).eq("id", cardapioItemId);
  if (!ligar) q = q.eq("ficha_id", fichaId);
  const { error } = await q;
  if (error) return { ok: false, erro: ERRO_REDE };
  atualizar(fichaId);
  revalidatePath("/cardapio-do-dia");
  return { ok: true };
}

export async function adicionarItem(fichaId: string, formData: FormData): Promise<R> {
  const supabase = await db();
  const descricao = texto(formData.get("descricao"), 120);
  if (!descricao) return { ok: false, erro: "Escreva o ingrediente." };
  const unidade = String(formData.get("unidade") ?? "kg");
  const { data: ult } = await supabase.from("ficha_itens").select("ordem").eq("ficha_id", fichaId).order("ordem", { ascending: false }).limit(1);
  const { error } = await supabase.from("ficha_itens").insert({
    ficha_id: fichaId,
    descricao,
    quantidade: num(formData.get("quantidade")) ?? 0,
    unidade: (UNIDADES as readonly string[]).includes(unidade) ? unidade : "kg",
    ordem: (((ult as { ordem: number }[] | null)?.[0]?.ordem) ?? -1) + 1,
  });
  if (error) return { ok: false, erro: ERRO_REDE };
  atualizar(fichaId);
  return { ok: true };
}

/** Quantidade, unidade e conversão de um ingrediente. */
export async function salvarItem(fichaId: string, itemId: string, campos: { quantidade?: string; unidade?: string; conversao?: string; descricao?: string }): Promise<R> {
  const supabase = await db();
  const upd: Record<string, unknown> = {};
  if (campos.quantidade !== undefined) { const q = num(campos.quantidade); if (q == null || q < 0) return { ok: false, erro: "Quantidade inválida." }; upd.quantidade = q; }
  if (campos.unidade !== undefined) { if (!(UNIDADES as readonly string[]).includes(campos.unidade)) return { ok: false, erro: "Unidade inválida." }; upd.unidade = campos.unidade; }
  if (campos.conversao !== undefined) { const c = num(campos.conversao); if (c != null && c <= 0) return { ok: false, erro: "A conversão tem que ser maior que zero." }; upd.conversao = c; }
  if (campos.descricao !== undefined) { const d = campos.descricao.trim().slice(0, 120); if (!d) return { ok: false, erro: "Escreva o ingrediente." }; upd.descricao = d; }
  const { data: item, error } = await supabase.from("ficha_itens").update(upd).eq("id", itemId).eq("ficha_id", fichaId).select("produto_id, unidade").maybeSingle();
  if (error) return { ok: false, erro: ERRO_REDE };
  // Conversão é do PRODUTO: vale pras outras fichas que usam o mesmo produto na
  // mesma unidade e ainda não têm uma (o óleo de soja aparece em 35 receitas).
  const it = item as { produto_id: string | null; unidade: string } | null;
  if (upd.conversao != null && it?.produto_id) {
    await supabase.from("ficha_itens").update({ conversao: upd.conversao }).eq("produto_id", it.produto_id).eq("unidade", it.unidade).is("conversao", null);
    revalidatePath("/fichas-tecnicas", "layout");
  }
  atualizar(fichaId);
  return { ok: true };
}

/** Liga o ingrediente a um produto do estoque OU a outra ficha (um tira o outro). */
export async function ligarItem(fichaId: string, itemId: string, alvo: { produtoId?: string | null; subFichaId?: string | null }): Promise<R> {
  const supabase = await db();
  if (alvo.subFichaId === fichaId) return { ok: false, erro: "A ficha não pode usar ela mesma." };
  const { error } = await supabase.from("ficha_itens").update({
    produto_id: alvo.produtoId ?? null,
    sub_ficha_id: alvo.subFichaId ?? null,
    conversao: null, // a conversão era do produto antigo; recalcula sozinha ou a pessoa ajusta
  }).eq("id", itemId).eq("ficha_id", fichaId);
  if (error) return { ok: false, erro: ERRO_REDE };
  atualizar(fichaId);
  return { ok: true };
}

export async function tirarItem(fichaId: string, itemId: string): Promise<R> {
  const supabase = await db();
  const { error } = await supabase.from("ficha_itens").delete().eq("id", itemId).eq("ficha_id", fichaId);
  if (error) return { ok: false, erro: ERRO_REDE };
  atualizar(fichaId);
  return { ok: true };
}

// ---- buscas (sempre no banco) ----
const limpaBusca = (q: string) => q.trim().replace(/[%_,()]/g, " ").slice(0, 60);

export async function buscarProdutos(q: string) {
  const supabase = await db();
  const t = limpaBusca(q);
  if (t.length < 2) return [];
  const { data } = await supabase.from("produtos").select("id, nome, unidade, preco_referencia").eq("ativo", true).ilike("nome", `%${t}%`).order("nome").limit(20);
  return (data as { id: string; nome: string; unidade: string; preco_referencia: number | null }[] | null) ?? [];
}

export async function buscarFichas(q: string, tirar?: string) {
  const supabase = await db();
  const t = limpaBusca(q);
  if (t.length < 2) return [];
  let consulta = supabase.from("fichas_tecnicas").select("id, nome, rendimento_kg").eq("ativo", true).ilike("nome", `%${t}%`).order("nome").limit(20);
  if (tirar) consulta = consulta.neq("id", tirar);
  const { data } = await consulta;
  return (data as { id: string; nome: string; rendimento_kg: number | null }[] | null) ?? [];
}

export async function buscarPratos(q: string) {
  const supabase = await db();
  const t = limpaBusca(q);
  if (t.length < 2) return [];
  const { data } = await supabase.from("cardapio_itens").select("id, nome, grupo, ficha_id").eq("ativo", true).ilike("nome", `%${t}%`).order("nome").limit(20);
  return (data as { id: string; nome: string; grupo: string; ficha_id: string | null }[] | null) ?? [];
}
