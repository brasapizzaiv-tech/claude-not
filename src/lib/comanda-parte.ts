// Pagamento de comanda do salão em partes, com os 10% escolhidos em cada
// pagamento (migration 0238). Usado pelo caixa (salao/actions.ts > pagarSelecao).
import type { createClient } from "@/lib/supabase/server";

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
    supabase.from("pdv_comandas").select("valor_buffet, buffet_pago, buffet_base_pago, buffet_valor_pago").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("id, qtd, preco_unit, pago, base_pago, valor_pago").eq("comanda_id", comandaId).eq("pago", false).order("criado_em"),
  ]);
  type L = { tipo: "buffet" | "item"; id: string; preco: number; base: number; dinheiro: number; falta: number };
  const out: L[] = [];
  if (com && !com.buffet_pago && Number(com.valor_buffet ?? 0) > 0) {
    const preco = r2(Number(com.valor_buffet));
    const base = Number(com.buffet_base_pago ?? 0);
    out.push({ tipo: "buffet", id: comandaId, preco, base, dinheiro: Number(com.buffet_valor_pago ?? 0), falta: Math.max(0, r4(preco - base)) });
  }
  for (const i of (itens as { id: string; qtd: number; preco_unit: number; base_pago: number | null; valor_pago: number | null }[]) ?? []) {
    const preco = r2(Number(i.qtd) * Number(i.preco_unit));
    const base = Number(i.base_pago ?? 0);
    out.push({ tipo: "item", id: i.id, preco, base, dinheiro: Number(i.valor_pago ?? 0), falta: Math.max(0, r4(preco - base)) });
  }
  return out.filter((l) => l.falta > 0.004);
}

// "Pagar parte": este dinheiro cobre uma fração de TODAS as linhas que faltam
// (proporcional). Com serviço, o preço coberto é o dinheiro ÷ 1,10. A última
// parte (cobre tudo o que falta) quita as linhas e a comanda fecha.
export async function aplicarParte(
  supabase: Db,
  comandaId: string,
  dinheiro: number,
  fator: number,
) {
  const linhas = await faltasDaComanda(supabase, comandaId);
  const totalFalta = linhas.reduce((a, l) => a + l.falta, 0);
  if (linhas.length === 0 || totalFalta <= 0) return 0;
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
  return linhas.length;
}
