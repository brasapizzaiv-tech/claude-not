"use server";

import { createClient } from "@/lib/supabase/server";
import { lancarPedidoGarcom } from "../garcom/actions";

type ItemVenda = { itemId: string; nome: string; preco: number; qtd: number };

// Finaliza uma venda de balcão: cria a comanda "Balcão" + itens + manda pra
// cozinha (reaproveita o garçom) e, se veio pagamento, cobra o valor cheio
// (sem serviço de garçom), lança no caixa aberto e fecha a venda.
export async function finalizarVendaPdv(
  itens: ItemVenda[],
  obs: string,
  pagamento: { forma: string } | null,
) {
  const r = await lancarPedidoGarcom("Balcão", itens, obs);
  if (!r.ok || !r.comandaId) return r;

  if (!pagamento) {
    return { ok: true as const, numero: r.numero, comandaId: r.comandaId, pago: false, semCaixa: false };
  }

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("pdv_comanda_itens")
    .select("id, qtd, preco_unit")
    .eq("comanda_id", r.comandaId);

  let total = 0;
  for (const it of rows ?? []) {
    const payable = Math.round(Number(it.qtd) * Number(it.preco_unit) * 100) / 100;
    total += payable;
    await supabase.from("pdv_comanda_itens").update({ valor_pago: payable, pago: true }).eq("id", it.id);
  }
  total = Math.round(total * 100) / 100;

  const { data: cx } = await supabase
    .from("pdv_caixas")
    .select("id")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cx?.id) {
    await supabase.from("pdv_caixa_mov").insert({
      caixa_id: cx.id,
      tipo: "venda",
      descricao: `PDV Balcão #${r.numero}`,
      forma_pagamento: pagamento.forma,
      valor: total,
      comanda_id: r.comandaId,
    });
  }

  await supabase
    .from("pdv_comandas")
    .update({
      status: "fechada",
      fechada_em: new Date().toISOString(),
      forma_pagamento: pagamento.forma,
      servico: 0,
    })
    .eq("id", r.comandaId);

  return { ok: true as const, numero: r.numero, comandaId: r.comandaId, pago: true, semCaixa: !cx?.id, total };
}
