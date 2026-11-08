// Desconto na nota fiscal (NFC-e): contas puras, sem banco.
// O desconto dado no recebimento (caixa ou PDV) fica em pdv_comandas.desconto_nota
// e sai na nota em cada item (campo valor_desconto da Focus), pra que o total da
// nota bata com o que o cliente pagou. Tudo em centavos pra não errar a soma.

/**
 * Reparte `desconto` entre os valores, proporcional a cada um. A soma das partes
 * é exatamente o desconto; nenhuma parte passa do próprio valor (item não fica
 * negativo). O centavo que sobra do arredondamento vai pra quem ficou mais
 * perto de arredondar pra cima (maior resto).
 * Desconto maior ou igual à soma devolve cada valor inteiro (quem chama decide
 * se isso emite ou não).
 */
export function repartirDesconto(valores: number[], desconto: number): number[] {
  const cents = valores.map((v) => Math.max(0, Math.round((Number(v) || 0) * 100)));
  const total = cents.reduce((a, b) => a + b, 0);
  const alvo = Math.min(total, Math.max(0, Math.round((Number(desconto) || 0) * 100)));
  if (alvo === 0 || total === 0) return cents.map(() => 0);
  const partes = cents.map((c) => Math.floor((c * alvo) / total));
  let falta = alvo - partes.reduce((a, b) => a + b, 0);
  // Maior resto primeiro; em empate, a ordem original.
  const resto = cents.map((c) => (c * alvo) % total);
  const ordem = cents.map((c, i) => [resto[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  while (falta > 0) {
    let deu = false;
    for (const [, i] of ordem) {
      if (falta === 0) break;
      if (partes[i] < cents[i]) { partes[i]++; falta--; deu = true; }
    }
    if (!deu) break;
  }
  return partes.map((p) => p / 100);
}

/** Total da nota depois do desconto, no centavo. */
export function totalComDesconto(total: number, desconto: number) {
  return Math.max(0, Math.round((Number(total) || 0) * 100) - Math.round(Math.max(0, Number(desconto) || 0) * 100)) / 100;
}
