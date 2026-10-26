// Relatórios de ponto (espelho, horas e extras, atrasos e faltas). Sem import:
// o painel e os testes (scripts/ponto-relatorio.test.mjs) usam igual.
//
// Horas de um dia = soma dos pares de batidas (entrada→saída, entrada→saída...).
// Batida depois da meia-noite pertence ao dia anterior (ver ponto-core) e
// conta como 24h + a hora. Número ímpar de batidas = "batida faltando": o par
// incompleto não soma.

/** Uma batida no dia, com os ajustes do espelho (migration 0225). */
export type BatidaDia = { id?: string; min: number; desloc?: number; ignorada?: boolean; origem?: string };

export type SituacaoDia = "ok" | "falta" | "folga" | "atestado" | "abono" | "feriado" | "fora" | "incompleto" | "hoje" | "compensado" | "neutro";

/**
 * O horário de um dia (migration 0255, "Config. de Horário" do RHiD): os
 * períodos em minutos (saída menor que a entrada passa da meia-noite), almoço
 * livre (vale a duração do intervalo, não a hora), compensado (não trabalha,
 * quem vem faz extra), neutro (nada conta) e as tolerâncias do horário.
 */
export type DiaHorario = {
  periodos: [number, number][];
  almocoLivre?: boolean;
  compensado?: boolean;
  neutro?: boolean;
  tolExtra?: number;
  tolFalta?: number;
  limExtra?: number;
  limFalta?: number;
  /** Horário noturno em minutos do dia (padrão 22:00 a 05:00). */
  noturno?: [number, number];
};
/** Tipo do dia pras faixas de hora extra do RHiD. */
export type TipoDia = "normal" | "sabado" | "domingo" | "feriado";
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
  /** Minutos trabalhados no horário noturno (relógio, sem o fator 52:30). */
  noturnoMin: number;
  tipo: TipoDia;
  /** "08:00–14:00" ou "14:00–17:00 18:00–23:00" (vazio = sem horário no dia). */
  horario: string;
};
export type TotaisEspelho = {
  previsto: number; trabalhado: number; extra: number; faltante: number; atraso: number; faltas: number; diasTrabalhados: number; incompletos: number;
  noturno: number;
  /** Extras por tipo de dia (faixas do RHiD: feriado, domingo, sábado, dia normal). */
  extraPor: Record<TipoDia, number>;
};

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

/** Minutos em comum entre [a, b] e o horário noturno (22:00 → 05:00 do dia seguinte, e a madrugada do próprio dia). */
export function minutosNoturnos(a: number, b: number, noturno: [number, number] = [1320, 300]) {
  const [ini, fim] = noturno;
  const janelas: [number, number][] = ini > fim ? [[ini, 1440 + fim], [ini - 1440, fim]] : [[ini, fim]];
  return janelas.reduce((t, [x, y]) => t + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
}

/** "14:00–17:00 18:00–23:00". */
export function rotuloHorario(h: DiaHorario | null | undefined) {
  return h?.periodos.length ? h.periodos.map(([e, s]) => `${hhmm(e)}–${hhmm(s)}`).join(" ") : "";
}

/** O dia no jeito antigo (antes dos horários): escala da pessoa + entrada/saída por dia da semana. */
export function horarioAntigo(escala: number[], entradas: Record<string, string>, saidas: Record<string, string>, tol = 0, lim = 0) {
  return (_dia: string, dow: number): DiaHorario | null => {
    const e = entradas[String(dow)], s2 = saidas[String(dow)];
    if (!e || !escala.includes(dow)) return null;
    return { periodos: [[min(e), s2 ? min(s2) : min(e)]], tolExtra: tol, tolFalta: tol, limExtra: lim, limFalta: lim };
  };
}

export function espelho(p: {
  dias: string[];
  hoje: string;
  /** Horário de cada dia (migration 0255). Sem ele, vale escala + entradas/saídas. */
  horarioDoDia?: (dia: string, dow: number) => DiaHorario | null;
  escala?: number[];
  entradas?: Record<string, string>;
  saidas?: Record<string, string>;
  batidas: Map<string, (BatidaDia | number)[]>;
  folgas: Set<string>;
  atestados: Set<string>;
  abonos?: Set<string>;
  /** Feriados (o dia não é de trabalho; quem trabalha faz extra). */
  fechados: Set<string>;
  tolerancia?: number; // por batida (RHiD: 5) — só no jeito antigo
  limite?: number;     // por dia (RHiD: 10) — só no jeito antigo
  /** Antes da admissão o dia é "fora da escala" (não é falta). */
  admissao?: string | null;
  /** Depois do desligamento (último dia) o dia também é "fora da escala". */
  desligamento?: string | null;
}): { linhas: LinhaEspelho[]; totais: TotaisEspelho } {
  const horarioDoDia = p.horarioDoDia ?? horarioAntigo(p.escala ?? [], p.entradas ?? {}, p.saidas ?? {}, p.tolerancia ?? 0, p.limite ?? 0);
  const linhas: LinhaEspelho[] = [];
  const t: TotaisEspelho = { previsto: 0, trabalhado: 0, extra: 0, faltante: 0, atraso: 0, faltas: 0, diasTrabalhados: 0, incompletos: 0, noturno: 0, extraPor: { normal: 0, sabado: 0, domingo: 0, feriado: 0 } };
  for (const dia of p.dias) {
    const dow = dowDe(dia);
    const todas = (p.batidas.get(dia) ?? []).map((b) => (typeof b === "number" ? { min: b } : b));
    const colunas = montarColunas(todas);
    const ignoradas = todas.filter((b) => b.ignorada);
    const bs = colunas.filter((b): b is BatidaDia => b != null).map((b) => b.min);
    // Períodos do dia, com a saída que passa da meia-noite somada de 24h.
    const h = horarioDoDia(dia, dow);
    const periodos = (h?.periodos ?? []).map(([e, s2]) => [e, s2 < e ? s2 + 1440 : s2] as [number, number]);
    const tolX = h?.tolExtra ?? 0, tolF = h?.tolFalta ?? 0, limX = h?.limExtra ?? 0, limF = h?.limFalta ?? 0;
    const feriado = p.fechados.has(dia);
    const tipo: TipoDia = feriado ? "feriado" : dow === 0 ? "domingo" : dow === 6 ? "sabado" : "normal";
    const temHorario = periodos.length > 0;
    const naContratacao = (!p.admissao || dia >= p.admissao) && (!p.desligamento || dia <= p.desligamento);
    const naEscala = temHorario && !h?.compensado && !h?.neutro && !feriado && naContratacao;
    const ausenciaJustificada = p.atestados.has(dia) || p.folgas.has(dia) || !!p.abonos?.has(dia);
    const previsto = naEscala && !ausenciaJustificada ? periodos.reduce((a, [e, s2]) => a + (s2 - e), 0) : 0;
    const { trabalhado, incompleto } = horasDoDia(colunas.map((b) => (b ? b.min : null)));
    let noturno = 0;
    for (let i = 0; i + 1 < colunas.length; i += 2) {
      const e = colunas[i], s2 = colunas[i + 1];
      if (e && s2) noturno += minutosNoturnos(e.min, s2.min, h?.noturno);
    }
    let situacao: SituacaoDia;
    if (p.atestados.has(dia)) situacao = "atestado";
    else if (p.abonos?.has(dia) && !bs.length) situacao = "abono";
    else if (p.folgas.has(dia)) situacao = "folga";
    else if (h?.neutro && temHorario && naContratacao) situacao = "neutro";
    else if (bs.length) situacao = incompleto ? "incompleto" : "ok";
    else if (feriado && temHorario && naContratacao) situacao = "feriado";
    else if (h?.compensado && temHorario && naContratacao) situacao = "compensado";
    else if (!naEscala) situacao = "fora";
    else situacao = dia < p.hoje ? "falta" : "hoje";

    let extra = 0, falta = 0, atraso = 0;
    const E = naEscala ? periodos[0][0] : 0;
    const atrasoBruto = naEscala && bs.length ? Math.max(0, bs[0] - E) : 0;
    if (situacao === "hoje" || situacao === "neutro") {
      // dia aberto ou neutro: nada conta
    } else if (previsto > 0 && bs.length >= 2 && !incompleto) {
      const e1 = bs[0], sl = bs[bs.length - 1], S = periodos[periodos.length - 1][1];
      // Intervalo previsto = buracos entre os períodos (17:00→18:00 = 60). Parou
      // mais que isso = falta; parou menos (ou pulou o almoço) = extra.
      const intervaloPrevisto = periodos.slice(1).reduce((a, [e], i) => a + (e - periodos[i][1]), 0);
      const buracos = (sl - e1) - trabalhado;
      const dif = buracos - intervaloPrevisto;
      extra = contar([Math.max(0, E - e1), Math.max(0, sl - S), Math.max(0, -dif)], tolX, limX);
      const partesFalta = [atrasoBruto, Math.max(0, S - sl), Math.max(0, dif)];
      falta = contar(partesFalta, tolF, limF);
      atraso = partesFalta.reduce((a, b) => a + b, 0) > limF || atrasoBruto > tolF ? atrasoBruto : 0;
    } else if (previsto > 0) {
      falta = Math.max(0, previsto - trabalhado);
      extra = Math.max(0, trabalhado - previsto);
      atraso = atrasoBruto > tolF ? atrasoBruto : 0;
    } else {
      extra = trabalhado; // fora da escala, feriado, compensado ou dia justificado em que trabalhou: tudo é extra
    }
    const contaPrevisto = situacao === "hoje" ? 0 : previsto;
    linhas.push({
      dia, dow, batidas: bs, colunas, ignoradas, previstoMin: contaPrevisto, trabalhadoMin: trabalhado, atrasoMin: atraso,
      extraMin: extra, faltaMin: falta, saldoMin: extra - falta, situacao, noturnoMin: noturno, tipo, horario: naContratacao ? rotuloHorario(h) : "",
    });
    t.previsto += contaPrevisto;
    t.trabalhado += trabalhado;
    t.extra += extra;
    t.extraPor[tipo] += extra;
    t.faltante += falta;
    t.atraso += atraso;
    t.noturno += noturno;
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
