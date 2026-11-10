// Pagamento de comanda do salão em partes, com os 10% escolhidos em cada
// pagamento (migration 0238). Usado pelo caixa (salao/actions.ts > pagarSelecao).
import type { createClient } from "@/lib/supabase/server";
import type { ItemCoberto } from "@/lib/fiscal/recebimento-nota";

type Db = Awaited<ReturnType<typeof createClient>>;

// Serviço que de fato foi cobrado: o dinheiro que entrou (valor_pago) menos
// a parte do preço que ele cobriu (base_pago, migration 0238). No caixa cada
// pagamento escolhe cobrar ou não os 10% (numa conta dividida um paga e o
// outro não). É isso que vai pros 10% da equipe.
export async function servicoCobrado(
  supabase: Db,
  comandaId: string,
) {
  const [{ data: com }, { data: itens }] = await Promise.all([
    supabase.from("pdv_comandas").select("valor_buffet, buffet_pago, buffet_base_pago, buffet_valor_pago").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("qtd, preco_unit, pago, base_pago, valor_pago").eq("comanda_id", comandaId),
  ]);
  // Linha paga conta o preço todo (inclusive as pagas antes de existir base_pago).
  const coberto =
    (com?.buffet_pago ? Number(com?.valor_buffet ?? 0) : Number(com?.buffet_base_pago ?? 0)) +
    (itens ?? []).reduce((s, i) => s + (i.pago ? Number(i.qtd) * Number(i.preco_unit) : Number(i.base_pago ?? 0)), 0);
  const pago =
    Number(com?.buffet_valor_pago ?? 0) + (itens ?? []).reduce((s, i) => s + Number(i.valor_pago ?? 0), 0);
  return Math.max(0, Math.round((pago - coberto) * 100) / 100);
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// O que falta do PREÇO de cada linha não paga de uma comanda (buffet + itens).
export async function faltasDaComanda(supabase: Db, comandaId: string) {
  const [{ data: com }, { data: itens }] = await Promise.all([
    supabase.from("pdv_comandas").select("numero, valor_buffet, buffet_pago, buffet_base_pago, buffet_valor_pago").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("id, qtd, preco_unit, pago, base_pago, valor_pago, descricao, item_id").eq("comanda_id", comandaId).eq("pago", false).order("criado_em"),
  ]);
  // numero/descricao/item_id/qtd/preco_unit: o que a nota por recebimento precisa.
  type L = { tipo: "buffet" | "item"; id: string; preco: number; base: number; dinheiro: number; falta: number; numero?: number | null; descricao?: string; item_id?: string | null; qtd?: number; preco_unit?: number };
  const out: L[] = [];
  if (com && !com.buffet_pago && Number(com.valor_buffet ?? 0) > 0) {
    const preco = r2(Number(com.valor_buffet));
    const base = Number(com.buffet_base_pago ?? 0);
    out.push({ tipo: "buffet", id: comandaId, preco, base, dinheiro: Number(com.buffet_valor_pago ?? 0), falta: Math.max(0, r4(preco - base)), numero: (com as { numero?: number | null }).numero ?? null });
  }
  for (const i of (itens as { id: string; qtd: number; preco_unit: number; base_pago: number | null; valor_pago: number | null; descricao: string | null; item_id: string | null }[]) ?? []) {
    const preco = r2(Number(i.qtd) * Number(i.preco_unit));
    const base = Number(i.base_pago ?? 0);
    out.push({ tipo: "item", id: i.id, preco, base, dinheiro: Number(i.valor_pago ?? 0), falta: Math.max(0, r4(preco - base)), descricao: i.descricao ?? "Item", item_id: i.item_id, qtd: Number(i.qtd), preco_unit: Number(i.preco_unit) });
  }
  return out.filter((l) => l.falta > 0.004);
}

// "Pagar parte": este dinheiro cobre uma fração de TODAS as linhas que faltam
// (proporcional). Com serviço, o preço coberto é o dinheiro ÷ 1,10. A última
// parte (cobre tudo o que falta) quita as linhas e a comanda fecha.
// Devolve o pedaço do PREÇO coberto em cada linha (vai pra nota do recebimento).
export async function aplicarParte(
  supabase: Db,
  comandaId: string,
  dinheiro: number,
  fator: number,
): Promise<ItemCoberto[]> {
  const linhas = await faltasDaComanda(supabase, comandaId);
  const totalFalta = linhas.reduce((a, l) => a + l.falta, 0);
  const cobertos: ItemCoberto[] = [];
  if (linhas.length === 0 || totalFalta <= 0) return cobertos;
  const base = Math.min(dinheiro / fator, totalFalta);
  const quitaTudo = base >= totalFalta - 0.01;
  let dinheiroDado = 0;
  for (const [k, l] of linhas.entries()) {
    const ultima = k === linhas.length - 1;
    const cobre = quitaTudo ? l.falta : r4(l.falta * (base / totalFalta));
    const dinheiroLinha = ultima ? r2(dinheiro - dinheiroDado) : r2(dinheiro * (cobre / base));
    dinheiroDado = r2(dinheiroDado + dinheiroLinha);
    const novaBase = quitaTudo ? l.preco : r4(l.base + cobre);
    const quitou = novaBase >= l.preco - 0.005;
    const novoDinheiro = r2(l.dinheiro + dinheiroLinha);
    cobertos.push(l.tipo === "buffet"
      ? { tipo: "buffet", comanda_id: comandaId, numero: l.numero ?? null, preco: l.preco, valor: r2(cobre) }
      : { tipo: "item", comanda_id: comandaId, linha_id: l.id, item_id: l.item_id ?? null, descricao: l.descricao ?? "Item", qtd: l.qtd ?? 0, preco_unit: l.preco_unit ?? 0, valor: r2(cobre) });
    if (l.tipo === "buffet") {
      await supabase.from("pdv_comandas")
        .update({ buffet_base_pago: quitou ? l.preco : novaBase, buffet_valor_pago: novoDinheiro, buffet_pago: quitou })
        .eq("id", comandaId);
    } else {
      await supabase.from("pdv_comanda_itens")
        .update({ base_pago: quitou ? l.preco : novaBase, valor_pago: novoDinheiro, pago: quitou })
        .eq("id", l.id);
    }
  }
  return cobertos;
}
