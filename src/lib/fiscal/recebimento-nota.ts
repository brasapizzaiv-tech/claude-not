// Nota por RECEBIMENTO (pedido do Rafael em 10/11/2026).
//
// Duas pessoas dividem uma Coca e cada uma quer a nota do que consumiu
// (1 almoço + meia Coca). Antes a NFC-e era por COMANDA: o primeiro pagamento
// saía com a comanda inteira e o segundo achava a nota "já emitida".
//
// Agora cada recebimento do caixa guarda o que ele cobriu (pdv_recebimentos,
// migration 0297) e a nota sai só com isso. Comanda paga de uma vez = um
// recebimento que cobre tudo = a mesma nota de sempre.
//
// Contas puras, sem banco (testes em scripts/recebimento-nota.test.mjs).

/** Um pedaço do que o recebimento pagou. `valor` = preço coberto agora (sem os 10%). */
export type ItemCoberto =
  | { tipo: "buffet"; comanda_id: string; numero: number | null; preco: number; valor: number }
  | { tipo: "item"; comanda_id: string; linha_id: string | null; item_id: string | null; descricao: string; qtd: number; preco_unit: number; valor: number };

export type LinhaNota = {
  tipo: "buffet" | "item";
  /** Só no buffet: de que comanda é (pro peso real na nota, FIS-06). */
  comanda_id?: string;
  item_id: string | null;
  descricao: string;
  /** Quantidade na nota (4 casas): a fração da linha que este recebimento pagou. */
  qtd: number;
  preco_unit: number;
  /** qtd × preço, em centavos redondos (é o que a SEFAZ confere). */
  bruto: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Linhas da NFC-e de um recebimento. A quantidade é a fração paga da linha
 * (meia Coca = 0,5); o valor é quantidade × preço, como a SEFAZ confere.
 * `variasComandas` põe o número da comanda no buffet, como na nota de comandas
 * juntas.
 */
export function linhasDaNota(cobertos: ItemCoberto[], variasComandas: boolean): LinhaNota[] {
  const out: LinhaNota[] = [];
  for (const c of cobertos) {
    if (!(c.valor > 0.004)) continue;
    if (c.tipo === "buffet") {
      const preco = r2(c.preco);
      if (!(preco > 0)) continue;
      const qtd = c.valor >= preco - 0.005 ? 1 : r4(c.valor / preco);
      if (!(qtd > 0)) continue;
      out.push({
        tipo: "buffet",
        comanda_id: c.comanda_id,
        item_id: null,
        descricao: variasComandas && c.numero != null ? `Buffet (comanda ${c.numero})` : "Buffet",
        qtd,
        preco_unit: preco,
        bruto: r2(qtd * preco),
      });
    } else {
      const preco = Number(c.preco_unit) || 0;
      if (!(preco > 0)) continue;
      const cheia = r2(Number(c.qtd) * preco);
      // Pagou a linha toda: a quantidade é a da comanda (sem arredondar o peso).
      const qtd = c.valor >= cheia - 0.005 ? r4(Number(c.qtd)) : r4(c.valor / preco);
      if (!(qtd > 0)) continue;
      out.push({
        tipo: "item",
        item_id: c.item_id,
        descricao: (c.descricao || "Item").split("\n")[0].slice(0, 120),
        qtd,
        preco_unit: preco,
        bruto: r2(qtd * preco),
      });
    }
  }
  return out;
}

/** Unidade da linha: KG no buffet e no item vendido por peso; senão a do perfil (UN). */
export function unidadeDaLinha(l: LinhaNota, porKg: boolean, unidadePerfil: string | null | undefined) {
  if (l.tipo === "buffet" || porKg) return "KG";
  return unidadePerfil || "UN";
}

/**
 * FIS-06: como o buffet sai na nota. Por quilo: o PESO real em KG (a fração
 * paga do peso) e o preço do quilo que fecha o valor — antes saía "1 KG" com o
 * total. Livre (ou sem peso): 1 UN com o preço do livre.
 * `fracao` = quanto da linha este recebimento pagou (1 = inteira).
 * O valor unitário vai com 4 casas pra quantidade × preço bater com o valor.
 */
export function buffetNaNota(fracao: number, bruto: number, peso: number, livre: boolean) {
  const kg = r4(peso * fracao);
  if (livre || !(peso > 0) || !(kg > 0)) {
    return { unidade: "UN", qtd: r4(fracao), preco_unit: r4(fracao > 0 ? bruto / fracao : bruto), bruto: r2(bruto) };
  }
  return { unidade: "KG", qtd: kg, preco_unit: r4(bruto / kg), bruto: r2(bruto) };
}
