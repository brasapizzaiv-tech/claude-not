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

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

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
  const lancamentoId = crypto.randomUUID();
  const rows = validos.map((i, idx) => ({
    comanda_id: cid,
    item_id: i.itemId,
    descricao: i.nome + (idx === 0 && obs ? `\n📝 ${obs}` : ""),
    qtd: i.qtd,
    preco_unit: i.preco,
    criado_por: uid,
    lancamento_id: lancamentoId,
  }));
  await supabase.from("pdv_comanda_itens").insert(rows);

  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const, comandaId: cid, numero };
}

// Acha uma comanda pelo código lido (QR do cupom = URL com o id, ou o número
// digitado/lido do cartão). Devolve a mesa para abrir o cardápio.
export async function acharComanda(codigo: string) {
  const supabase = await createClient();
  const v = (codigo || "").trim();
  if (!v) return { ok: false as const };
  const uuid = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];

  let com: { id: string; mesa: string | null } | null = null;
  if (uuid) {
    com = (await supabase.from("pdv_comandas").select("id, mesa").eq("id", uuid).maybeSingle()).data;
  } else {
    const num = Number(v.replace(/\D/g, ""));
    if (num > 0) {
      com = (
        await supabase
          .from("pdv_comandas")
          .select("id, mesa")
          .eq("numero", num)
          .eq("status", "aberta")
          .order("aberta_em", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;
    }
  }
  if (!com) return { ok: false as const };
  return { ok: true as const, comandaId: com.id, mesa: com.mesa || "Balcão" };
}

// Move uma comanda aberta para outra mesa.
export async function transferirComanda(comandaId: string, novaMesa: string) {
  const supabase = await createClient();
  const cid = (comandaId || "").trim();
  const mesa = (novaMesa || "").trim();
  if (!cid || !mesa) return { ok: false as const, mensagem: "Escolha a comanda e a mesa." };
  const { error } = await supabase
    .from("pdv_comandas")
    .update({ mesa })
    .eq("id", cid)
    .eq("status", "aberta");
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const };
}
