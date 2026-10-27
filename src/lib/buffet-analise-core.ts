// Buffet livre × quilo (Rafael, 27/10/2026): quanto o livre rende, quanto daria
// se fosse tudo por quilo e quanto daria com o livre mais caro, pelas pesagens reais.
// Puro (sem banco) — testado em scripts/buffet-analise.test.mjs.

export type PratoBuffet = { dia: string; livre: boolean; peso: number; valor: number };

export type DiaBuffet = {
  dia: string;
  dow: number;
  precoKg: number;
  precoLivre: number;
  kg: { pratos: number; peso: number; valor: number };
  // peso = o que pesou + os diretos estimados pela média do livre que pesou no dia
  livre: { pratos: number; pesou: number; diretos: number; pesoPesado: number; peso: number; valor: number };
  soKg: number; // faturamento do buffet se o livre pagasse o quilo
  extra: Record<number, number>; // a mais no faturamento com o livre + R$ delta
};

export const DELTAS = [3, 5, 10];

export const dowDe = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** Segunda-feira da semana do dia (AAAA-MM-DD). */
export function segundaDe(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function mediana(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Livre cobra o menor entre peso × quilo e o preço do livre (o livre é um teto).
const cobra = (peso: number, precoKg: number, teto: number) => Math.min(peso * precoKg, teto);

/**
 * Agrupa os pratos por dia. O preço do quilo e do livre de cada dia saem do que
 * foi cobrado (mediana), com o cadastro como reserva — assim mudança de preço no
 * meio do período não distorce. Livre direto (apertou "Livre" sem pesar) não tem
 * peso: estima pela média do livre que pesou no mesmo dia, ou do período todo.
 */
export function analisarDias(
  pratos: PratoBuffet[],
  precoPadrao: (dow: number) => { kg: number; livre: number } = () => ({ kg: 0, livre: 0 }),
  deltas = DELTAS,
): DiaBuffet[] {
  const porDia = new Map<string, PratoBuffet[]>();
  for (const p of pratos) porDia.set(p.dia, [...(porDia.get(p.dia) ?? []), p]);

  const livresPesados = pratos.filter((p) => p.livre && p.peso > 0);
  const mediaGeral = livresPesados.length ? livresPesados.reduce((s, p) => s + p.peso, 0) / livresPesados.length : 0;

  const out: DiaBuffet[] = [];
  for (const [dia, ps] of [...porDia].sort(([a], [b]) => a.localeCompare(b))) {
    const dow = dowDe(dia);
    const padrao = precoPadrao(dow);
    const kgs = ps.filter((p) => !p.livre);
    const pesados = ps.filter((p) => p.livre && p.peso > 0);
    const diretos = ps.filter((p) => p.livre && !(p.peso > 0));

    const precoKg = Math.round(mediana(kgs.filter((p) => p.peso > 0.05).map((p) => p.valor / p.peso)) * 100) / 100 || padrao.kg;
    const precoLivre = mediana(ps.filter((p) => p.livre && (p.peso <= 0 || p.peso * precoKg >= p.valor + 0.01)).map((p) => p.valor))
      || padrao.livre || mediana(ps.filter((p) => p.livre).map((p) => p.valor));

    const pesoPesado = pesados.reduce((s, p) => s + p.peso, 0);
    const mediaDia = pesados.length ? pesoPesado / pesados.length : mediaGeral;
    const pesoLivre = pesoPesado + diretos.length * mediaDia;
    const kgValor = kgs.reduce((s, p) => s + p.valor, 0);

    // Simulação: o mesmo prato, o livre com outro preço. A diferença sobre o
    // simulado no preço atual vai somada ao que foi cobrado de verdade.
    const simLivre = (teto: number) => pesados.reduce((s, p) => s + cobra(p.peso, precoKg, teto), 0) + diretos.length * teto;
    const base = simLivre(precoLivre);
    const extra: Record<number, number> = {};
    for (const d of deltas) extra[d] = simLivre(precoLivre + d) - base;

    out.push({
      dia, dow, precoKg, precoLivre,
      kg: { pratos: kgs.length, peso: kgs.reduce((s, p) => s + p.peso, 0), valor: kgValor },
      livre: {
        pratos: pesados.length + diretos.length, pesou: pesados.length, diretos: diretos.length,
        pesoPesado, peso: pesoLivre, valor: ps.filter((p) => p.livre).reduce((s, p) => s + p.valor, 0),
      },
      soKg: kgValor + pesoLivre * precoKg,
      extra,
    });
  }
  return out;
}

export type SomaBuffet = {
  dias: number;
  kgPratos: number; kgPeso: number; kgValor: number;
  livrePratos: number; livrePesou: number; livreDiretos: number; livrePeso: number; livreValor: number;
  valor: number; soKg: number;
  extra: Record<number, number>;
  precosLivre: number[]; precosKg: number[];
};

export function somar(dias: DiaBuffet[]): SomaBuffet {
  const s: SomaBuffet = {
    dias: dias.length, kgPratos: 0, kgPeso: 0, kgValor: 0,
    livrePratos: 0, livrePesou: 0, livreDiretos: 0, livrePeso: 0, livreValor: 0,
    valor: 0, soKg: 0, extra: {}, precosLivre: [], precosKg: [],
  };
  for (const d of dias) {
    s.kgPratos += d.kg.pratos; s.kgPeso += d.kg.peso; s.kgValor += d.kg.valor;
    s.livrePratos += d.livre.pratos; s.livrePesou += d.livre.pesou; s.livreDiretos += d.livre.diretos;
    s.livrePeso += d.livre.peso; s.livreValor += d.livre.valor;
    s.soKg += d.soKg;
    for (const [k, v] of Object.entries(d.extra)) s.extra[Number(k)] = (s.extra[Number(k)] ?? 0) + v;
    if (!s.precosLivre.includes(d.precoLivre)) s.precosLivre.push(d.precoLivre);
    if (!s.precosKg.includes(d.precoKg)) s.precosKg.push(d.precoKg);
  }
  s.valor = s.kgValor + s.livreValor;
  return s;
}

/** Quanto a receita do livre pode cair (cliente comendo menos ou indo embora)
 *  antes do "só por quilo" render menos que o sistema de hoje. 0,22 = 22%. */
export function limiteQueda(s: SomaBuffet) {
  const livreNoQuilo = s.soKg - s.kgValor;
  return livreNoQuilo > 0 ? (s.soKg - s.valor) / livreNoQuilo : 0;
}
