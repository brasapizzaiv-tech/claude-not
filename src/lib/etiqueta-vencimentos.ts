// Faixas do painel de vencimentos das etiquetas (hoje / amanhã / 7 dias / 30 dias).
export type Faixa = "hoje" | "amanha" | "sete" | "mes";

export const FAIXAS: { key: Faixa; titulo: string; cor: string }[] = [
  { key: "hoje", titulo: "Hoje", cor: "bg-red-500" },
  { key: "amanha", titulo: "Amanhã", cor: "bg-amber-500" },
  { key: "sete", titulo: "Em 7 dias", cor: "bg-emerald-500" },
  { key: "mes", titulo: "Até 30 dias", cor: "bg-sky-500" },
];

export type Contagem = Record<Faixa, number> & { vencidas: number };

export function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// "hoje" inclui o que já venceu.
export function faixaDe(validade: string | null, hoje: string): Faixa | null {
  if (!validade) return null;
  if (validade <= hoje) return "hoje";
  if (validade <= somarDias(hoje, 1)) return "amanha";
  if (validade <= somarDias(hoje, 7)) return "sete";
  if (validade <= somarDias(hoje, 30)) return "mes";
  return null;
}

export function contarFaixas(rows: { validade: string | null }[], hoje: string): Contagem {
  const c: Contagem = { hoje: 0, amanha: 0, sete: 0, mes: 0, vencidas: 0 };
  for (const r of rows) {
    const f = faixaDe(r.validade, hoje);
    if (f) c[f]++;
    if (r.validade && r.validade < hoje) c.vencidas++;
  }
  return c;
}

export function faixaValida(v: string | undefined | null): Faixa | null {
  return v === "hoje" || v === "amanha" || v === "sete" || v === "mes" ? v : null;
}

// Faixa dia a dia (Ontem · Hoje · Amanhã · próximos 5 dias) pro painel.
export type DiaFaixa = { data: string; rotulo: string; sub: string; cor: string };
const DIAS_SEM = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
export function faixaDias(hoje: string): DiaFaixa[] {
  return Array.from({ length: 8 }, (_, i) => {
    const off = i - 1;
    const data = somarDias(hoje, off);
    const [y, m, d] = data.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const rotulo = off === -1 ? "Ontem" : off === 0 ? "Hoje" : off === 1 ? "Amanhã" : DIAS_SEM[dow];
    const cor =
      off < 0 ? "bg-red-900 text-white"
      : off === 0 ? "bg-red-100 text-red-800 ring-2 ring-red-400 dark:bg-red-950/40 dark:text-red-200"
      : off === 1 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
    return { data, rotulo, sub: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`, cor };
  });
}

export function ehData(v: string | undefined | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
