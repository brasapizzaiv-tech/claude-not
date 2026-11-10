// Sangria com categoria (migration 0252): dinheiro que saiu do caixa pra
// pagar alguém (motoboy, faxina, garçom da associação…) vira DESPESA paga em
// dinheiro no financeiro, ligada ao movimento. Sem categoria é só retirada.
//
// Quem faz a sangria é o caixa (permissão Salão), que não lê o financeiro
// (SEC-04, migration 0296). Por isso a despesa é gravada pelo `fin`: o cliente
// administrativo + a empresa, depois de quem chama conferir a permissão. O
// movimento do caixa continua pela sessão.
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { explicarErro } from "@/lib/erro-amigavel";

type Db = Awaited<ReturnType<typeof createClient>>;
/** O financeiro pelo servidor: cliente administrativo + a empresa (filtro na mão). */
export type FinSangria = { admin: ReturnType<typeof createAdminClient>; empresaId: string };

export type CategoriaSangria = { id: string; nome: string; grupo: string | null; usos: number };

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** O `fin` desta sessão, ou null se não deu pra saber a empresa. Chamar só
 *  depois do `exigirAcesso`. */
export async function finDaSangria(): Promise<FinSangria | null> {
  const empresaId = await empresaAtualId();
  return empresaId ? { admin: createAdminClient(), empresaId } : null;
}

/** Categorias de despesa, com as mais usadas em pagamento em dinheiro primeiro.
 *  Com `fin`, conta os usos pelo servidor (o caixa não lê o financeiro). */
export async function categoriasDeSangria(db: Db, empresaId?: string, fin?: FinSangria | null): Promise<CategoriaSangria[]> {
  const desde = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  let qCats = db.from("dre_categorias").select("id, nome, grupo, tipo").eq("ativo", true).not("tipo", "in", "(receita,deducao)");
  let qUsados = fin
    ? fin.admin.from("lancamentos").select("categoria_id").eq("empresa_id", fin.empresaId).ilike("forma_pagamento", "%dinheiro%").gte("data", desde)
    : db.from("lancamentos").select("categoria_id").ilike("forma_pagamento", "%dinheiro%").gte("data", desde);
  if (empresaId) {
    qCats = qCats.eq("empresa_id", empresaId);
    qUsados = qUsados.eq("empresa_id", empresaId);
  }
  const [{ data: cats }, { data: usados }] = await Promise.all([qCats.order("nome"), qUsados.limit(1000)]);
  const usos = new Map<string, number>();
  for (const u of (usados as { categoria_id: string | null }[]) ?? []) if (u.categoria_id) usos.set(u.categoria_id, (usos.get(u.categoria_id) ?? 0) + 1);
  return ((cats as { id: string; nome: string; grupo: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, usos: usos.get(c.id) ?? 0 }));
}

/** Lança (ou troca a categoria de) a despesa de uma sangria. Idempotente. */
export async function lancarSangriaNoFinanceiro(db: Db, fin: FinSangria, movId: string, categoriaId: string) {
  // O movimento vem pela sessão: se não for da empresa de quem pede, nem aparece.
  const { data: mov } = await db.from("pdv_caixa_mov").select("id, tipo, descricao, valor, criado_em, lancamento_id").eq("id", movId).maybeSingle();
  const m = mov as { id: string; tipo: string; descricao: string | null; valor: number; criado_em: string; lancamento_id: string | null } | null;
  if (!m || m.tipo !== "sangria") return { ok: false as const, mensagem: "Sangria não encontrada." };
  const { data: cat } = await db.from("dre_categorias").select("id").eq("id", categoriaId).eq("empresa_id", fin.empresaId).maybeSingle();
  if (!cat) return { ok: false as const, mensagem: "Categoria não encontrada." };
  const lanc = fin.admin.from("lancamentos");
  if (m.lancamento_id) {
    const { error } = await lanc.update({ categoria_id: categoriaId }).eq("id", m.lancamento_id).eq("empresa_id", fin.empresaId);
    return error ? { ok: false as const, mensagem: explicarErro(error) } : { ok: true as const, lancamentoId: m.lancamento_id };
  }
  const dia = diaSP(m.criado_em);
  const { data: l, error } = await lanc.insert({
    empresa_id: fin.empresaId,
    data: dia,
    emissao: dia,
    vencimento: dia,
    pago: true,
    pago_em: dia,
    descricao: `Pago no caixa: ${(m.descricao || "sangria").trim()}`.slice(0, 200),
    categoria_id: categoriaId,
    valor: Number(m.valor),
    forma_pagamento: "Dinheiro",
    origem: "caixa",
  }).select("id").single();
  if (error || !l) return { ok: false as const, mensagem: explicarErro(error, "Não lançou.") };
  await db.from("pdv_caixa_mov").update({ lancamento_id: l.id }).eq("id", m.id);
  return { ok: true as const, lancamentoId: l.id as string };
}

/** Tira a sangria do financeiro (apaga a despesa criada por ela). */
export async function desfazerSangriaNoFinanceiro(db: Db, fin: FinSangria, movId: string) {
  const { data: mov } = await db.from("pdv_caixa_mov").select("lancamento_id").eq("id", movId).maybeSingle();
  const lid = (mov as { lancamento_id: string | null } | null)?.lancamento_id;
  if (!lid) return { ok: true as const };
  await db.from("pdv_caixa_mov").update({ lancamento_id: null }).eq("id", movId);
  await fin.admin.from("lancamentos").delete().eq("id", lid).eq("origem", "caixa").eq("empresa_id", fin.empresaId);
  return { ok: true as const };
}
