// Preço de item com etapas (combo do delivery e complementos das marmitas),
// migration 0263. Mesma conta na tela (montador) e no servidor:
// preço = preço do item + cada etapa. Etapa comum soma as opções escolhidas;
// etapa de pizza (media) cobra a média dos sabores, como a pizza normal.

export type EtapaPreco = { id: string; min: number; max: number; permite_repetir: boolean; media?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** escolhas: id da etapa → preços das opções escolhidas (repetida conta de novo). */
export function precoComEtapas(base: number, etapas: EtapaPreco[], escolhas: Record<string, number[]>) {
  let total = Number(base) || 0;
  for (const g of etapas) {
    const v = escolhas[g.id] ?? [];
    if (v.length === 0) continue;
    const soma = v.reduce((s, p) => s + (Number(p) || 0), 0);
    total += g.media ? soma / v.length : soma;
  }
  return r2(total);
}

/** Confere mínimo, máximo e repetição de cada etapa. Devolve o problema ou null. */
export function problemaDasEscolhas(etapas: (EtapaPreco & { nome?: string })[], escolhas: Record<string, string[]>) {
  for (const g of etapas) {
    const ids = escolhas[g.id] ?? [];
    const nome = g.nome ?? "uma etapa";
    if (ids.length < (g.min ?? 0)) return `Escolha ${g.min} em "${nome}".`;
    if (g.max > 0 && ids.length > g.max) return `No máximo ${g.max} em "${nome}".`;
    if (!g.permite_repetir && new Set(ids).size < ids.length) return `Não repete opção em "${nome}".`;
  }
  return null;
}

/** "A partir de": o menor preço possível cumprindo o mínimo de cada etapa. */
export function menorPreco(base: number, etapas: EtapaPreco[], precosPorEtapa: Record<string, number[]>) {
  let total = Number(base) || 0;
  for (const g of etapas) {
    const precos = [...(precosPorEtapa[g.id] ?? [])].map(Number).sort((a, b) => a - b);
    const min = Math.max(0, g.min ?? 0);
    if (min === 0 || precos.length === 0) continue;
    if (g.media) total += precos[0];
    else if (g.permite_repetir) total += precos[0] * min;
    else total += precos.slice(0, min).reduce((s, p) => s + p, 0);
  }
  return r2(total);
}

/** Menor preço de cada combo (card "a partir de"), a partir das etapas e opções carregadas. */
export function aPartirDosCombos(
  itens: { id: string; preco: number; combo?: boolean }[],
  etapas: (EtapaPreco & { item_id: string })[],
  opcoes: { grupo_id: string; preco: number }[],
) {
  const precos: Record<string, number[]> = {};
  for (const o of opcoes) (precos[o.grupo_id] ??= []).push(Number(o.preco));
  const m = new Map<string, number>();
  for (const i of itens) if (i.combo) m.set(i.id, menorPreco(i.preco, etapas.filter((g) => g.item_id === i.id), precos));
  return m;
}
