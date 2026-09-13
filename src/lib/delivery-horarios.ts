// Horários do delivery e agendamento — regra única, sem dependência de
// servidor (roda no /pedir, no painel e nos testes). Tudo em horário de
// São Paulo (o servidor roda em UTC e o celular do cliente pode estar errado).
//
// Cada TURNO tem: dias da semana, hora em que o AGENDAMENTO abre, e a janela
// de pedidos LIVRES (pra agora). Ex.: almoço seg–sáb — agendamento 08:30,
// livre 11:15–13:20; noite qua–sáb — agendamento 15:00, livre 18:30–22:00.
// Agendar = escolher um horário exato dentro da janela livre, de
// `intervaloMin` em `intervaloMin`, com no máximo `maxPorHorario` pedidos.

export type TurnoDelivery = {
  id: string;
  nome: string;
  dias: number[];        // 0 = domingo … 6 = sábado
  agendaAbre: string;    // "08:30" — a partir daí dá pra agendar pra este turno (no mesmo dia)
  livreAbre: string;     // "11:15" — pedidos pra agora
  livreFecha: string;    // "13:20"
};
export type ConfigHorarios = {
  turnos: TurnoDelivery[];
  intervaloMin: number;   // passo dos horários de agendamento
  maxPorHorario: number;  // quantos pedidos cabem em cada horário (0 = sem limite)
  pedidoMinimo: number;   // R$ (vale pra entrega e retirada)
  antecedenciaMin: number; // só deixa agendar pra daqui a pelo menos isto
};

export const HORARIOS_PADRAO: ConfigHorarios = {
  turnos: [
    { id: "almoco", nome: "Almoço", dias: [1, 2, 3, 4, 5, 6], agendaAbre: "08:30", livreAbre: "11:15", livreFecha: "13:20" },
    { id: "noite", nome: "Noite", dias: [3, 4, 5, 6], agendaAbre: "15:00", livreAbre: "18:30", livreFecha: "22:00" },
  ],
  intervaloMin: 15,
  maxPorHorario: 4,
  pedidoMinimo: 25,
  antecedenciaMin: 30,
};

const DIAS_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const hhmmOk = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Lê o jsonb da config completando com o padrão (config antiga/vazia funciona).
export function lerConfigHorarios(json: unknown): ConfigHorarios {
  const j = (json && typeof json === "object" ? json : {}) as Partial<ConfigHorarios> & { horarios?: Partial<ConfigHorarios> };
  const h = (j.horarios ?? j) as Partial<ConfigHorarios>;
  const turnos = Array.isArray(h.turnos) && h.turnos.length
    ? h.turnos
        .filter((t) => t && typeof t === "object" && hhmmOk(t.agendaAbre) && hhmmOk(t.livreAbre) && hhmmOk(t.livreFecha))
        .map((t, i) => ({
          id: String(t.id || `t${i}`),
          nome: String(t.nome || `Turno ${i + 1}`),
          dias: Array.isArray(t.dias) ? t.dias.map(Number).filter((d) => d >= 0 && d <= 6) : [],
          agendaAbre: t.agendaAbre, livreAbre: t.livreAbre, livreFecha: t.livreFecha,
        }))
    : HORARIOS_PADRAO.turnos;
  const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : padrao);
  return {
    turnos,
    intervaloMin: Math.max(5, num(h.intervaloMin, HORARIOS_PADRAO.intervaloMin)),
    maxPorHorario: num(h.maxPorHorario, HORARIOS_PADRAO.maxPorHorario),
    pedidoMinimo: num(h.pedidoMinimo, HORARIOS_PADRAO.pedidoMinimo),
    antecedenciaMin: num(h.antecedenciaMin, HORARIOS_PADRAO.antecedenciaMin),
  };
}

// Data/hora em São Paulo.
export function partesSP(ms: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, dow: dow < 0 ? 0 : dow, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
// "2026-09-13" + minutos do dia → timestamp (SP = UTC−3, sem horário de verão).
export function msDeSP(iso: string, minutosDia: number): number {
  const h = String(Math.floor(minutosDia / 60)).padStart(2, "0"), m = String(minutosDia % 60).padStart(2, "0");
  return Date.parse(`${iso}T${h}:${m}:00-03:00`);
}
export function addDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const dowDe = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
export const hhmmDe = (ms: number) => {
  const p = partesSP(ms);
  return `${String(Math.floor(p.min / 60)).padStart(2, "0")}:${String(p.min % 60).padStart(2, "0")}`;
};

export type EstadoDelivery = {
  livre: boolean;                       // dá pra pedir "pra agora"
  turnoLivre: TurnoDelivery | null;
  agendamentoAberto: boolean;           // algum turno de hoje já abriu o agendamento
  fechaEm: string | null;               // "13:20" — quando a janela livre atual fecha
  proximaAbertura: { texto: string; ms: number } | null; // "hoje às 18:30" / "quarta às 18:30"
};

// Situação agora: aberto pra pedidos livres? quando abre de novo?
export function estadoDelivery(cfg: ConfigHorarios, agora = Date.now()): EstadoDelivery {
  const p = partesSP(agora);
  let turnoLivre: TurnoDelivery | null = null;
  let agendamentoAberto = false;
  for (const t of cfg.turnos) {
    if (!t.dias.includes(p.dow)) continue;
    if (p.min >= minutos(t.livreAbre) && p.min < minutos(t.livreFecha)) turnoLivre = t;
    if (p.min >= minutos(t.agendaAbre) && p.min < minutos(t.livreFecha)) agendamentoAberto = true;
  }
  // Próxima abertura: hoje (turno que ainda vai abrir) ou nos próximos dias.
  let proxima: { texto: string; ms: number } | null = null;
  for (let d = 0; d < 8 && !proxima; d++) {
    const iso = addDiasIso(p.iso, d), dow = dowDe(iso);
    const cands = cfg.turnos
      .filter((t) => t.dias.includes(dow) && (d > 0 || minutos(t.livreAbre) > p.min))
      .sort((a, b) => minutos(a.livreAbre) - minutos(b.livreAbre));
    if (cands[0]) {
      const t = cands[0];
      const quando = d === 0 ? "hoje" : d === 1 ? "amanhã" : DIAS_NOME[dow];
      proxima = { texto: `${quando} às ${t.livreAbre}`, ms: msDeSP(iso, minutos(t.livreAbre)) };
    }
  }
  return { livre: !!turnoLivre, turnoLivre, agendamentoAberto, fechaEm: turnoLivre?.livreFecha ?? null, proximaAbertura: proxima };
}

export type SlotAgendamento = { iso: string; label: string; turno: string; ms: number };

// Horários exatos que o cliente pode escolher AGORA: só do dia de hoje, dos
// turnos cujo agendamento já abriu, dentro da janela livre, de intervaloMin em
// intervaloMin, e com pelo menos antecedenciaMin de folga.
export function slotsAgendamento(cfg: ConfigHorarios, agora = Date.now()): SlotAgendamento[] {
  const p = partesSP(agora);
  const out: SlotAgendamento[] = [];
  for (const t of cfg.turnos) {
    if (!t.dias.includes(p.dow)) continue;
    if (p.min < minutos(t.agendaAbre)) continue;
    for (let m = minutos(t.livreAbre); m <= minutos(t.livreFecha); m += cfg.intervaloMin) {
      const ms = msDeSP(p.iso, m);
      if (ms < agora + cfg.antecedenciaMin * 60000) continue;
      const label = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      out.push({ iso: new Date(ms).toISOString(), label, turno: t.nome, ms });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// "sáb 12:15" pra rótulos.
export function rotuloAgendado(iso: string): string {
  const ms = Date.parse(iso);
  const p = partesSP(ms);
  const hoje = partesSP(Date.now()).iso;
  const dia = p.iso === hoje ? "hoje" : DIAS_NOME[p.dow].slice(0, 3);
  return `${dia} ${hhmmDe(ms)}`;
}
