// EQP-04: reparte o 10% de uma noite em CENTAVOS pelo peso de cada um. Cada
// pessoa leva o piso da sua parte e os centavos que sobram vão pras maiores
// frações (empate: pela ordem do id). A soma bate sempre com o "a dividir" —
// antes cada um era arredondado só no lançamento e a soma podia fugir alguns
// centavos.
export function repartirDez(pool: number, presentes: { id: string; peso: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const pesoTotal = presentes.reduce((s, p) => s + p.peso, 0);
  const centavos = Math.round(pool * 100);
  if (!(pesoTotal > 0) || centavos <= 0) return out;
  const partes = presentes.map((p) => {
    const exata = (centavos * p.peso) / pesoTotal;
    return { id: p.id, base: Math.floor(exata + 1e-9), resto: exata - Math.floor(exata + 1e-9) };
  });
  let sobra = centavos - partes.reduce((s, p) => s + p.base, 0);
  const ordem = [...partes].sort((a, b) => b.resto - a.resto || a.id.localeCompare(b.id));
  for (const p of ordem) {
    if (sobra <= 0) break;
    p.base++;
    sobra--;
  }
  for (const p of partes) out.set(p.id, (out.get(p.id) ?? 0) + p.base / 100);
  return out;
}
