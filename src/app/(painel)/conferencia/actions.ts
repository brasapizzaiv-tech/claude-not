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

  revalidatePath(`/conferencia/${pedidoId}`);
  revalidatePath("/conferencia");
  return { ok: true };
}
