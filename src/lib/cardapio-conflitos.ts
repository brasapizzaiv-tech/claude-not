// Pratos repetidos no cardápio do dia (pedido do Rafael, 18/11/2026: saiu
// "Berinjela à pizzaiola" e "Ratatouille" no mesmo dia). Sem servidor aqui:
// o celular da cozinha e o painel usam o mesmo cálculo pra avisar na hora, e o
// publicar confere de novo no servidor.
//
// Conta como repetido:
//  - INGREDIENTE de destaque igual em dois pratos (berinjela, abobrinha, peixe…).
//    As bases do buffet (frango, carne, arroz, feijão, batata, massa…) repetem
//    todo dia de propósito e ficam de fora (camarão também: risoto + bobó no
//    sábado é de propósito — Rafael, 18/11). A sobremesa (especial) não entra.
//  - PREPARO marcante igual em dois pratos quentes (duas lasanhas, dois
//    empanados). Não compara com o especial (sobremesa: "lasanha de chocolate").
import { GRUPOS, chaveNome, type ConflitoDia, type Grupo } from "@/lib/cardapio-dia-core";

export type Analise = { destaques: string[] | null; preparo: string | null };
export type Conflito = ConflitoDia;

// Defesa extra: mesmo que a IA mande uma base, ela não conta.
export const BASES = new Set([
  "frango", "carne", "carne bovina", "boi", "porco", "carne suina", "suino", "arroz", "feijao", "batata", "massa", "macarrao",
  "ovo", "queijo", "cebola", "alho", "tomate", "molho de tomate", "creme de leite", "nata", "leite", "farinha", "pao", "oleo",
  "manteiga", "sal", "presunto", "milho verde", "chocolate", "camarao", "polenta",
]);

export const PREPAROS = [
  "lasanha", "empanado", "escondidinho", "strogonoff", "panqueca", "gratinado", "risoto", "torta", "bolinho", "pure",
  "farofa", "moqueca", "parmegiana", "rocambole", "nhoque", "omelete", "souffle",
] as const;

const limpa = (s: string) => chaveNome(s).replace(/\s+/g, " ").trim();

/** Chave do prato no catálogo (a mesma que a tela usa pra estatística). */
export const chavePrato = (grupo: string, nome: string) => `${grupo}|${chaveNome(nome)}`;

/**
 * Conflitos do dia. `analises` vem do catálogo (chavePrato → Analise); prato
 * sem análise (novo, IA ainda não leu) simplesmente não entra na conta.
 */
export function conflitosDoDia(sel: Record<Grupo, string[]>, analises: Map<string, Analise> | Record<string, Analise>): Conflito[] {
  const ler = (k: string) => (analises instanceof Map ? analises.get(k) : analises[k]);
  const porIngrediente = new Map<string, string[]>();
  const porPreparo = new Map<string, string[]>();
  for (const g of GRUPOS) {
    if (g === "especial") continue; // sobremesa não compara com os pratos quentes
    for (const nome of sel[g] ?? []) {
      const a = ler(chavePrato(g, nome));
      if (!a) continue;
      for (const d of new Set((a.destaques ?? []).map(limpa))) {
        if (!d || BASES.has(d)) continue;
        porIngrediente.set(d, [...(porIngrediente.get(d) ?? []), nome]);
      }
      if (a.preparo) {
        const p = limpa(a.preparo);
        if (p) porPreparo.set(p, [...(porPreparo.get(p) ?? []), nome]);
      }
    }
  }
  const out: Conflito[] = [];
  for (const [chave, pratos] of porIngrediente) {
    const unicos = [...new Set(pratos)];
    if (unicos.length >= 2) out.push({ tipo: "ingrediente", chave, pratos: unicos });
  }
  for (const [chave, pratos] of porPreparo) {
    const unicos = [...new Set(pratos)];
    if (unicos.length >= 2) out.push({ tipo: "preparo", chave, pratos: unicos });
  }
  return out;
}

/** "berinjela: Berinjela à pizzaiola e Ratatouille" — uma linha por conflito. */
export function textoConflito(c: Conflito): string {
  const lista = c.pratos.length <= 2 ? c.pratos.join(" e ") : `${c.pratos.slice(0, -1).join(", ")} e ${c.pratos[c.pratos.length - 1]}`;
  const n = c.pratos.length === 2 ? "Dois" : c.pratos.length === 3 ? "Três" : String(c.pratos.length);
  return c.tipo === "ingrediente" ? `${n} pratos com ${c.chave}: ${lista}` : `${n} pratos do tipo ${c.chave}: ${lista}`;
}

/** Pra cada prato do dia, os conflitos em que ele está (pra marcar na lista). */
export function conflitosPorPrato(conflitos: Conflito[]): Map<string, Conflito[]> {
  const m = new Map<string, Conflito[]>();
  for (const c of conflitos) for (const p of c.pratos) m.set(chaveNome(p), [...(m.get(chaveNome(p)) ?? []), c]);
  return m;
}

/** Os conflitos que o publicar devolveu (qualquer formato de resposta das ações). */
export function conflitosDaResposta(r: unknown): Conflito[] {
  const c = (r as { ok?: boolean; conflitos?: unknown } | null)?.conflitos;
  return !(r as { ok?: boolean } | null)?.ok && Array.isArray(c) ? (c as Conflito[]) : [];
}
