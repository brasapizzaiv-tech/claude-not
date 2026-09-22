// COMO O PAGAMENTO FOI FEITO, LIDO DO EXTRATO
//
// O extrato do banco já diz como o dinheiro andou — "LIQUIDACAO BOLETO",
// "PIX RECEBIDO", "COMPRA NACIONAL DEBIT MASTERCARD". Essa informação existia
// e se perdia: ao conciliar, o lançamento ficava sem banco e sem forma de
// pagamento, e o relatório da contabilidade saía com as duas colunas vazias.
//
// A regra aqui é conservadora DE PROPÓSITO: só devolve o que dá pra afirmar
// olhando a descrição. Diante de "DEB. FOLHA PAGTO", "TARIFA" ou "PACOTE
// SERVICOS" ela devolve vazio, porque chutar no relatório da contabilidade é
// pior do que deixar em branco — campo vazio a pessoa preenche; campo errado
// ela acredita.
//
// As palavras devolvidas são as MESMAS que o sistema já usa nos lançamentos
// feitos à mão (Dinheiro, Pix, Boleto, Cartão de crédito, Cartão de débito).
// Nada de vocabulário novo, senão o filtro da tela de contas passa a ter dois
// nomes pra mesma coisa.

export type FormaPagamento =
  | "Pix"
  | "Boleto"
  | "Cartão de crédito"
  | "Cartão de débito"
  | "Dinheiro";

export function formaDoExtrato(descricao: string | null | undefined): FormaPagamento | null {
  const d = (descricao ?? "")
    .toUpperCase()
    // Tira acento pra "DÉBITO" e "DEBITO" caírem na mesma regra.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!d.trim()) return null;

  // Boleto antes de tudo: "LIQUIDACAO BOLETO" é o caso mais comum do extrato
  // e não se confunde com nada.
  if (d.includes("BOLETO")) return "Boleto";

  // Pix cobre recebido, emitido, pagamento e a tarifa do Pix.
  if (/\bPIX\b|PIX[_-]/.test(d)) return "Pix";

  // Cartão: só quando a descrição diz DÉBITO ou CRÉDITO junto de algo que é
  // claramente cartão. "CREDITO VERO" e "BANRI A VISTA" são recebimento de
  // maquininha, mas não dizem se foi débito ou crédito — esses ficam de fora.
  const ehCartao = /VISA|MASTER|ELO|CARD|MAQUINA|COMPRA NACIONAL/.test(d);
  if (ehCartao && /DEBIT/.test(d)) return "Cartão de débito";
  if (ehCartao && /CREDIT/.test(d)) return "Cartão de crédito";

  if (d.includes("SAQUE")) return "Dinheiro";

  return null;
}
