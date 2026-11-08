// Formas de pagamento da NFC-e a partir dos pagamentos de verdade da venda
// (COD-002 da auditoria, 08/11/2026). Antes a nota do caixa ia com a forma da
// comanda, que o caixa grava como "Dividido" → sempre "01" dinheiro, mesmo paga
// no cartão, Pix ou vale. Contas puras, sem banco. Tudo em centavos.

export type PagamentoVenda = {
  /** Código da SEFAZ (tPag): 01 dinheiro, 03 crédito, 04 débito, 11 vale, 17 Pix… */
  codigo: string;
  /** Valor pago nessa forma (com os 10%, se teve: a nota acerta a proporção). */
  valor: number;
  /** Bandeira que o pinpad devolveu ("VISA", "MASTERCARD"…), se veio. */
  bandeira?: string | null;
  /** Autorização do pinpad, se veio. */
  autorizacao?: string | null;
};

export type PagamentoNota = {
  forma_pagamento: string;
  valor_pagamento: string;
  tipo_integracao?: string;
  bandeira_operadora?: string;
  numero_autorizacao?: string;
};

// Códigos de bandeira da SEFAZ (tBand). O que não está aqui vai sem bandeira
// (o campo é opcional); "99 outros" não ajuda em nada.
const BANDEIRAS: [RegExp, string][] = [
  [/\bVISA\b/, "01"],
  [/MASTER/, "02"],
  [/AMEX|AMERICAN/, "03"],
  [/SOROCRED/, "04"],
  [/DINERS/, "05"],
  [/\bELO\b/, "06"],
  [/HIPERCARD/, "07"],
  [/\bAURA\b/, "08"],
  [/CABAL/, "09"],
  [/ALELO/, "10"],
  [/\bHIPER\b/, "17"],
  [/\bJCB\b/, "18"],
  [/POLICARD/, "21"],
  [/SODEXO|PLUXEE/, "23"],
  [/VALECARD/, "24"],
  [/VEROCHEQUE/, "25"],
  [/^VR\b|\bVR BENEF/, "26"],
  [/TICKET/, "27"],
];

export function bandeiraSefaz(texto: string | null | undefined): string | undefined {
  const t = (texto ?? "").toUpperCase().trim();
  if (!t) return undefined;
  for (const [re, cod] of BANDEIRAS) if (re.test(t)) return cod;
  return undefined;
}

// Cartão e Pix levam o grupo do cartão na NFC-e. "2" = não integrado: não exige o
// CNPJ da credenciadora (que o sistema não guarda), e a autorização vai se tiver.
const COM_GRUPO_CARTAO = new Set(["03", "04", "17"]);

/**
 * Junta os pagamentos por código (uma linha por forma) e reparte o total da nota
 * na proporção do que foi pago em cada forma. A soma das linhas é exatamente o
 * total da nota: os 10% do garçom (que não estão na nota) não viram troco, e o
 * centavo do arredondamento vai pra quem ficou mais perto (maior resto).
 * Sem pagamento com valor, devolve lista vazia (quem chama usa a forma antiga).
 */
export function pagamentosDaNota(pagamentos: PagamentoVenda[], total: number): PagamentoNota[] {
  const grupos = new Map<string, { cent: number; bandeiras: Set<string>; autorizacoes: Set<string>; n: number }>();
  for (const p of pagamentos) {
    const cent = Math.round((Number(p.valor) || 0) * 100);
    const g = grupos.get(p.codigo) ?? { cent: 0, bandeiras: new Set<string>(), autorizacoes: new Set<string>(), n: 0 };
    g.cent += cent;
    if (cent > 0) {
      g.n++;
      const b = bandeiraSefaz(p.bandeira);
      if (b) g.bandeiras.add(b);
      if ((p.autorizacao ?? "").trim()) g.autorizacoes.add(String(p.autorizacao).trim().slice(0, 20));
    }
    grupos.set(p.codigo, g);
  }
  // Estorno (venda negativa) abate a forma; forma que zerou ou ficou negativa sai.
  const linhas = [...grupos].filter(([, g]) => g.cent > 0);
  const alvo = Math.max(0, Math.round((Number(total) || 0) * 100));
  const soma = linhas.reduce((s, [, g]) => s + g.cent, 0);
  if (linhas.length === 0 || soma === 0 || alvo === 0) return [];

  const partes = linhas.map(([, g]) => Math.floor((g.cent * alvo) / soma));
  let falta = alvo - partes.reduce((a, b) => a + b, 0);
  const ordem = linhas.map(([, g], i) => [(g.cent * alvo) % soma, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; falta > 0; k = (k + 1) % ordem.length) { partes[ordem[k][1]]++; falta--; }

  return linhas.map(([codigo, g], i) => {
    const linha: PagamentoNota = { forma_pagamento: codigo, valor_pagamento: (partes[i] / 100).toFixed(2) };
    if (COM_GRUPO_CARTAO.has(codigo)) {
      linha.tipo_integracao = "2";
      // Bandeira e autorização só quando é uma só (dois cartões na mesma forma: vai sem).
      if (g.bandeiras.size === 1) linha.bandeira_operadora = [...g.bandeiras][0];
      if (g.n === 1 && g.autorizacoes.size === 1) linha.numero_autorizacao = [...g.autorizacoes][0];
    }
    return linha;
  });
}
