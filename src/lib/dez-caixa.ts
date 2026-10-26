// 10% da noite puxado do CAIXA (migration 0250): soma do serviço das comandas
// de cada noite (rpc servico_noites). Roda ao abrir a tela Semana e 10%.
//  - noite já encerrada (passou das 06:00 do dia seguinte) entra sozinha;
//  - a que veio do caixa acompanha comanda fechada depois;
//  - digitada à mão (origem manual) nunca é trocada;
//  - semana já paga (mais de 3 acertos lançados) não muda.
import type { createClient } from "@/lib/supabase/server";
import { empresaAtualId } from "@/lib/empresa";
import { segundaDe, somarDias } from "@/lib/equipe";

type Db = Awaited<ReturnType<typeof createClient>>;
type LinhaDez = { data: string; valor: number; pagar_em: string; origem: string; desconto_pct?: number };

/** % do 10% que fica com a casa pros custos de nota e cartão nas noites novas (pdv_config, migration 0256). */
export async function descontoDezPadrao(supabase: Db): Promise<number> {
  const { data } = await supabase.from("pdv_config").select("valor").eq("chave", "dez_desconto_pct").maybeSingle();
  const n = Number((data as { valor: string | null } | null)?.valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Grava o 10% das noites encerradas que vieram do caixa e devolve o do caixa por noite. */
export async function sincronizarDezDoCaixa(supabase: Db, segunda: string, fim: string, agora = Date.now()): Promise<Record<string, number>> {
  const deCaixa = somarDias(segunda, -14);
  const { data: servRows } = await supabase.rpc("servico_noites", { p_de: deCaixa, p_ate: fim });
  const servicoCaixa: Record<string, number> = {};
  for (const r of (servRows as { noite: string; servico: number }[]) ?? []) servicoCaixa[String(r.noite).slice(0, 10)] = Number(r.servico) || 0;

  const encerradas = Object.keys(servicoCaixa).filter((d) => agora >= new Date(`${somarDias(d, 1)}T06:00:00-03:00`).getTime());
  if (encerradas.length === 0) return servicoCaixa;

  const [{ data: jaDez }, { data: lancados }] = await Promise.all([
    supabase.from("dez_por_cento_noites").select("data, valor, pagar_em, origem, desconto_pct").in("data", encerradas),
    supabase.from("semana_pagamentos").select("segunda").not("lancamento_id", "is", null).gte("segunda", deCaixa),
  ]);
  // Semana com um ou outro acerto adiantado ainda não conta como paga.
  const acertos = new Map<string, number>();
  for (const x of (lancados as { segunda: string }[]) ?? []) {
    const k = String(x.segunda).slice(0, 10);
    acertos.set(k, (acertos.get(k) ?? 0) + 1);
  }
  const existente = new Map(((jaDez as LinhaDez[]) ?? []).map((x) => [String(x.data).slice(0, 10), x]));
  const empresaId = await empresaAtualId();
  const pctNovas = await descontoDezPadrao(supabase);

  const gravar: (LinhaDez & { empresa_id: string | null })[] = [];
  for (const d of encerradas) {
    const e = existente.get(d);
    const pagarEm = e?.pagar_em ? String(e.pagar_em).slice(0, 10) : somarDias(segundaDe(d), 7);
    if ((acertos.get(pagarEm) ?? 0) > 3) continue;
    const v = servicoCaixa[d];
    const atualiza = !e || !(Number(e.valor) > 0) || (e.origem === "caixa" && Math.abs(Number(e.valor) - v) > 0.009);
    // Noite nova leva o desconto padrão; a que já existe mantém o dela.
    if (atualiza) gravar.push({ empresa_id: empresaId, data: d, valor: v, pagar_em: pagarEm, origem: "caixa", desconto_pct: e ? Number(e.desconto_pct) || 0 : pctNovas });
  }
  if (gravar.length) await supabase.from("dez_por_cento_noites").upsert(gravar, { onConflict: "empresa_id,data" });
  return servicoCaixa;
}
