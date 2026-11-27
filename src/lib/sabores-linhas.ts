// Um sabor por linha no papel e no tablet (pedido do Rafael, 27/11/2026).
// A descrição gravada continua a mesma ("Pizza Grande 35cm — A / B" na pizza
// avulsa; "- Pizza Grande 35cm: A / B" dentro do combo); só a hora de mostrar
// quebra os sabores, cada um na sua linha começando com "•".

const EH_PIZZA = /pizza|\d\s*cm\b|broto|m[ée]dia|grande|gigante|mini/i;
const SABOR = "  • ";

function sabores(lista: string): string[] {
  return lista.split(" / ").map((s) => s.trim()).filter(Boolean);
}

/** Linhas da descrição com os sabores quebrados. A 1ª linha continua sendo o nome. */
export function linhasComSabores(descricao: string): string[] {
  const [primeira = "", ...resto] = String(descricao || "").split("\n");
  const saida: string[] = [];

  // Pizza avulsa: "Pizza Grande 35cm — A / B · borda Catupiry"
  const m = primeira.match(/^(.+?) — (.+)$/);
  if (m && EH_PIZZA.test(m[1])) {
    let lista = m[2];
    let borda: string | null = null;
    const b = lista.match(/^(.*?) · (borda .+)$/i);
    if (b) { lista = b[1]; borda = b[2]; }
    const ss = sabores(lista);
    if (ss.length > 1 || borda) {
      saida.push(m[1].trim());
      for (const s of ss) saida.push(`${SABOR}${s}`);
      if (borda) saida.push(`  ${borda.charAt(0).toUpperCase()}${borda.slice(1)}`);
    } else saida.push(primeira);
  } else saida.push(primeira);

  for (const l of resto) {
    // Pizza dentro do combo: "- Pizza Grande 35cm: A / B"
    const c = l.match(/^-\s*(.+?):\s*(.+ \/ .+)$/);
    if (c && EH_PIZZA.test(c[1])) {
      saida.push(`- ${c[1].trim()}:`);
      for (const s of sabores(c[2])) saida.push(`${SABOR}${s}`);
    } else saida.push(l);
  }
  return saida;
}

export const comSaboresQuebrados = (descricao: string) => linhasComSabores(descricao).join("\n");
