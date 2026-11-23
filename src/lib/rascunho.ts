// Rascunho à mão de fornecedor (sem nota fiscal): tipos e contas usados na
// tela e no servidor. A leitura pela IA fica em rascunho-ia.ts (só servidor).

/** Valor de `notas_fiscais.modelo` da compra que veio de rascunho (não é NF). */
export const MODELO_RASCUNHO = "rascunho";

export const UNIDADES_RASCUNHO = ["KG", "UN", "MC", "CX", "BDJ", "PCT", "DZ"] as const;

export type LinhaRascunho = {
  escrito: string;
  descricao: string;
  produto: string | null;
  qtd: number;
  unidade: string;
  valor_unit: number;
  valor_total: number;
  duvida: string | null;
};

export type LeituraRascunho = {
  linhas: LinhaRascunho[];
  totalEscrito: number | null;
  data: string | null;
  observacao: string | null;
};

/** A linha fecha? (quantidade × preço = total, com folga de 5 centavos ou 1%). */
export function linhaFecha(l: { qtd: number; valor_unit: number; valor_total: number }) {
  const conta = l.qtd * l.valor_unit;
  return Math.abs(conta - l.valor_total) <= Math.max(0.05, l.valor_total * 0.01);
}
