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
