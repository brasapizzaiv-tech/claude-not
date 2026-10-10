// Relatórios de ponto (espelho, horas e extras, atrasos e faltas). Sem import:
// o painel e os testes (scripts/ponto-relatorio.test.mjs) usam igual.
//
// Horas de um dia = soma dos pares de batidas (entrada→saída, entrada→saída...).
// Batida depois da meia-noite pertence ao dia anterior (ver ponto-core) e
// conta como 24h + a hora. Número ímpar de batidas = "batida faltando": o par
// incompleto não soma.

export type SituacaoDia = "ok" | "falta" | "folga" | "atestado" | "abono" | "feriado" | "fora" | "incompleto" | "hoje";
export type LinhaEspelho = {
  dia: string;
  dow: number;
  batidas: number[];      // minutos desde 00:00 do dia (pode passar de 1440)
  previstoMin: number;
  trabalhadoMin: number;
  atrasoMin: number;
  saldoMin: number;       // trabalhado − previsto (positivo = extra)
  situacao: SituacaoDia;
};
export type TotaisEspelho = { previsto: number; trabalhado: number; extra: number; faltante: number; atraso: number; faltas: number; diasTrabalhados: number; incompletos: number };

const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const hhmm = (minutos: number) => {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** 135 → "2h15"; -20 → "-0h20". */
export const duracao = (minutos: number) => {
  const s = minutos < 0 ? "-" : "";
  const a = Math.abs(Math.round(minutos));
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};

function dowDe(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function horasDoDia(batidas: number[]): { trabalhado: number; incompleto: boolean } {
  const b = [...batidas].sort((x, y) => x - y);
  let t = 0;
  for (let i = 0; i + 1 < b.length; i += 2) t += b[i + 1] - b[i];
  return { trabalhado: t, incompleto: b.length % 2 === 1 };
}

export function espelho(p: {
  dias: string[];
  hoje: string;
  escala: number[];
  entradas: Record<string, string>;
  saidas: Record<string, string>;
  batidas: Map<string, number[]>;
  folgas: Set<string>;
  atestados: Set<string>;
  abonos?: Set<string>;
  fechados: Set<string>;
}): { linhas: LinhaEspelho[]; totais: TotaisEspelho } {
  const linhas: LinhaEspelho[] = [];
  const t: TotaisEspelho = { previsto: 0, trabalhado: 0, extra: 0, faltante: 0, atraso: 0, faltas: 0, diasTrabalhados: 0, incompletos: 0 };
  for (const dia of p.dias) {
    const dow = dowDe(dia);
    const bs = [...(p.batidas.get(dia) ?? [])].sort((a, b) => a - b);
    const ent = p.entradas[String(dow)], sai = p.saidas[String(dow)];
    const naEscala = !!ent && p.escala.includes(dow) && !p.fechados.has(dia);
    const ausenciaJustificada = p.atestados.has(dia) || p.folgas.has(dia) || !!p.abonos?.has(dia);
    const previsto = naEscala && !ausenciaJustificada && sai ? Math.max(0, min(sai) - min(ent)) : 0;
    const { trabalhado, incompleto } = horasDoDia(bs);
    const atraso = naEscala && bs.length ? Math.max(0, bs[0] - min(ent)) : 0;
    let situacao: SituacaoDia;
    if (p.atestados.has(dia)) situacao = "atestado";
    else if (p.abonos?.has(dia) && !bs.length) situacao = "abono";
    else if (p.folgas.has(dia)) situacao = "folga";
    else if (bs.length) situacao = incompleto ? "incompleto" : "ok";
    else if (p.fechados.has(dia) && ent && p.escala.includes(dow)) situacao = "feriado";
    else if (!naEscala) situacao = "fora";
    else situacao = dia < p.hoje ? "falta" : "hoje";
    // Dia de hoje ainda aberto: não conta previsto nem saldo.
    const contaPrevisto = situacao === "hoje" ? 0 : previsto;
    const saldo = situacao === "hoje" ? 0 : trabalhado - contaPrevisto;
    linhas.push({ dia, dow, batidas: bs, previstoMin: contaPrevisto, trabalhadoMin: trabalhado, atrasoMin: atraso, saldoMin: saldo, situacao });
    t.previsto += contaPrevisto;
    t.trabalhado += trabalhado;
    if (saldo > 0) t.extra += saldo; else t.faltante += -saldo;
    t.atraso += atraso;
    if (situacao === "falta") t.faltas++;
    if (bs.length) t.diasTrabalhados++;
    if (incompleto) t.incompletos++;
  }
  return { linhas, totais: t };
}

/** Segunda-feira (ISO) da semana de um dia. */
export function segundaDaSemana(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

/** Totais por semana (segunda a domingo) a partir das linhas do espelho. */
export function porSemana(linhas: LinhaEspelho[]) {
  const m = new Map<string, { previsto: number; trabalhado: number; extra: number; faltante: number }>();
  for (const l of linhas) {
    const k = segundaDaSemana(l.dia);
    const s = m.get(k) ?? { previsto: 0, trabalhado: 0, extra: 0, faltante: 0 };
    s.previsto += l.previstoMin; s.trabalhado += l.trabalhadoMin;
    if (l.saldoMin > 0) s.extra += l.saldoMin; else s.faltante += -l.saldoMin;
    m.set(k, s);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([segunda, s]) => ({ segunda, ...s }));
}
