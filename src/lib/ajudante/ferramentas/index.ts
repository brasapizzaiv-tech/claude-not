import type { Ferramenta } from "./tipos";
import { FERRAMENTAS_VENDAS } from "./vendas";
import { FERRAMENTAS_ESTOQUE } from "./estoque";
import { FERRAMENTAS_EQUIPE } from "./equipe";

// Todas as consultas do Ajudante, numa ordem fixa (a ordem entra no cache).
export const FERRAMENTAS: Ferramenta[] = [...FERRAMENTAS_VENDAS, ...FERRAMENTAS_ESTOQUE, ...FERRAMENTAS_EQUIPE];

const nomes = new Set<string>();
for (const f of FERRAMENTAS) {
  if (nomes.has(f.nome)) throw new Error(`Ferramenta do Ajudante repetida: ${f.nome}`);
  nomes.add(f.nome);
}
