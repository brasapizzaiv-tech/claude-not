// Fechamento de caixa — fórmulas e formas de pagamento.
// Reproduz o relatório de caixa (venda bruta → saldo final) e a divisão por
// forma de pagamento.

export const FORMAS_CAIXA = ["Dinheiro", "Cartão", "Pix", "Fiado", "Saldo"] as const;

export type FormaLinha = { forma: string; pedidos: number; valor: number };

export type FechamentoDados = {
  venda_bruta: number;
  acrescimos: number;
  cancelados: number;
  descontos: number;
  fretes: number;
  fundo_caixa: number;
  recebimentos: number;
  creditos: number;
  pagamentos: number;
  fiado: number;
  quebra: number;
  formas: FormaLinha[];
};

export function calcFechamento(d: FechamentoDados) {
  const venda_liquida =
    d.venda_bruta + d.acrescimos - d.cancelados - d.descontos;
  const total_pedidos = venda_liquida + d.fretes;
  const saldo_final =
    total_pedidos +
    d.fundo_caixa +
    d.recebimentos +
    d.creditos -
    d.pagamentos -
    d.fiado -
    d.quebra;
  // "Outros" (movimentações de caixa) são atribuídos ao Dinheiro no relatório.
  const outros_dinheiro =
    d.fundo_caixa + d.recebimentos + d.creditos - d.pagamentos;
  const pedidos_total = (d.formas ?? []).reduce((s, f) => s + (f.pedidos || 0), 0);
  const formas_total = (d.formas ?? []).reduce((s, f) => s + (f.valor || 0), 0);
  const ticket_medio = pedidos_total ? formas_total / pedidos_total : 0;
  return {
    venda_liquida,
    total_pedidos,
    saldo_final,
    outros_dinheiro,
    pedidos_total,
    formas_total,
    ticket_medio,
  };
}

// "1.234,56" | "1234,56" | "1234.56" | "1234" → número
export function moedaNum(v: unknown): number {
  let s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Number(s) || 0;
}
