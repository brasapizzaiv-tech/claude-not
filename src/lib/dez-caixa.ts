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
type LinhaDez = { data: string; valor: number; pagar_em: string; origem: string };

/** Grava o 10% das noites encerradas que vieram do caixa e devolve o do caixa por noite. */
export async function sincronizarDezDoCaixa(supabase: Db, segunda: string, fim: string, agora = Date.now()): Promise<Record<string, number>> {
  const deCaixa = somarDias(segunda, -14);
  const { data: servRows } = await supabase.rpc("servico_noites", { p_de: deCaixa, p_ate: fim });
  const servicoCaixa: Record<string, number> = {};
  for (const r of (servRows as { noite: string; servico: number }[]) ?? []) servicoCaixa[String(r.noite).slice(0, 10)] = Number(r.servico) || 0;

  const encerradas = Object.keys(servicoCaixa).filter((d) => agora >= new Date(`${somarDias(d, 1)}T06:00:00-03:00`).getTime());
  if (encerradas.length === 0) return servicoCaixa;

  const [{ data: jaDez }, { data: lancados }] = await Promise.all([
    supabase.from("dez_por_cento_noites").select("data, valor, pagar_em, origem").in("data", encerradas),
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

  const gravar: (LinhaDez & { empresa_id: string | null })[] = [];
  for (const d of encerradas) {
    const e = existente.get(d);
    const pagarEm = e?.pagar_em ? String(e.pagar_em).slice(0, 10) : somarDias(segundaDe(d), 7);
    if ((acertos.get(pagarEm) ?? 0) > 3) continue;
    const v = servicoCaixa[d];
    const atualiza = !e || !(Number(e.valor) > 0) || (e.origem === "caixa" && Math.abs(Number(e.valor) - v) > 0.009);
    if (atualiza) gravar.push({ empresa_id: empresaId, data: d, valor: v, pagar_em: pagarEm, origem: "caixa" });
  }
  if (gravar.length) await supabase.from("dez_por_cento_noites").upsert(gravar, { onConflict: "empresa_id,data" });
  return servicoCaixa;
}
