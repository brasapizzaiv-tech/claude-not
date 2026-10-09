// Regra dos lembretes da equipe (migration 0218). Sem nada de servidor nem
// import: o painel, o app e os testes (scripts/lembretes.test.mjs) usam igual.

export type Repeticao = "uma_vez" | "diario" | "semanal" | "mensal";
export type Lembrete = {
  id: string;
  titulo: string;
  texto: string | null;
  tipo: "aviso" | "tarefa";
  para: "todos" | "setores" | "pessoas";
  setorIds: string[];
  colaboradorIds: string[];
  repeticao: Repeticao;
  data: string;        // YYYY-MM-DD
  ate: string | null;
  dias: number[];      // 0=dom ... 6=sáb
  diaMes: number | null;
  hora: string | null; // HH:MM
  ativo: boolean;
};
export type Destinatario = { id: string; setores: string[] };

export const NOME_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Dia da semana de uma data YYYY-MM-DD (0=dom), sem depender do fuso. */
export function diaDaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function ultimoDiaDoMes(dia: string): number {
  const [a, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** O lembrete cai neste dia? (repetição; "uma vez" só no próprio dia) */
export function valeNoDia(l: Pick<Lembrete, "repeticao" | "data" | "ate" | "dias" | "diaMes" | "ativo">, dia: string): boolean {
  if (!l.ativo || dia < l.data) return false;
  if (l.repeticao === "uma_vez") return dia === l.data;
  if (l.ate && dia > l.ate) return false;
  if (l.repeticao === "diario") return true;
  if (l.repeticao === "semanal") return l.dias.includes(diaDaSemana(dia));
  if (l.repeticao === "mensal") {
    if (!l.diaMes) return false;
    const d = Number(dia.slice(8, 10));
    // Dia 31 num mês de 30 dias cai no último dia do mês (senão sumiria).
    return d === Math.min(l.diaMes, ultimoDiaDoMes(dia));
  }
  return false;
}

/** O lembrete é pra esta pessoa? */
export function ehPara(l: Pick<Lembrete, "para" | "setorIds" | "colaboradorIds">, p: Destinatario): boolean {
  if (l.para === "todos") return true;
  if (l.para === "pessoas") return l.colaboradorIds.includes(p.id);
  return l.setorIds.some((s) => p.setores.includes(s));
}

/** Dia em que a confirmação conta. Repetido: o próprio dia. Uma vez: a data do
 *  lembrete (quem não viu no dia continua vendo depois, até confirmar). */
export function diaDaConfirmacao(l: Pick<Lembrete, "repeticao" | "data">, hoje: string): string {
  return l.repeticao === "uma_vez" ? l.data : hoje;
}

/** Lembrete de uma vez que ficou pra trás sem confirmar continua aparecendo
 *  por até 7 dias (depois disso já perdeu o sentido). */
export const ATRASADO_ATE_DIAS = 7;

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Lembretes que a pessoa vê hoje: os do dia + os de "uma vez" atrasados
 *  (até 7 dias) que ela ainda não confirmou. `confirmados` = chaves
 *  "lembreteId|dia" que esta pessoa já confirmou. Ordem: hora, depois título. */
export function lembretesDaPessoa(
  lembretes: Lembrete[],
  p: Destinatario,
  hoje: string,
  confirmados: Set<string>,
): { lembrete: Lembrete; dia: string; confirmado: boolean; atrasado: boolean }[] {
  const saida: { lembrete: Lembrete; dia: string; confirmado: boolean; atrasado: boolean }[] = [];
  const limite = somarDias(hoje, -ATRASADO_ATE_DIAS);
  for (const l of lembretes) {
    if (!ehPara(l, p)) continue;
    const dia = diaDaConfirmacao(l, hoje);
    const confirmado = confirmados.has(`${l.id}|${dia}`);
    if (valeNoDia(l, hoje)) {
      saida.push({ lembrete: l, dia, confirmado, atrasado: false });
    } else if (l.ativo && l.repeticao === "uma_vez" && l.data < hoje && l.data >= limite && !confirmado) {
      saida.push({ lembrete: l, dia, confirmado: false, atrasado: true });
    }
  }
  return saida.sort((a, b) =>
    (a.lembrete.hora ?? "00:00").localeCompare(b.lembrete.hora ?? "00:00") || a.lembrete.titulo.localeCompare(b.lembrete.titulo));
}

/** "Hoje às 15:00", "Toda seg e qua", "Todo dia 5"... pro painel. */
export function resumoQuando(l: Pick<Lembrete, "repeticao" | "data" | "ate" | "dias" | "diaMes" | "hora">): string {
  const fData = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const hora = l.hora ? ` às ${l.hora}` : "";
  const ate = l.ate ? ` até ${fData(l.ate)}` : "";
  if (l.repeticao === "uma_vez") return `${fData(l.data)}${hora}`;
  if (l.repeticao === "diario") return `Todo dia${hora}${ate}`;
  if (l.repeticao === "semanal") {
    const dias = [...l.dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => NOME_DIA[d]);
    return `Toda ${dias.join(", ") || "(nenhum dia)"}${hora}${ate}`;
  }
  return `Todo dia ${l.diaMes ?? "?"} do mês${hora}${ate}`;
}

/** Linha do banco → Lembrete. */
export function lerLembrete(r: Record<string, unknown>): Lembrete {
  return {
    id: String(r.id),
    titulo: String(r.titulo ?? ""),
    texto: (r.texto as string | null) ?? null,
    tipo: r.tipo === "tarefa" ? "tarefa" : "aviso",
    para: r.para === "setores" || r.para === "pessoas" ? r.para : "todos",
    setorIds: (r.setor_ids as string[] | null) ?? [],
    colaboradorIds: (r.colaborador_ids as string[] | null) ?? [],
    repeticao: (["uma_vez", "diario", "semanal", "mensal"].includes(String(r.repeticao)) ? r.repeticao : "uma_vez") as Repeticao,
    data: String(r.data ?? "").slice(0, 10),
    ate: r.ate ? String(r.ate).slice(0, 10) : null,
    dias: ((r.dias as number[] | null) ?? []).map(Number),
    diaMes: r.dia_mes != null ? Number(r.dia_mes) : null,
    hora: (r.hora as string | null) ?? null,
    ativo: r.ativo !== false,
  };
}
