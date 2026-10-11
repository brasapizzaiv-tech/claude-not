// Prêmio assiduidade (migration 0222). Sem import nenhum: o painel e os testes
// (scripts/assiduidade.test.mjs) usam igual.
//
// Por mês, pra cada dia da ESCALA da pessoa (dias de trabalho de dia no
// cadastro, com entrada definida, fora feriado fechado):
//   atestado nesse dia → atestado; folga aprovada → folga; bateu → atraso
//   (primeira batida do turno do dia menos a entrada); não bateu → falta.
// Folga ou atestado em QUALQUER dia do mês também contam.
// Ganha o mês: sem falta, sem folga, sem atestado e atraso somado ≤ tolerância.

export type DiaAtraso = { dia: string; entrada: string; chegou: string; min: number };
export type ResultadoMes = {
  esperados: number;
  atrasoTotal: number;
  atrasos: DiaAtraso[];
  faltas: string[];
  folgas: string[];
  atestados: string[];
  ganhou: boolean | null; // null = sem dia pra apurar (antes do início, por exemplo)
  motivos: string[];
};

export function diaDaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

const minutos = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

export function apurarMes(p: {
  dias: string[];                       // dias do período já cortados (início, hoje)
  hoje: string;                         // dia de hoje: falta só conta em dia que já passou
  escala: number[];                     // dias da semana em que trabalha de dia (0=dom)
  entradas: Record<string, string>;     // "1" → "08:00"
  primeiraBatida: Map<string, string>;  // dia → "HH:MM" (primeira batida do turno do dia)
  folgas: Set<string>;
  atestados: Set<string>;
  abonos?: Set<string>;                 // ausência abonada pela casa: nem falta, nem perde
  fechados: Set<string>;                // feriados em que a casa fecha
  tolerancia: number;
  /** Atraso de até isso no dia não conta; passou, conta inteiro (Rafael, 10/10/2026: 5). */
  toleranciaBatida?: number;
}): ResultadoMes {
  const r: ResultadoMes = { esperados: 0, atrasoTotal: 0, atrasos: [], faltas: [], folgas: [], atestados: [], ganhou: null, motivos: [] };
  for (const dia of p.dias) {
    if (p.abonos?.has(dia)) continue;
    if (p.atestados.has(dia)) { r.atestados.push(dia); continue; }
    if (p.folgas.has(dia)) { r.folgas.push(dia); continue; }
    const dow = diaDaSemana(dia);
    const entrada = p.entradas[String(dow)];
    if (!entrada || !p.escala.includes(dow) || p.fechados.has(dia)) continue;
    r.esperados++;
    const chegou = p.primeiraBatida.get(dia);
    if (chegou) {
      const atraso = Math.max(0, minutos(chegou) - minutos(entrada));
      if (atraso > (p.toleranciaBatida ?? 0)) { r.atrasos.push({ dia, entrada, chegou, min: atraso }); r.atrasoTotal += atraso; }
    } else if (dia < p.hoje) {
      r.faltas.push(dia);
    }
  }
  if (r.esperados === 0 && r.folgas.length === 0 && r.atestados.length === 0) return r;
  if (r.faltas.length) r.motivos.push(`${r.faltas.length} falta${r.faltas.length > 1 ? "s" : ""}`);
  if (r.folgas.length) r.motivos.push(`${r.folgas.length} folga${r.folgas.length > 1 ? "s" : ""}`);
  if (r.atestados.length) r.motivos.push(`${r.atestados.length} dia${r.atestados.length > 1 ? "s" : ""} de atestado`);
  if (r.atrasoTotal > p.tolerancia) r.motivos.push(`${r.atrasoTotal} min de atraso (tolerância ${p.tolerancia})`);
  r.ganhou = r.motivos.length === 0;
  return r;
}

/** Período de um mês ("2026-10"). Início no dia 1 = o mês do calendário;
 *  início no dia 21 = de 21 do mês anterior a 20 deste (como o RHiD fecha). */
export function periodoMes(mes: string, diaInicio = 1): { de: string; ate: string } {
  const [a, m] = mes.split("-").map(Number);
  const iso = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
  if (diaInicio <= 1) return { de: iso(a, m, 1), ate: iso(a, m + 1, 0) };
  return { de: iso(a, m - 1, diaInicio), ate: iso(a, m, diaInicio - 1) };
}

export function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const [a, m, d] = de.split("-").map(Number);
  for (let i = 0; ; i++) {
    const dia = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
    if (dia > ate) break;
    out.push(dia);
  }
  return out;
}

/** "2026-10" → "2026-T4"; trimestres do calendário. */
export function trimestreDe(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${a}-T${Math.floor((m - 1) / 3) + 1}`;
}

export function mesesDoTrimestre(t: string): string[] {
  const [a, q] = t.split("-T").map(Number);
  return [1, 2, 3].map((i) => `${a}-${String((q - 1) * 3 + i).padStart(2, "0")}`);
}

export const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (mes: string) => `${NOME_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
