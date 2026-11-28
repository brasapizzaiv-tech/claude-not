// "Só retirada" (pedido do Rafael, 28/11/2026: ficou sem motoboy no almoço).
// Botão no topo do Delivery: o app para de oferecer ENTREGA (só retirada no
// balcão) até o fim do turno — almoço até 16:00, noite até 06:00 —, e volta
// sozinho. Mora em delivery_config.config.soRetiradaAte (ISO).

const SP_MS = 3 * 3600 * 1000; // America/Sao_Paulo, sem horário de verão
const DIVISA_HORA = 16;        // antes das 16h é almoço (a mesma dos turnos)

/** Até quando vale (ISO) — null se não está valendo agora. */
export function soRetiradaAte(config: unknown, agora = Date.now()): string | null {
  const v = (config && typeof config === "object" ? (config as { soRetiradaAte?: unknown }).soRetiradaAte : null);
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > agora ? v : null;
}

/** Fim do turno de agora: almoço → 16:00 de hoje; noite → 06:00 de amanhã. */
export function fimDoTurno(agora = Date.now()): string {
  const local = new Date(agora - SP_MS);
  const dia = local.toISOString().slice(0, 10);
  if (local.getUTCHours() < DIVISA_HORA && local.getUTCHours() >= 6) return new Date(`${dia}T16:00:00-03:00`).toISOString();
  const amanha = local.getUTCHours() < 6 ? dia : new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return new Date(`${amanha}T06:00:00-03:00`).toISOString();
}

/** Entrega bloqueada pra este pedido? Agendado pra depois do fim vale. */
export function entregaBloqueada(config: unknown, agendadoPara: string | null, agora = Date.now()): boolean {
  const ate = soRetiradaAte(config, agora);
  if (!ate) return false;
  return !agendadoPara || Date.parse(agendadoPara) < Date.parse(ate);
}

export const hhmmSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
