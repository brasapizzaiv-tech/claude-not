// Formata uma data "AAAA-MM-DD" (ou ISO com hora) como "DD/MM/AAAA".
// Evita o bug de fuso horário do new Date("AAAA-MM-DD"), que em UTC-3
// mostrava um dia a menos.
export function dataBR(s: string | null | undefined): string {
  if (!s) return "";
  const [a, m, d] = s.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : s;
}
