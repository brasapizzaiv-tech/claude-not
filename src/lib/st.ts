// Custo efetivo de um item considerando a ST (Substituição Tributária).
// - produto sem ST: o preço é o custo.
// - com ST e "inclusa" = true: o preço já inclui a ST → custo = preço.
// - com ST e "inclusa" = false: soma a % → custo = preço × (1 + %/100).
export function custoComSt(
  preco: number,
  temSt: boolean,
  stInclusa: boolean | null,
  stPct: number | null,
): number {
  if (!temSt || !preco) return preco;
  if (stInclusa) return preco;
  const pct = Number(stPct) || 0;
  if (pct <= 0) return preco;
  return Math.round(preco * (1 + pct / 100) * 1e6) / 1e6;
}

// Quanto da ST está "embutida" quando o fornecedor diz que a ST já está no preço
// (para fins de conferência): preço × %/(100+%).
export function stEmbutida(preco: number, stPct: number | null): number {
  const pct = Number(stPct) || 0;
  if (pct <= 0 || !preco) return 0;
  return Math.round((preco * pct) / (100 + pct) * 100) / 100;
}
