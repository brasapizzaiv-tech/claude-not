"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Lança um pedido do garçom numa comanda da mesa (cria a comanda se não vier
// uma). Adiciona todos os itens do carrinho de uma vez. Impressão na cozinha
// fica para outra etapa.
export async function lancarPedidoGarcom(
  mesa: string,
  itens: { itemId: string; nome: string; preco: number; qtd: number }[],
  observacao?: string,
  comandaId?: string,
) {
  const supabase = await createClient();
  const validos = itens.filter((i) => i.qtd > 0);
  if (!mesa || validos.length === 0) return { ok: false as const, mensagem: "Carrinho vazio." };

  let cid = comandaId;
  let numero: number | undefined;
  if (!cid) {
    const { data: com } = await supabase
      .from("pdv_comandas")
      .insert({ mesa, peso: 0, tara: 0, valor_buffet: 0, livre: false })
      .select("id, numero")
      .single();
    cid = com?.id as string | undefined;
    numero = com?.numero as number | undefined;
  } else {
    const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", cid).single();
    numero = com?.numero as number | undefined;
  }
  if (!cid) return { ok: false as const, mensagem: "Não foi possível criar a comanda." };

  const obs = (observacao || "").trim();
  const rows = validos.map((i, idx) => ({
    comanda_id: cid,
    item_id: i.itemId,
    descricao: i.nome + (idx === 0 && obs ? `\n📝 ${obs}` : ""),
    qtd: i.qtd,
    preco_unit: i.preco,
  }));
  await supabase.from("pdv_comanda_itens").insert(rows);

  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const, comandaId: cid, numero };
}
