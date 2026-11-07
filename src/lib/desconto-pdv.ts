// Desconto na venda do balcão: contas puras, usadas na tela e conferidas no servidor.
import type { TipoForma } from "./formas-pagamento";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Regra do funcionário: dinheiro 30%, Compra da equipe 30% (é descontada do
 * que ele ganha, então conta como dinheiro), cartão e Pix 20%; outra forma não tem.
 */
export function percentualFuncionario(tipo: TipoForma) {
  if (tipo === "dinheiro" || tipo === "equipe") return 30;
  if (["pix", "pix_maquina", "credito", "debito", "cartao"].includes(tipo)) return 20;
  return 0;
}

/** O desconto vale pra um item só: se pediu 3 pizzas, é sobre o preço de uma. */
export function descontoFuncionario(precoDoItem: number, tipo: TipoForma) {
  return r2((precoDoItem * percentualFuncionario(tipo)) / 100);
}

/** O que foi digitado ("10", "7,50"), em R$ ou em %, vira o desconto em reais. */
export function valorDoDesconto(total: number, texto: string, emPercentual: boolean) {
  const n = Number(String(texto).trim().replace(/\./g, "").replace(",", ".")) || 0;
  return Math.max(0, r2(emPercentual ? (total * n) / 100 : n));
}

/** Desconto de 100% não passa: venda de graça é Cortesia, que pede o motivo. */
export function descontoValido(total: number, desconto: number) {
  return Number.isFinite(desconto) && desconto >= 0 && (desconto === 0 || desconto < total);
}
