// Tamanho de embalagem (migration 0245): produto contado em unidade, mas cada
// unidade tem um tamanho (1 kg, 1,7 kg…). Funções puras, usadas no cadastro,
// na contagem, na cotação e na nota.

export type Medida = "kg" | "L";

/** "1,7 kg" · "500 g" (abaixo de 1 kg/L vira g/ml). */
export function textoTamanho(v: number, medida: Medida | string | null | undefined) {
  const m = medida === "L" ? "L" : "kg";
  if (v > 0 && v < 1) return `${Math.round(v * 1000).toLocaleString("pt-BR")} ${m === "L" ? "ml" : "g"}`;
  return `${(Math.round(v * 1000) / 1000).toLocaleString("pt-BR")} ${m}`;
}

/** Lê o tamanho escrito num texto ("EXTRATO 1,04KG - CX 12", "2kg", "500 g", "1,5 L").
 *  Devolve na medida base (kg ou L) ou null se não achar. */
export function lerTamanho(texto: string | null | undefined): { v: number; medida: Medida } | null {
  const t = (texto ?? "").toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(KG|KGS|G|GR|GRS|L|LT|LTS|ML)\b/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!(n > 0)) return null;
  const u = m[2];
  if (u.startsWith("KG")) return { v: n, medida: "kg" };
  if (u === "G" || u.startsWith("GR")) return { v: n / 1000, medida: "kg" };
  if (u === "ML") return { v: n / 1000, medida: "L" };
  return { v: n, medida: "L" };
}

/** "1; 1,04; 1,7" (ou com "kg" escrito) → [1, 1.04, 1.7], sem repetidos, em ordem. */
export function lerListaTamanhos(texto: string | null | undefined): number[] {
  const out = new Set<number>();
  for (const parte of (texto ?? "").split(/[;\n|]+|\s{2,}|,\s+(?=\d)/)) {
    const lido = lerTamanho(parte);
    const n = lido ? lido.v : Number(parte.trim().replace(",", "."));
    if (n > 0 && n < 10000) out.add(Math.round(n * 10000) / 10000);
  }
  return [...out].sort((a, b) => a - b);
}

/** Total real de uma lista de "qtd × tamanho" (só as que têm tamanho). */
export function totalReal(partes: { qtd: number; tam?: number | null }[]) {
  let total = 0, semTamanho = 0;
  for (const p of partes) {
    if (p.tam && p.tam > 0) total += p.qtd * p.tam;
    else semTamanho += p.qtd;
  }
  return { total: Math.round(total * 1000) / 1000, semTamanho: Math.round(semTamanho * 1000) / 1000 };
}
