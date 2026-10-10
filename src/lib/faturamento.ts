import type { SupabaseClient } from "@supabase/supabase-js";

// FATURAMENTO POR DIA — a fonte única das telas de Notas × Faturamento, DRE e CMV.
//
// Regra, dia a dia:
//  1. Se o dia tem linha na planilha importada (faturamento_dias), vale a
//     planilha. Ela é o número fechado do Rafael e traz almoço E noite.
//  2. Senão, vale o caixa do sistema (vendas do PDV/salão; migration 0220).
//     Hoje (out/2026) o caixa só tem o almoço: a noite ainda roda fora.
// Importar a planilha de um mês depois substitui o caixa naqueles dias.

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type FonteFaturamento = "planilha" | "sistema";
export type DiaFaturamento = { dia: string; almoco: number; noite: number; total: number; fonte: FonteFaturamento; vendas: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function faturamentoPorDia(db: Db, de: string, ate: string): Promise<DiaFaturamento[]> {
  const [{ data: plan }, { data: sis }] = await Promise.all([
    db.from("faturamento_dias").select("data, almoco, noite").gte("data", de).lte("data", ate),
    db.rpc("faturamento_sistema_dias", { p_de: de, p_ate: ate }),
  ]);
  const dias = new Map<string, DiaFaturamento>();
  for (const s of (sis ?? []) as { dia: string; almoco: number; noite: number; vendas: number }[]) {
    const dia = String(s.dia).slice(0, 10);
    const almoco = r2(Number(s.almoco) || 0), noite = r2(Number(s.noite) || 0);
    dias.set(dia, { dia, almoco, noite, total: r2(almoco + noite), fonte: "sistema", vendas: Number(s.vendas) || 0 });
  }
  for (const p of (plan ?? []) as { data: string; almoco: number | null; noite: number | null }[]) {
    if (p.almoco == null && p.noite == null) continue;
    const dia = String(p.data).slice(0, 10);
    const almoco = r2(Number(p.almoco) || 0), noite = r2(Number(p.noite) || 0);
    dias.set(dia, { dia, almoco, noite, total: r2(almoco + noite), fonte: "planilha", vendas: null });
  }
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

export function somarFaturamento(dias: DiaFaturamento[]) {
  const t = { almoco: 0, noite: 0, total: 0, diasPlanilha: 0, diasSistema: 0 };
  for (const d of dias) {
    t.almoco += d.almoco; t.noite += d.noite; t.total += d.total;
    if (d.fonte === "planilha") t.diasPlanilha++; else t.diasSistema++;
  }
  return { ...t, almoco: r2(t.almoco), noite: r2(t.noite), total: r2(t.total) };
}

export type DiaNotas = { dia: string; notas: number; valor: number; importadas: number; sistema: number };

/** Notas de venda autorizadas por dia: importadas (sistema antigo) + do sistema (Focus). */
export async function notasPorDia(db: Db, de: string, ate: string): Promise<DiaNotas[]> {
  const { data } = await db.rpc("notas_venda_dias", { p_de: de, p_ate: ate });
  const dias = new Map<string, DiaNotas>();
  for (const r of (data ?? []) as { dia: string; fonte: string; notas: number; valor: number }[]) {
    const dia = String(r.dia).slice(0, 10);
    const d = dias.get(dia) ?? { dia, notas: 0, valor: 0, importadas: 0, sistema: 0 };
    d.notas += Number(r.notas) || 0;
    d.valor = r2(d.valor + (Number(r.valor) || 0));
    if (r.fonte === "sistema") d.sistema += Number(r.notas) || 0; else d.importadas += Number(r.notas) || 0;
    dias.set(dia, d);
  }
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
