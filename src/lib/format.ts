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
