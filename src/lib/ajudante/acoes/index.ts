import type { Acao } from "./tipos";
import { ACOES_EQUIPE } from "./equipe";
import { ACOES_RECADOS } from "./recados";
import { ACOES_ESTOQUE } from "./estoque";
import { ACOES_CADASTROS } from "./cadastros";

// Todas as ações do Ajudante, numa ordem fixa (a ordem entra no cache).
export const ACOES: Acao[] = [...ACOES_EQUIPE, ...ACOES_RECADOS, ...ACOES_ESTOQUE, ...ACOES_CADASTROS];

const nomes = new Set<string>();
for (const a of ACOES) {
  if (!a.nome.startsWith("acao_")) throw new Error(`Ação do Ajudante sem prefixo acao_: ${a.nome}`);
  if (nomes.has(a.nome)) throw new Error(`Ação do Ajudante repetida: ${a.nome}`);
  nomes.add(a.nome);
}

/** Ações valem só pro dono por enquanto (decisão do Rafael, 17/11/2026). */
export const ACOES_SO_DONO = true;
/** Minutos que um pedido de ação fica esperando o "Confirmar". */
export const ACAO_VALIDADE_MIN = 15;
