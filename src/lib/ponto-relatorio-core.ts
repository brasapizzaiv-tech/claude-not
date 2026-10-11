// Relatórios de ponto (espelho, horas e extras, atrasos e faltas). Sem import:
// o painel e os testes (scripts/ponto-relatorio.test.mjs) usam igual.
//
// Horas de um dia = soma dos pares de batidas (entrada→saída, entrada→saída...).
// Batida depois da meia-noite pertence ao dia anterior (ver ponto-core) e
// conta como 24h + a hora. Número ímpar de batidas = "batida faltando": o par
// incompleto não soma.

/** Uma batida no dia, com os ajustes do espelho (migration 0225). */
export type BatidaDia = { id?: string; min: number; desloc?: number; ignorada?: boolean; origem?: string };

export type SituacaoDia = "ok" | "falta" | "folga" | "atestado" | "abono" | "feriado" | "fora" | "incompleto" | "hoje";
export type LinhaEspelho = {
  dia: string;
  dow: number;
  batidas: number[];      // minutos das batidas que contam, na ordem das colunas
  colunas: (BatidaDia | null)[]; // Ent.1, Saí.1, Ent.2... (null = coluna vazia, após deslocar)
  ignoradas: BatidaDia[]; // desconsideradas (aparecem riscadas)
  previstoMin: number;
  trabalhadoMin: number;
  atrasoMin: number;      // atraso que conta (passou da tolerância)
  extraMin: number;
  faltaMin: number;       // falta e atraso do dia (como o RHiD)
  saldoMin: number;       // extra − falta
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

/**
 * Coloca as batidas nas colunas (Ent.1, Saí.1, Ent.2, Saí.2...): em ordem de
 * hora, cada uma na próxima coluna livre, mais o deslocamento que alguém deu
 * ("deslocar pra direita" = pula uma coluna). Desconsideradas ficam de fora.
 */
export function montarColunas(bs: BatidaDia[]): (BatidaDia | null)[] {
  const validas = bs.filter((b) => !b.ignorada).sort((a, b) => a.min - b.min);
  const cols: (BatidaDia | null)[] = [];
  let ultima = -1;
  for (const b of validas) {
    const alvo = Math.max(ultima + 1, ultima + 1 + (b.desloc ?? 0));
    while (cols.length < alvo) cols.push(null);
    cols[alvo] = b;
    ultima = alvo;
  }
  return cols;
}

/** Horas = soma de cada par Ent→Saí; par com um lado vazio = batida faltando. */
export function horasDoDia(colunas: (number | null)[]): { trabalhado: number; incompleto: boolean } {
  const c = colunas.every((x) => x != null) ? [...(colunas as number[])].sort((x, y) => x - y) : colunas;
  let t = 0, incompleto = false;
  for (let i = 0; i < c.length; i += 2) {
    const e = c[i], s2 = i + 1 < c.length ? c[i + 1] : null;
    if (e != null && s2 != null) t += s2 - e;
    else if (e != null || s2 != null) incompleto = true;
  }
  return { trabalhado: t, incompleto };
}

/**
 * Tolerância como a do RHiD: cada desvio da entrada/saída prevista até
 * `tolerancia` min (5) não conta; passou, conta inteiro; se a soma do dia
 * passar do `limite` (10), conta tudo. Vale separado pra extras (chegar
 * antes, sair depois) e pra faltas (atraso, sair antes, buraco no meio).
 */
function contar(partes: number[], tolerancia: number, limite: number) {
  const soma = partes.reduce((a, b) => a + b, 0);
  if (soma > limite) return soma;
  return partes.filter((x) => x > tolerancia).reduce((a, b) => a + b, 0);
}

export function espelho(p: {
  dias: string[];
  hoje: string;
  escala: number[];
  entradas: Record<string, string>;
  saidas: Record<string, string>;
  batidas: Map<string, (BatidaDia | number)[]>;
  folgas: Set<string>;
  atestados: Set<string>;
  abonos?: Set<string>;
  fechados: Set<string>;
  tolerancia?: number; // por batida (RHiD: 5)
  limite?: number;     // por dia (RHiD: 10)
}): { linhas: LinhaEspelho[]; totais: TotaisEspelho } {
  const tol = p.tolerancia ?? 0, lim = p.limite ?? 0;
  const linhas: LinhaEspelho[] = [];
  const t: TotaisEspelho = { previsto: 0, trabalhado: 0, extra: 0, faltante: 0, atraso: 0, faltas: 0, diasTrabalhados: 0, incompletos: 0 };
  for (const dia of p.dias) {
    const dow = dowDe(dia);
    const todas = (p.batidas.get(dia) ?? []).map((b) => (typeof b === "number" ? { min: b } : b));
    const colunas = montarColunas(todas);
    const ignoradas = todas.filter((b) => b.ignorada);
    const bs = colunas.filter((b): b is BatidaDia => b != null).map((b) => b.min);
    const ent = p.entradas[String(dow)], sai = p.saidas[String(dow)];
    const naEscala = !!ent && p.escala.includes(dow) && !p.fechados.has(dia);
    const ausenciaJustificada = p.atestados.has(dia) || p.folgas.has(dia) || !!p.abonos?.has(dia);
    const previsto = naEscala && !ausenciaJustificada && sai ? Math.max(0, min(sai) - min(ent)) : 0;
    const { trabalhado, incompleto } = horasDoDia(colunas.map((b) => (b ? b.min : null)));
    let situacao: SituacaoDia;
    if (p.atestados.has(dia)) situacao = "atestado";
    else if (p.abonos?.has(dia) && !bs.length) situacao = "abono";
    else if (p.folgas.has(dia)) situacao = "folga";
    else if (bs.length) situacao = incompleto ? "incompleto" : "ok";
    else if (p.fechados.has(dia) && ent && p.escala.includes(dow)) situacao = "feriado";
    else if (!naEscala) situacao = "fora";
    else situacao = dia < p.hoje ? "falta" : "hoje";

    let extra = 0, falta = 0, atraso = 0;
    const atrasoBruto = naEscala && bs.length ? Math.max(0, bs[0] - min(ent)) : 0;
    if (situacao === "hoje") {
      // dia aberto: nada conta ainda
    } else if (previsto > 0 && bs.length >= 2 && !incompleto) {
      const e1 = bs[0], sl = bs[bs.length - 1], E = min(ent), S = min(sai);
      const buracos = (sl - e1) - trabalhado;
      extra = contar([Math.max(0, E - e1), Math.max(0, sl - S)], tol, lim);
      const partesFalta = [atrasoBruto, Math.max(0, S - sl), buracos];
      falta = contar(partesFalta, tol, lim);
      atraso = partesFalta.reduce((a, b) => a + b, 0) > lim || atrasoBruto > tol ? atrasoBruto : 0;
    } else if (previsto > 0) {
      falta = Math.max(0, previsto - trabalhado);
      extra = Math.max(0, trabalhado - previsto);
      atraso = atrasoBruto > tol ? atrasoBruto : 0;
    } else {
      extra = trabalhado; // fora da escala (ou dia justificado em que trabalhou): tudo é extra
    }
    const contaPrevisto = situacao === "hoje" ? 0 : previsto;
    linhas.push({ dia, dow, batidas: bs, colunas, ignoradas, previstoMin: contaPrevisto, trabalhadoMin: trabalhado, atrasoMin: atraso, extraMin: extra, faltaMin: falta, saldoMin: extra - falta, situacao });
    t.previsto += contaPrevisto;
    t.trabalhado += trabalhado;
    t.extra += extra;
    t.faltante += falta;
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
    s.extra += l.extraMin; s.faltante += l.faltaMin;
    m.set(k, s);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([segunda, s]) => ({ segunda, ...s }));
}
