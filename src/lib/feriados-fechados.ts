import type { SupabaseClient } from "@supabase/supabase-js";

// Dias em que a casa está FECHADA por feriado (tela /feriados, situação "fecha",
// com período quando tem data_fim). Antes, cada parte do sistema tinha a sua
// lista digitada à mão (bloqueios das marmitas, bloqueios das reservas) e o
// feriado marcado em /feriados não fechava nada (auditoria MAR-02, 08/11/2026).
// Quem usa: app das marmitas do convênio, reservas do site e a virada do
// cardápio do dia (TV e app da equipe).

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type FeriadoFechado = { data: string; data_fim: string | null; nome: string };

const iso = (v: string) => String(v).slice(0, 10);
const somaDias = (d: string, n: number) => {
  const [a, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, dd + n)).toISOString().slice(0, 10);
};

/** Abre os períodos dia a dia, só dentro de [de, ate]. Devolve data → nome. */
export function expandirFechados(linhas: FeriadoFechado[], de: string, ate: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) {
    const ini = iso(l.data);
    const fim = l.data_fim ? iso(l.data_fim) : ini;
    if (fim < ini) continue;
    // Um período de feriado não passa de 2 meses: trava contra data digitada errada.
    for (let d = ini < de ? de : ini, n = 0; d <= fim && d <= ate && n < 62; d = somaDias(d, 1), n++) {
      if (!out.has(d)) out.set(d, l.nome);
    }
  }
  return out;
}

/** Dias fechados por feriado entre `de` e `ate` (YYYY-MM-DD). Erro no banco = nenhum (não trava a tela). */
export async function diasFechados(db: Db, empresaId: string | null, de: string, ate: string): Promise<Map<string, string>> {
  let q = db
    .from("feriados")
    .select("data, data_fim, nome")
    .eq("situacao", "fecha")
    .lte("data", ate)
    .or(`data_fim.gte.${de},and(data_fim.is.null,data.gte.${de})`)
    .limit(200);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) return new Map();
  return expandirFechados((data as FeriadoFechado[]) ?? [], de, ate);
}
