// Nome dos sabores de uma pizza pra comanda, cozinha e carrinho.
// O sabor pode repetir (Grande com 3 partes: 2 de Calabresa + 1 de Frango);
// aí sai a fração: "2/3 Calabresa / 1/3 Frango". Sem repetição fica como
// sempre foi: "Calabresa / Frango".

const mdc = (a: number, b: number): number => (b ? mdc(b, a % b) : a);

export function nomesDosSabores(ids: string[], nomeDe: (id: string) => string): string {
  const conta = new Map<string, number>();
  for (const id of ids) conta.set(id, (conta.get(id) ?? 0) + 1);
  const total = ids.length;
  const repete = conta.size < total;
  return [...conta.entries()]
    .map(([id, n]) => {
      const nome = nomeDe(id) || "?";
      if (!repete) return nome;
      if (n === total) return nome; // só um sabor, repetido: é a pizza inteira
      const d = mdc(n, total);
      return `${n / d}/${total / d} ${nome}`;
    })
    .join(" / ");
}
