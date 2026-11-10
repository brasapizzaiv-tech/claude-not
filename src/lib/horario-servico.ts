// Horário de serviço do restaurante (sem dependências, testado em
// scripts/saude.test.mjs): almoço 11:30–14:00 de segunda a sábado; noite
// 18:30–22:00 só sexta e sábado. Com folga de meia hora antes e depois, porque
// o PC da balança e os pinpads ligam antes e desligam depois.
export function emServico(d = new Date()): boolean {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const dia = p.find((x) => x.type === "weekday")?.value ?? "";
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  const min = h * 60 + m;
  if (dia === "Sun") return false;
  if (min >= 11 * 60 && min <= 14 * 60 + 30) return true;
  if ((dia === "Fri" || dia === "Sat") && min >= 18 * 60 && min <= 22 * 60 + 30) return true;
  return false;
}
