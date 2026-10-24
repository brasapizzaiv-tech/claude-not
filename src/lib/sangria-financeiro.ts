// Sangria com categoria (migration 0252): dinheiro que saiu do caixa pra
// pagar alguém (motoboy, faxina, garçom da associação…) vira DESPESA paga em
// dinheiro no financeiro, ligada ao movimento. Sem categoria é só retirada.
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type CategoriaSangria = { id: string; nome: string; grupo: string | null; usos: number };

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Categorias de despesa, com as mais usadas em pagamento em dinheiro primeiro. */
export async function categoriasDeSangria(db: Db): Promise<CategoriaSangria[]> {
  const desde = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [{ data: cats }, { data: usados }] = await Promise.all([
    db.from("dre_categorias").select("id, nome, grupo, tipo").eq("ativo", true).not("tipo", "in", "(receita,deducao)").order("nome"),
    db.from("lancamentos").select("categoria_id").ilike("forma_pagamento", "%dinheiro%").gte("data", desde).limit(1000),
  ]);
  const usos = new Map<string, number>();
  for (const u of (usados as { categoria_id: string | null }[]) ?? []) if (u.categoria_id) usos.set(u.categoria_id, (usos.get(u.categoria_id) ?? 0) + 1);
  return ((cats as { id: string; nome: string; grupo: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, usos: usos.get(c.id) ?? 0 }));
}

/** Lança (ou troca a categoria de) a despesa de uma sangria. Idempotente. */
export async function lancarSangriaNoFinanceiro(db: Db, movId: string, categoriaId: string) {
  const { data: mov } = await db.from("pdv_caixa_mov").select("id, tipo, descricao, valor, criado_em, lancamento_id").eq("id", movId).maybeSingle();
  const m = mov as { id: string; tipo: string; descricao: string | null; valor: number; criado_em: string; lancamento_id: string | null } | null;
  if (!m || m.tipo !== "sangria") return { ok: false as const, mensagem: "Sangria não encontrada." };
  if (m.lancamento_id) {
    const { error } = await db.from("lancamentos").update({ categoria_id: categoriaId }).eq("id", m.lancamento_id);
    return error ? { ok: false as const, mensagem: error.message } : { ok: true as const, lancamentoId: m.lancamento_id };
  }
  const dia = diaSP(m.criado_em);
  const { data: l, error } = await db.from("lancamentos").insert({
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
  if (error || !l) return { ok: false as const, mensagem: error?.message ?? "Não lançou." };
  await db.from("pdv_caixa_mov").update({ lancamento_id: l.id }).eq("id", m.id);
  return { ok: true as const, lancamentoId: l.id as string };
}

/** Tira a sangria do financeiro (apaga a despesa criada por ela). */
export async function desfazerSangriaNoFinanceiro(db: Db, movId: string) {
  const { data: mov } = await db.from("pdv_caixa_mov").select("lancamento_id").eq("id", movId).maybeSingle();
  const lid = (mov as { lancamento_id: string | null } | null)?.lancamento_id;
  if (!lid) return { ok: true as const };
  await db.from("pdv_caixa_mov").update({ lancamento_id: null }).eq("id", movId);
  await db.from("lancamentos").delete().eq("id", lid).eq("origem", "caixa");
  return { ok: true as const };
}
