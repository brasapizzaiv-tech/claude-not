"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolverLinhas, enfileirarCozinha, type LinhaPedido } from "@/lib/delivery-core";

// Lança um pedido com PIZZA/COMBO/itens (Fase C): as linhas chegam como ids e
// os preços/descrições são resolvidos no servidor (mesmo motor do delivery).
export async function lancarPedidoGarcomLinhas(
  mesa: string,
  itens: LinhaPedido[],
  observacao?: string,
  comandaId?: string,
  // Chave de idempotência gerada no celular: se a resposta se perder (Wi-Fi do
  // salão) e o garçom tentar de novo, o mesmo pedido NÃO é lançado duas vezes.
  lancamentoIdCliente?: string,
) {
  const supabase = await createClient();
  if (!mesa || !Array.isArray(itens) || itens.length === 0) return { ok: false as const, mensagem: "Carrinho vazio." };

  const idCli = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lancamentoIdCliente || "") ? lancamentoIdCliente! : null;
  if (idCli) {
    const { data: ja } = await supabase.from("pdv_comanda_itens").select("comanda_id").eq("lancamento_id", idCli).limit(1).maybeSingle();
    if (ja?.comanda_id) {
      const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", ja.comanda_id as string).single();
      return { ok: true as const, comandaId: ja.comanda_id as string, numero: com?.numero as number | undefined, jaLancado: true as const };
    }
  }

  const linhas = await resolverLinhas(supabase, itens);
  if (linhas.length === 0) return { ok: false as const, mensagem: "Não consegui montar os itens." };

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
    const { data: com } = await supabase.from("pdv_comandas").select("numero, status").eq("id", cid).maybeSingle();
    if (!com) return { ok: false as const, mensagem: "Comanda não encontrada." };
    if (com.status !== "aberta") return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa. Abra uma nova." };
    numero = com.numero as number | undefined;
  }
  if (!cid) return { ok: false as const, mensagem: "Não foi possível criar a comanda." };

  const obs = (observacao || "").trim();
  const lancamentoId = idCli ?? crypto.randomUUID();
  const rows = linhas.map((l, idx) => ({
    comanda_id: cid,
    item_id: l.itemId,
    descricao: l.descricao + (idx === 0 && obs ? `\n📝 ${obs}` : ""),
    qtd: l.qtd,
    preco_unit: l.preco,
    criado_por: uid,
    lancamento_id: lancamentoId,
  }));
  const { error: errIns } = await supabase.from("pdv_comanda_itens").insert(rows);
  if (errIns) return { ok: false as const, mensagem: "Não consegui gravar o pedido. Tente de novo." };

  const itemIds = linhas.map((l) => l.itemId).filter(Boolean) as string[];
  await enfileirarCozinha(supabase, lancamentoId, itemIds);

  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const, comandaId: cid, numero };
}

// Lança um pedido do garçom numa comanda da mesa (cria a comanda se não vier
// uma). Adiciona todos os itens do carrinho de uma vez. Impressão na cozinha
// fica para outra etapa.
// Itens simples (sem pizza/combo). O preço que vem do navegador é IGNORADO:
// é resolvido no servidor pelo mesmo motor (com promoção), como nos outros fluxos.
export async function lancarPedidoGarcom(
  mesa: string,
  itens: { itemId: string; nome: string; preco: number; qtd: number }[],
  observacao?: string,
  comandaId?: string,
) {
  const linhas: LinhaPedido[] = itens
    .filter((i) => i.qtd > 0 && i.itemId)
    .map((i) => ({ kind: "item" as const, itemId: i.itemId, qtd: i.qtd }));
  if (!mesa || linhas.length === 0) return { ok: false as const, mensagem: "Carrinho vazio." };
  return lancarPedidoGarcomLinhas(mesa, linhas, observacao, comandaId);
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
    // 1) pelo código do cartão físico (comanda aberta)
    com = (
      await supabase
        .from("pdv_comandas")
        .select("id, mesa")
        .eq("cartao", v)
        .eq("status", "aberta")
        .order("aberta_em", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;
    // 2) pelo número interno da comanda
    if (!com) {
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
  }
  if (!com) return { ok: false as const };
  return { ok: true as const, comandaId: com.id, mesa: com.mesa || "Balcão" };
}

// Abre uma nova comanda numa mesa. Se veio de um cartão lido, guarda o código
// para achar da próxima vez. Não guarda QR/URL (id de comanda) como cartão.
export async function abrirComanda(mesa: string, cartao?: string) {
  const supabase = await createClient();
  const m = (mesa || "").trim();
  if (!m) return { ok: false as const, mensagem: "Escolha a mesa." };
  const raw = (cartao || "").trim();
  const ehUrlOuUuid = /https?:\/\//i.test(raw) || /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw);
  const card = raw && !ehUrlOuUuid ? raw : null;
  const { data: com, error } = await supabase
    .from("pdv_comandas")
    .insert({ mesa: m, peso: 0, tara: 0, valor_buffet: 0, livre: false, cartao: card })
    .select("id, numero")
    .single();
  if (error || !com) return { ok: false as const, mensagem: error?.message || "Não foi possível abrir a comanda." };
  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const, comandaId: com.id as string, mesa: m, numero: com.numero as number };
}

// Move uma comanda aberta para outra mesa.
export async function transferirComanda(comandaId: string, novaMesa: string) {
  const supabase = await createClient();
  const cid = (comandaId || "").trim();
  const mesa = (novaMesa || "").trim();
  if (!cid || !mesa) return { ok: false as const, mensagem: "Escolha a comanda e a mesa." };
  const { data: mov, error } = await supabase
    .from("pdv_comandas")
    .update({ mesa })
    .eq("id", cid)
    .eq("status", "aberta")
    .select("id");
  if (error) return { ok: false as const, mensagem: error.message };
  if (!mov || mov.length === 0) return { ok: false as const, mensagem: "Essa comanda já foi fechada — não dá mais pra mover." };
  revalidatePath("/garcom");
  revalidatePath("/salao");
  return { ok: true as const };
}
