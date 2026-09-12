// Qual dia de cardápio vale AGORA — regra única pra TV da cozinha (e pra quem
// mais quiser seguir a mesma virada).
//
// O restaurante abre de segunda a sábado. O cardápio de um dia começa a
// aparecer às 13:30 do dia anterior e fica até as 13:29 do próprio dia:
//   segunda 13:30 → cardápio de terça · terça 13:29 → ainda terça
//   sábado 13:30 → segunda (domingo não abre, pula) · domingo o dia todo → segunda
// Tudo no fuso de São Paulo, nunca no do navegador. Sem dependência de servidor.

// ---- constantes (mude aqui) ----
export const VIRADA_HORA = 13;      // hora da virada pro cardápio do dia seguinte
export const VIRADA_MINUTO = 30;
export const TV_ROTACAO_SEG = 20;   // cada página do cardápio fica este tempo na TV
export const TV_SEM_PEDIDO_MIN = 3; // sem pedido aberto por este tempo → TV volta ao cardápio
export const TV_PAGINAS = ["buffet", "saladas", "kern", "relogio"] as const;
export type TvPagina = (typeof TV_PAGINAS)[number];

const DIAS_CURTO = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
const DIAS_LONGO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// Data e hora em São Paulo (o servidor roda em UTC; a TV pode estar com fuso errado).
function partesSP(ms: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, hora: Number(g("hour")) % 24, minuto: Number(g("minute")) };
}

export function addDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
export function diaSemanaIso(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
}

// Data (YYYY-MM-DD) do cardápio que deve estar na tela neste instante.
export function diaDoCardapio(agora: number | Date = Date.now()): string {
  const ms = typeof agora === "number" ? agora : agora.getTime();
  const p = partesSP(ms);
  let iso = p.iso;
  const depoisDaVirada = p.hora > VIRADA_HORA || (p.hora === VIRADA_HORA && p.minuto >= VIRADA_MINUTO);
  if (depoisDaVirada) iso = addDiasIso(iso, 1);
  while (diaSemanaIso(iso) === 0) iso = addDiasIso(iso, 1); // domingo não abre
  return iso;
}

// "TERÇA, 15/09" (cabeçalho da TV) e "terça-feira, 15/09" (frases).
export function rotuloDia(iso: string): string {
  return `${DIAS_CURTO[diaSemanaIso(iso)]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
export function rotuloDiaLongo(iso: string): string {
  return `${DIAS_LONGO[diaSemanaIso(iso)]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// Índice da página da rotação da TV neste instante (deriva do relógio: as
// telas em modo simples e normal mostram a mesma página sem timer extra).
export function paginaDaRotacao(agora: number, total = TV_PAGINAS.length): number {
  return Math.floor(agora / (TV_ROTACAO_SEG * 1000)) % total;
}
