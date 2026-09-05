// Conferência de sanidade da contagem: quanto o produto PODERIA ter no máximo
// (última contagem finalizada + o que chegou desde então). Digitou mais que
// isso? Provavelmente contou errado — a tela pede pra contar de novo.
export type Referencia = {
  produto_id: string;
  ultima_qtd: number;
  ultima_data: string; // YYYY-MM-DD
  comprado: number;
};

export function mapaReferencia(lista: Referencia[] | null | undefined) {
  const m = new Map<string, Referencia>();
  for (const r of lista ?? []) m.set(r.produto_id, { ...r, ultima_qtd: Number(r.ultima_qtd) || 0, comprado: Number(r.comprado) || 0 });
  return m;
}

export function maximoEsperado(r: Referencia | undefined) {
  if (!r) return null;
  return Math.round((r.ultima_qtd + r.comprado) * 1000) / 1000;
}

// Suspeito = digitou MAIS do que podia ter (tolerância de 0,5% pra arredondamento).
export function suspeito(valor: number, r: Referencia | undefined) {
  const max = maximoEsperado(r);
  if (max === null || !(valor > 0)) return false;
  return valor > max * 1.005 + 0.0005;
}

export function explicacao(r: Referencia, valor: number) {
  const d = r.ultima_data ? `${r.ultima_data.slice(8, 10)}/${r.ultima_data.slice(5, 7)}` : "";
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return `Na última contagem (${d}) tinha ${f(r.ultima_qtd)}${r.comprado > 0 ? ` e chegou ${f(r.comprado)} depois (notas e pedidos da cotação)` : " e não chegou nada depois (nem nota, nem pedido)"} = no máximo ${f(maximoEsperado(r) ?? 0)}. Você digitou ${f(valor)}. Confere de novo?`;
}
