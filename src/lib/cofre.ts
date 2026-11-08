// Cofre (migration 0269): contas puras, sem banco — servem pro servidor e pra
// tela. Tudo em CENTAVOS pra não errar soma de moeda (0,05 + 0,10…).
// Quantidades: {"200": 10, "5": -3} = entram 10 notas de R$ 2, saem 3 moedas
// de 5 centavos.

export type Quantidades = Record<string, number>;
export type Gaveta = "moedas" | "troco" | "grandes";

export type Pendente = {
  origem: { tipo: "caixa" | "sangria" | "abertura"; id: string; esperado: number };
  tipo: "entrada_caixa" | "sangria" | "fundo_caixa";
  quando: string;
  rotulo: string;
  valor: number;
  sai: boolean;
  /** Notas já contadas no fechamento do caixa: guarda sem contar de novo. */
  contagem?: Quantidades | null;
};

export type DadosCofre = {
  iniciado: boolean;
  saldo: Quantidades;
  faixas: Record<string, { minimo: number; maximo: number }>;
  pendentes: Pendente[];
  pedidos: { id: string; quantidades: Quantidades; valor: number; obs: string | null; criado_por_nome: string | null; quando: string }[];
  movimentos: { id: string; tipo: string; quantidades: Quantidades; valor: number; esperado: number | null; descricao: string | null; criado_por_nome: string | null; quando: string }[];
  categorias: { id: string; nome: string }[];
};

export type MovimentoNovo = {
  tipo: string;
  quantidades: Quantidades;
  descricao?: string;
  origem?: { tipo: "caixa" | "sangria" | "abertura"; id: string; esperado?: number | null } | null;
  pedidoId?: string | null;
};

type Resultado = { ok: true } | { ok: false; mensagem: string };

/** O que a tela do Cofre pede ao servidor. O painel e o app entregam as suas. */
export type AcoesCofre = {
  registrarMovimento: (d: MovimentoNovo) => Promise<Resultado>;
  pagarConta: (d: { quantidades: Quantidades; descricao: string; categoriaId?: string | null; lancamentoId?: string | null }) => Promise<Resultado>;
  buscarContasAbertas: (termo: string) => Promise<{ id: string; descricao: string; valor: number; vencimento: string | null }[]>;
  conferirCofre: (d: { contado: Quantidades; motivo?: string }) => Promise<Resultado>;
  salvarFaixas: (faixas: { centavos: number; minimo: number; maximo: number }[]) => Promise<Resultado>;
  marcarEncomenda: (d: { quantidades: Quantidades; obs?: string }) => Promise<Resultado>;
  cancelarEncomenda: (id: string) => Promise<Resultado>;
  desfazerMovimento: (id: string) => Promise<Resultado>;
};

export const MOEDAS = [5, 10, 25, 50, 100];
export const NOTAS_TROCO = [200, 500, 1000, 2000];
export const NOTAS_GRANDES = [5000, 10000, 20000];
export const DENOMINACOES = [...NOTAS_GRANDES.slice().reverse(), ...NOTAS_TROCO.slice().reverse(), ...MOEDAS.slice().reverse()];

export const GAVETAS: { chave: Gaveta; rotulo: string; centavos: number[] }[] = [
  { chave: "moedas", rotulo: "Moedas", centavos: MOEDAS },
  { chave: "troco", rotulo: "Troco (R$ 2 a R$ 20)", centavos: NOTAS_TROCO },
  { chave: "grandes", rotulo: "Notas grandes (R$ 50 a R$ 200)", centavos: NOTAS_GRANDES },
];

export const gavetaDe = (c: number): Gaveta => (c <= 100 ? "moedas" : c <= 2000 ? "troco" : "grandes");

/** "R$ 100", "R$ 1", "R$ 0,25". */
export function rotuloDen(c: number) {
  if (c >= 100 && c % 100 === 0) return `R$ ${c / 100}`;
  return `R$ 0,${String(c).padStart(2, "0")}`;
}
export const ehMoeda = (c: number) => c <= 100;
export const moedaOuNota = (c: number) => (ehMoeda(c) ? "moedas" : "notas");

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

/** Contagem digitada na tela: só quantidades positivas de notas conhecidas. */
export function contagemValida(q: Quantidades | null | undefined): Quantidades | null {
  const out = limpar(q);
  return Object.values(out).some((v) => v < 0) ? null : out;
}

/** Valor digitado na linha de uma nota ("600", "1.200,50", "0.50") → quantas notas
 *  são. null quando não fecha em notas inteiras ou não é um número. */
export function qtdDoValor(centavos: number, texto: string): number | null {
  const t = texto.trim();
  if (!t) return 0;
  const decimalComPonto = !t.includes(",") && /\.\d{1,2}$/.test(t);
  const n = Number(decimalComPonto ? t : t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  const cent = Math.round(n * 100);
  return cent % centavos === 0 ? cent / centavos : null;
}

/** Contagem por nota guardada no fechamento do caixa. Só vale se ainda bater com o
 *  valor do caixa; senão o cofre pede a contagem como antes. */
export function contagemDoCaixa(resumo: { notas?: Quantidades | null } | null | undefined, valor: number): Quantidades | null {
  const notas = contagemValida(resumo?.notas);
  if (!notas || Object.keys(notas).length === 0) return null;
  return Math.abs(valorDe(notas) - valor) < 0.005 ? notas : null;
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
