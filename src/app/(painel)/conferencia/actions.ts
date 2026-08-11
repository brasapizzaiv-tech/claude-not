"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ItemConf = {
  id: string;
  qtd_recebida: number | null;
  preco_recebido: number | null;
  obs: string | null;
};

// Salva a conferência de um pedido. finalizar=true marca como conferido.
export async function salvarConferencia(
  pedidoId: string,
  itens: ItemConf[],
  observacoes: string,
  finalizar: boolean,
) {
  const supabase = await createClient();

  for (const i of itens) {
    await supabase
      .from("pedido_itens")
      .update({
        qtd_recebida: i.qtd_recebida,
        preco_recebido: i.preco_recebido,
        obs: i.obs,
      })
      .eq("id", i.id);
  }

  await supabase
    .from("pedidos")
    .update({
      observacoes: observacoes || null,
      status: finalizar ? "conferido" : "recebido",
      conferido_em: finalizar ? new Date().toISOString() : null,
    })
    .eq("id", pedidoId);

  // Ao confirmar a conferência, o pedido vira uma despesa de CMV no financeiro.
  if (finalizar) {
    await lancarPedidoNoFinanceiro(supabase, pedidoId);
  }

  revalidatePath(`/conferencia/${pedidoId}`);
  revalidatePath("/conferencia");
  revalidatePath("/financeiro");
  return { ok: true };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Cria (ou refaz) o lançamento de CMV correspondente a um pedido conferido.
async function lancarPedidoNoFinanceiro(
  supabase: SupabaseClient,
  pedidoId: string,
) {
  const { data: ped } = await supabase
    .from("pedidos")
    .select("data, fornecedor_id, fornecedores(nome), pedido_itens(qtd, preco_unit, qtd_recebida, preco_recebido)")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!ped) return;

  type PI = {
    qtd: number;
    preco_unit: number | null;
    qtd_recebida: number | null;
    preco_recebido: number | null;
  };
  const p = ped as unknown as {
    data: string;
    fornecedor_id: string | null;
    fornecedores: { nome?: string } | null;
    pedido_itens: PI[];
  };

  const total = (p.pedido_itens ?? []).reduce((s, i) => {
    const qtd = i.qtd_recebida ?? i.qtd;
    const preco = i.preco_recebido ?? i.preco_unit ?? 0;
    return s + qtd * preco;
  }, 0);

  // Categoria padrão para compras de fornecedores.
  const { data: cat } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "cmv")
    .eq("nome", "Compras (Pedidos)")
    .maybeSingle();

  // Refaz (evita duplicar ao reconfirmar).
  await supabase.from("lancamentos").delete().eq("pedido_id", pedidoId);

  if (total > 0) {
    await supabase.from("lancamentos").insert({
      data: p.data,
      descricao: `Compra conferida — ${p.fornecedores?.nome ?? "fornecedor"}`,
      categoria_id: cat?.id ?? null,
      valor: total,
      fornecedor_id: p.fornecedor_id,
      pedido_id: pedidoId,
      origem: "pedido",
    });
  }
}
