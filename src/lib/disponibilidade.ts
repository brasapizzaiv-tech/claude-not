// Disponibilidade por dias/horários (cardápio do app do cliente).
// null = sempre disponível. {"dias":[5],"turnos":[{"ini":"00:00","fim":"15:00"}]}
// dias: 0=domingo … 6=sábado. Turno com fim < ini vira madrugada (cruza meia-noite).

export type Horarios = {
  dias?: number[];
  turnos?: { ini: string; fim: string }[];
} | null;

// Dia da semana e hh:mm no horário de São Paulo (mesma convenção do servicoAgora).
export function agoraSaoPaulo(nowMs: number) {
  const brt = new Date(nowMs - 3 * 3600 * 1000);
  const dia = brt.getUTCDay();
  const hhmm = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
  return { dia, hhmm };
}

export function disponivelAgora(h: Horarios, nowMs: number): boolean {
  if (!h || typeof h !== "object") return true;
  const dias = Array.isArray(h.dias) ? h.dias : [];
  const turnos = Array.isArray(h.turnos) ? h.turnos.filter((t) => t?.ini && t?.fim) : [];
  if (dias.length === 0 && turnos.length === 0) return true;

  const { dia, hhmm } = agoraSaoPaulo(nowMs);
  if (dias.length > 0 && !dias.includes(dia)) return false;
  if (turnos.length === 0) return true;
  return turnos.some((t) => (t.fim >= t.ini ? hhmm >= t.ini && hhmm <= t.fim : hhmm >= t.ini || hhmm <= t.fim));
}

// Resume os horários pra mostrar na tela ("Sex · 00:00–15:00").
const DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function resumoHorarios(h: Horarios): string | null {
  if (!h || typeof h !== "object") return null;
  const dias = Array.isArray(h.dias) ? h.dias : [];
  const turnos = Array.isArray(h.turnos) ? h.turnos.filter((t) => t?.ini && t?.fim) : [];
  if (dias.length === 0 && turnos.length === 0) return null;
  const d = dias.length ? dias.map((x) => DIAS_ABREV[x] ?? "?").join(", ") : "Todos os dias";
  const t = turnos.length ? turnos.map((x) => `${x.ini}–${x.fim}`).join(" e ") : "o dia todo";
  return `${d} · ${t}`;
}
