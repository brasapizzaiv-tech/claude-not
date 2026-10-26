// Horários de trabalho (migration 0255), no jeito do "Config. de Horário" do
// RHiD. Só importa tipo: o servidor, as telas e os testes usam igual.
import type { DiaHorario } from "./ponto-relatorio-core";

export type DiaHorarioSalvo = { p?: [string, string][]; almoco_livre?: boolean; compensado?: boolean; neutro?: boolean };
export type HorarioPonto = {
  id: string;
  nome: string;
  ativo: boolean;
  dias: Record<string, DiaHorarioSalvo>;
  tolerancia_extra: number;
  tolerancia_falta: number;
  limite_extra: number;
  limite_falta: number;
  noturno_inicio: string;
  noturno_fim: string;
};
/** Em qual horário a pessoa está, de quando até quando (ate null = sem fim). */
export type VinculoHorario = { horario_id: string; de: string; ate: string | null };

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Ordem da tela (como no RHiD do restaurante: segunda primeiro). */
export const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const min = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };

/** Períodos válidos do dia (entrada e saída preenchidas). */
export function periodosDoDia(d: DiaHorarioSalvo | undefined): [string, string][] {
  return (d?.p ?? []).filter(([e, s]) => HORA.test(e) && HORA.test(s));
}

/** O dia do horário no formato do cálculo do espelho. Sem período = folga (null). */
export function diaDoHorario(h: HorarioPonto, dow: number): DiaHorario | null {
  const d = h.dias[String(dow)];
  const p = periodosDoDia(d);
  if (!p.length) return null;
  return {
    periodos: p.map(([e, s]) => [min(e), min(s)] as [number, number]),
    almocoLivre: !!d?.almoco_livre, compensado: !!d?.compensado, neutro: !!d?.neutro,
    tolExtra: h.tolerancia_extra, tolFalta: h.tolerancia_falta, limExtra: h.limite_extra, limFalta: h.limite_falta,
    noturno: [min(h.noturno_inicio), min(h.noturno_fim)],
  };
}

/** Minutos previstos no dia (soma dos períodos; saída menor que a entrada passa da meia-noite). */
export function minutosDoDia(d: DiaHorarioSalvo | undefined) {
  return periodosDoDia(d).reduce((t, [e, s]) => t + ((min(s) - min(e) + 1440) % 1440), 0);
}

/** "Seg Ter Qua Qui Sex Sáb: 08:00-14:00 Dom: Folga", como na lista do RHiD. */
export function resumoHorario(h: Pick<HorarioPonto, "dias">) {
  const grupos = new Map<string, number[]>();
  for (const dow of ORDEM_DIAS) {
    const d = h.dias[String(dow)];
    const p = periodosDoDia(d);
    const k = p.length ? p.map(([e, s]) => `${e}-${s}`).join(" ") + (d?.compensado ? " (compensado)" : d?.neutro ? " (neutro)" : "") : "Folga";
    grupos.set(k, [...(grupos.get(k) ?? []), dow]);
  }
  const ordem = [...grupos.entries()].sort((a, b) => (a[0] === "Folga" ? 1 : 0) - (b[0] === "Folga" ? 1 : 0));
  return ordem.map(([k, ds]) => `${ds.map((d) => DIAS_SEMANA[d]).join(" ")}: ${k}`).join(" · ");
}

/** Total de horas previstas na semana (min). */
export function totalSemana(h: Pick<HorarioPonto, "dias">) {
  return ORDEM_DIAS.reduce((t, dow) => t + minutosDoDia(h.dias[String(dow)]), 0);
}

/** Horário da pessoa no dia: a exceção do dia manda; senão, o vínculo que cobre a data. */
export function horarioIdNoDia(dia: string, vinculos: VinculoHorario[], excecoes?: Map<string, string | null>): string | null | undefined {
  if (excecoes?.has(dia)) return excecoes.get(dia) ?? null;
  const v = vinculos.filter((x) => x.de <= dia && (!x.ate || x.ate >= dia)).sort((a, b) => b.de.localeCompare(a.de))[0];
  return v ? v.horario_id : undefined;
}
