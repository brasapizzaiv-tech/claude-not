// Cofre (migration 0269): contas puras, sem banco — servem pro servidor e pra
// tela. Tudo em CENTAVOS pra não errar soma de moeda (0,05 + 0,10…).
// Quantidades: {"200": 10, "5": -3} = entram 10 notas de R$ 2, saem 3 moedas
// de 5 centavos.

export type Quantidades = Record<string, number>;
export type Gaveta = "moedas" | "troco" | "grandes";

export const MOEDAS = [5, 10, 25, 50, 100];
export const NOTAS_TROCO = [200, 500, 1000, 2000];
export const NOTAS_GRANDES = [5000, 10000];
export const DENOMINACOES = [...NOTAS_GRANDES.slice().reverse(), ...NOTAS_TROCO.slice().reverse(), ...MOEDAS.slice().reverse()];

export const GAVETAS: { chave: Gaveta; rotulo: string; centavos: number[] }[] = [
  { chave: "moedas", rotulo: "Moedas", centavos: MOEDAS },
  { chave: "troco", rotulo: "Troco (R$ 2 a R$ 20)", centavos: NOTAS_TROCO },
  { chave: "grandes", rotulo: "Notas grandes (R$ 50 e R$ 100)", centavos: NOTAS_GRANDES },
];

export const gavetaDe = (c: number): Gaveta => (c <= 100 ? "moedas" : c <= 2000 ? "troco" : "grandes");

/** "R$ 100", "R$ 1", "R$ 0,25". */
export function rotuloDen(c: number) {
  if (c >= 100 && c % 100 === 0) return `R$ ${c / 100}`;
  return `R$ 0,${String(c).padStart(2, "0")}`;
}
export const ehMoeda = (c: number) => c <= 100;

/** Só inteiros, sem zeros e só notas/moedas conhecidas. */
export function limpar(q: Quantidades | null | undefined): Quantidades {
  const out: Quantidades = {};
  for (const [k, v] of Object.entries(q ?? {})) {
    const c = Number(k);
    const n = Math.trunc(Number(v));
    if (DENOMINACOES.includes(c) && Number.isFinite(n) && n !== 0) out[String(c)] = n;
  }
  return out;
}

export const negar = (q: Quantidades): Quantidades => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, -v]));

/** Valor em reais (com sinal). */
export function valorDe(q: Quantidades) {
  let cent = 0;
  for (const [k, v] of Object.entries(q)) cent += Number(k) * Number(v);
  return cent / 100;
}

export function valorGaveta(q: Quantidades, g: Gaveta) {
  let cent = 0;
  for (const [k, v] of Object.entries(q)) if (gavetaDe(Number(k)) === g) cent += Number(k) * Number(v);
  return cent / 100;
}

export type Faixa = { minimo: number; maximo: number };

/** Abaixo do mínimo: encomendar até o máximo (ou até o mínimo, sem máximo).
 *  Acima do máximo: depositar a sobra. Faixa zerada = sem controle. */
export function situacao(qtd: number, f: Faixa | undefined): { tipo: "encomendar" | "depositar" | "ok" | "livre"; n: number } {
  if (!f || (f.minimo === 0 && f.maximo === 0)) return { tipo: "livre", n: 0 };
  if (f.minimo > 0 && qtd < f.minimo) return { tipo: "encomendar", n: Math.max(f.maximo, f.minimo) - qtd };
  if (f.maximo > 0 && qtd > f.maximo) return { tipo: "depositar", n: qtd - f.maximo };
  return { tipo: "ok", n: 0 };
}

/** Lista do que encomendar (só o que está abaixo do mínimo). */
export function listaEncomenda(saldo: Quantidades, faixas: Record<string, Faixa>): Quantidades {
  const out: Quantidades = {};
  for (const c of DENOMINACOES) {
    const s = situacao(saldo[String(c)] ?? 0, faixas[String(c)]);
    if (s.tipo === "encomendar" && s.n > 0) out[String(c)] = s.n;
  }
  return out;
}

/** "110 de R$ 2, 90 de R$ 5". */
export function descreverQuantidades(q: Quantidades) {
  return DENOMINACOES.filter((c) => q[String(c)])
    .map((c) => `${Math.abs(q[String(c)])} de ${rotuloDen(c)}`)
    .join(", ");
}

/** Tipos de movimento: rótulo e se o dinheiro entra (+1), sai (-1) ou os dois (troca/contagem). */
export const TIPOS: Record<string, { rotulo: string; sentido: 1 | -1 | 0 }> = {
  contagem: { rotulo: "Conferência do cofre", sentido: 0 },
  entrada_caixa: { rotulo: "Entrada do caixa", sentido: 1 },
  sangria: { rotulo: "Sangria do caixa", sentido: 1 },
  fundo_caixa: { rotulo: "Troco pra abrir o caixa", sentido: -1 },
  troco_motoboy: { rotulo: "Troco pro motoboy", sentido: -1 },
  pagamento: { rotulo: "Pagamento", sentido: -1 },
  deposito: { rotulo: "Depósito no banco", sentido: -1 },
  chegou_troco: { rotulo: "Chegou troco", sentido: 1 },
  troca: { rotulo: "Troca de notas", sentido: 0 },
  outro: { rotulo: "Outro", sentido: 0 },
};
