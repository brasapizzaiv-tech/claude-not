// EVENTOS MARCADOS
//
// Regras puras, como as dos feriados: lidas pela tela do painel, pela TV da
// cozinha e pelo mural do escritório.
import { SITUACAO, ehPeriodo, rotuloDaData, rotuloDoDia, somarDias, ultimoDia, type Feriado } from "@/lib/feriados";

export type StatusEvento = "marcado" | "confirmado" | "cancelado";

export type Evento = {
  id: string;
  data: string;
  hora: string | null;
  titulo: string;
  pessoas: number;
  lugar: string | null;
  contato: string | null;
  telefone: string | null;
  cardapio: string | null;
  observacao: string | null;
  status: StatusEvento;
};

export const STATUS_EVENTO: Record<StatusEvento, { longo: string; cor: string }> = {
  marcado: { longo: "Marcado", cor: "#C78340" },
  confirmado: { longo: "Confirmado", cor: "#9dbd7c" },
  cancelado: { longo: "Cancelado", cor: "#9b8878" },
};

/** Os que vêm aí, sem os cancelados. */
export function proximosEventos(lista: Evento[], hoje: string, dias = 120, quantos = 6) {
  const limite = somarDias(hoje, dias);
  return lista
    .filter((e) => e.status !== "cancelado" && e.data >= hoje && e.data <= limite)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, quantos);
}

/** "40 pessoas · Salão · 20h" — o resumo do combinado numa linha. */
export function resumoDoEvento(e: Evento) {
  return [e.pessoas > 0 ? `${e.pessoas} pessoas` : "", e.lugar ?? "", e.hora ?? ""]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// O QUE VEM AÍ, NUMA LISTA SÓ
//
// Nas TVs feriado e evento não são duas seções: são a mesma pergunta — "o que
// tem marcado?" — e disputam as mesmas duas ou três linhas. Então os dois viram
// linhas do mesmo formato e se misturam em ordem de data. Quem lê de longe não
// precisa saber qual tabela guardou o quê.
// ---------------------------------------------------------------------------
export type LinhaDaAgenda = {
  id: string;
  data: string;
  /** O dia (ou o período), já escrito. */
  quando: string;
  /** O assunto: o nome do feriado ou o título do evento. */
  titulo: string;
  /** Segunda linha, quando tem: o detalhe do feriado ou o combinado do evento. */
  detalhe: string | null;
  /** O que se lê de relance, à direita: ABERTO, FECHADO, ou a hora do evento. */
  destaque: string;
  cor: string;
};

/** Quantas linhas a tela dá pra agenda. Um número é o total, misturado em
 *  ordem de data. Um par é uma COTA por tipo — e existe por causa da cozinha:
 *  lá o evento não pode ser empurrado pra fora por dois feriados mais
 *  próximos. Feriado a cozinha só precisa saber na véspera; evento de 40
 *  pessoas ela precisa saber com semanas, pra comprar. */
export type CotaDaAgenda = number | { feriados: number; eventos: number };

export function agendaDaTv(
  feriados: Feriado[],
  eventos: Evento[],
  hoje: string,
  cota: CotaDaAgenda = 3,
  dias = 120,
): LinhaDaAgenda[] {
  const limite = somarDias(hoje, dias);

  // Feriado vivo é o que ainda não ACABOU — férias coletivas em andamento
  // continuam valendo. E data solta dentro de um período some: com a casa
  // fechada, "25/12 Natal" não é notícia.
  const vivos = feriados.filter((f) => ultimoDia(f) >= hoje && f.data <= limite);
  const periodos = vivos.filter(ehPeriodo);
  const deFeriado: LinhaDaAgenda[] = vivos
    .filter((f) => ehPeriodo(f) || !periodos.some((p) => hoje <= ultimoDia(p) && f.data >= p.data && f.data <= ultimoDia(p)))
    .map((f) => ({
      id: `f${f.id}`,
      data: f.data,
      quando: rotuloDaData(f),
      titulo: f.nome,
      detalhe: f.detalhe,
      destaque: SITUACAO[f.situacao].curto,
      cor: SITUACAO[f.situacao].cor,
    }));

  const deEvento: LinhaDaAgenda[] = proximosEventos(eventos, hoje, dias, 12).map((e) => ({
    id: `e${e.id}`,
    data: e.data,
    quando: rotuloDoDia(e.data),
    titulo: e.titulo,
    // O que a cozinha precisa: quantos, onde, e o que foi combinado de comer.
    // Sem a hora: ela ja vai no destaque, e repetir gasta a linha que o
    // cardapio precisa.
    detalhe:
      [e.pessoas > 0 ? `${e.pessoas} pessoas` : "", e.lugar ?? "", e.cardapio ?? ""]
        .filter(Boolean)
        .join(" · ") || null,
    // A hora é o que a casa toda pergunta primeiro sobre um evento.
    destaque: e.hora ? e.hora : "EVENTO",
    cor: STATUS_EVENTO[e.status].cor,
  }));

  const porData = (a: LinhaDaAgenda, b: LinhaDaAgenda) => a.data.localeCompare(b.data);
  deFeriado.sort(porData);
  deEvento.sort(porData);

  if (typeof cota === "number") return [...deFeriado, ...deEvento].sort(porData).slice(0, cota);

  // Com cota, cada tipo tem o seu lugar garantido; o que sobra de um não passa
  // pro outro, e a tela devolve o espaço pro cardápio.
  return [...deFeriado.slice(0, cota.feriados), ...deEvento.slice(0, cota.eventos)].sort(porData);
}
