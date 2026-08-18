"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ItemConf = {
  id: string;
  qtd_recebida: number | null;
  preco_recebido: number | null;
  obs: string | null;
};

// Cria um pedido manual (compra direta, sem cotação) já pronto para conferir.
export async function criarPedidoManual(
  fornecedorId: string,
  data: string,
  itens: { produto_id: string; qtd: number; preco_unit: number | null }[],
) {
  const supabase = await createClient();
  const { data: ped } = await supabase
    .from("pedidos")
    .insert({
      cotacao_id: null,
      fornecedor_id: fornecedorId || null,
      data: data || new Date().toISOString().slice(0, 10),
      status: "recebido",
    })
    .select("id")
    .single();
  if (!ped) return;
  const validos = itens.filter((i) => i.produto_id && i.qtd > 0);
  if (validos.length > 0) {
    await supabase.from("pedido_itens").insert(
      validos.map((i) => ({
        pedido_id: ped.id,
        produto_id: i.produto_id,
        qtd: i.qtd,
        preco_unit: i.preco_unit,
      })),
    );
  }
  revalidatePath("/conferencia");
  redirect(`/conferencia/${ped.id}`);
}

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

  // Ao confirmar a conferência, o pedido vira uma despesa de CMV no financeiro,
  // e o preço recebido atualiza a referência do produto (para próximas cotações).
  if (finalizar) {
    await lancarPedidoNoFinanceiro(supabase, pedidoId);
    const { data: pis } = await supabase
      .from("pedido_itens")
      .select("produto_id, preco_recebido, preco_unit")
      .eq("pedido_id", pedidoId);
    for (const pi of pis ?? []) {
      const preco = pi.preco_recebido ?? pi.preco_unit;
      if (preco != null && pi.produto_id) {
        await supabase
          .from("produtos")
          .update({ preco_referencia: preco })
          .eq("id", pi.produto_id);
      }
    }
    revalidatePath("/produtos");
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
    .select(
      "data, fornecedor_id, fornecedores(nome), pedido_itens(qtd, preco_unit, qtd_recebida, preco_recebido, produtos(categorias(dre_categoria_id)))",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (!ped) return;

  type PI = {
    qtd: number;
    preco_unit: number | null;
    qtd_recebida: number | null;
    preco_recebido: number | null;
    produtos: { categorias: { dre_categoria_id: string | null } | null } | null;
  };
  const p = ped as unknown as {
    data: string;
    fornecedor_id: string | null;
    fornecedores: { nome?: string } | null;
    pedido_itens: PI[];
  };

  // Conta padrão (fallback) para itens sem mapeamento.
  const { data: fallback } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "cmv")
    .eq("nome", "Compras (Pedidos)")
    .maybeSingle();
  const fallbackId = fallback?.id ?? null;

  // Agrupa o valor por conta do DRE (via categoria do produto).
  const porConta = new Map<string | null, number>();
  for (const i of p.pedido_itens ?? []) {
    const qtd = i.qtd_recebida ?? i.qtd;
    const preco = i.preco_recebido ?? i.preco_unit ?? 0;
    const contaId = i.produtos?.categorias?.dre_categoria_id ?? fallbackId;
    porConta.set(contaId, (porConta.get(contaId) ?? 0) + qtd * preco);
  }

  // Refaz (evita duplicar ao reconfirmar).
  await supabase.from("lancamentos").delete().eq("pedido_id", pedidoId);

  const novos = [...porConta.entries()]
    .filter(([, valor]) => valor > 0)
    .map(([contaId, valor]) => ({
      data: p.data,
      descricao: `Compra conferida — ${p.fornecedores?.nome ?? "fornecedor"}`,
      categoria_id: contaId,
      valor,
      fornecedor_id: p.fornecedor_id,
      pedido_id: pedidoId,
      origem: "pedido" as const,
      // Vira conta a pagar (ainda não paga), com vencimento na data do pedido.
      pago: false,
      vencimento: p.data,
    }));

  if (novos.length > 0) {
    await supabase.from("lancamentos").insert(novos);
  }
}
