// Relatórios gerenciais do ponto (etapa 4 da saída do RHiD, 27/10/2026):
// resumo do mês pro contador, absenteísmo e turnover. Puro (sem banco) —
// testado em scripts/ponto-relatorios.test.mjs. As linhas vêm do espelho().
import type { LinhaEspelho, TotaisEspelho } from "./ponto-relatorio-core";

// Segunda-feira da semana (igual ao segundaDaSemana do espelho; aqui pra lib seguir sem import de runtime).
function segunda(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type ResumoMes = {
  diasTrabalhados: number;
  horasNormais: number;      // previsto − o que faltou (min)
  faltas: number;            // dias sem batida e sem justificativa
  faltaMin: number;          // falta + atraso + saída antes (min)
  extraPor: TotaisEspelho["extraPor"];
  extra: number;
  noturno: number;
  dsrPerdidos: number;       // semanas com falta sem justificativa
  incompletos: number;
  /** Dias justificados por nome (Atestado médico: 2, Férias: 10...). */
  justificados: Record<string, number>;
  folgas: number;
};

export function resumoMes(linhas: LinhaEspelho[], totais: TotaisEspelho): ResumoMes {
  const justificados: Record<string, number> = {};
  let folgas = 0;
  for (const l of linhas) {
    if (l.situacao === "folga") folgas++;
    // Só a justificativa de dia inteiro (as de horas já entram nas horas).
    if ((l.situacao === "atestado" || l.situacao === "abono") && l.justificativa) {
      const nome = l.justificativa.split(" · ")[0];
      justificados[nome] = (justificados[nome] ?? 0) + 1;
    } else if (l.situacao === "atestado" || l.situacao === "abono") {
      const nome = l.situacao === "atestado" ? "Atestado" : "Abonado";
      justificados[nome] = (justificados[nome] ?? 0) + 1;
    }
  }
  return {
    diasTrabalhados: totais.diasTrabalhados,
    horasNormais: Math.max(0, totais.previsto - totais.faltante),
    faltas: totais.faltas,
    faltaMin: totais.faltante,
    extraPor: totais.extraPor,
    extra: totais.extra,
    noturno: totais.noturno,
    dsrPerdidos: new Set(linhas.filter((l) => l.situacao === "falta").map((l) => segunda(l.dia))).size,
    incompletos: totais.incompletos,
    justificados,
    folgas,
  };
}

export type Absenteismo = {
  previstoMin: number;   // horas do horário no período (sem as folgas)
  faltasMin: number;     // dias de falta inteiros
  atrasosMin: number;    // atraso, saída antes e buraco nos dias trabalhados
  justificadoMin: number; // atestado, abono e afastamento (dia inteiro)
  ausenteMin: number;
  indice: number;        // ausente / previsto (0,05 = 5%)
};

/** Absenteísmo: quanto do tempo combinado a pessoa não esteve, por qualquer motivo
 *  menos folga combinada. Atestado entra (é ausência, mesmo justificada). */
export function absenteismo(linhas: LinhaEspelho[]): Absenteismo {
  const a: Absenteismo = { previstoMin: 0, faltasMin: 0, atrasosMin: 0, justificadoMin: 0, ausenteMin: 0, indice: 0 };
  for (const l of linhas) {
    if (l.situacao === "folga" || l.situacao === "hoje" || !l.escalaMin) continue;
    a.previstoMin += l.escalaMin;
    if (l.situacao === "falta") a.faltasMin += l.faltaMin;
    else if (l.situacao === "atestado" || l.situacao === "abono") a.justificadoMin += l.escalaMin;
    else a.atrasosMin += l.faltaMin;
  }
  a.ausenteMin = a.faltasMin + a.atrasosMin + a.justificadoMin;
  a.indice = a.previstoMin ? a.ausenteMin / a.previstoMin : 0;
  return a;
}

export type PessoaTurnover = { id: string; nome: string; admissao: string | null; desligamento: string | null };
export type Turnover = {
  inicio: number; fim: number;
  admitidos: PessoaTurnover[]; desligados: PessoaTurnover[];
  /** ((admitidos + desligados) / 2) / média do quadro. 0,1 = 10%. */
  indice: number;
};

/** Turnover do período (fórmula usual: média de entradas e saídas sobre o quadro médio).
 *  Sem data de admissão conta como antigo (já estava no início). Desligamento = último dia. */
export function turnover(pessoas: PessoaTurnover[], de: string, ate: string): Turnover {
  const estaNoDia = (p: PessoaTurnover, dia: string) => (!p.admissao || p.admissao <= dia) && (!p.desligamento || p.desligamento >= dia);
  const inicio = pessoas.filter((p) => estaNoDia(p, de)).length;
  const fim = pessoas.filter((p) => estaNoDia(p, ate)).length;
  const admitidos = pessoas.filter((p) => p.admissao && p.admissao >= de && p.admissao <= ate);
  const desligados = pessoas.filter((p) => p.desligamento && p.desligamento >= de && p.desligamento <= ate);
  const media = (inicio + fim) / 2;
  return { inicio, fim, admitidos, desligados, indice: media ? (admitidos.length + desligados.length) / 2 / media : 0 };
}
