// Formata uma data "AAAA-MM-DD" (ou ISO com hora) como "DD/MM/AAAA".
// Evita o bug de fuso horário do new Date("AAAA-MM-DD"), que em UTC-3
// mostrava um dia a menos.
export function dataBR(s: string | null | undefined): string {
  if (!s) return "";
  const [a, m, d] = s.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : s;
}

// Formata um número como moeda brasileira: 1234.5 -> "R$ 1.234,50".
export function moedaBR(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Número digitado em português ("1.234,56", "223,11", "223.11") → 1234.56.
// Cuidado histórico: `replace(/./g, "")` apaga TODOS os caracteres (o ponto é
// curinga na expressão) — era esse o bug que zerava o valor do boleto e o
// limite de crédito sempre que alguém digitava com vírgula.
export function numeroBR(entrada: string | number | null | undefined): number {
  if (typeof entrada === "number") return Number.isFinite(entrada) ? entrada : 0;
  const t = String(entrada ?? "").trim();
  if (!t) return 0;
  // Com vírgula: o ponto é separador de milhar e a vírgula é decimal.
  const limpo = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t;
  const n = Number(limpo.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
