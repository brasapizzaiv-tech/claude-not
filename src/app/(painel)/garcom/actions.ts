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

  // Roteamento por produto (a "via"): cada impressora imprime só os seus itens.
  const itemIds = validos.map((i) => i.itemId).filter(Boolean);
  const { data: cozinhas } = await supabase
    .from("impressoras")
    .select("id, comanda_produtos")
    .eq("ativo", true)
    .eq("recebe_comandas", true);
  const jobs = ((cozinhas as { id: string; comanda_produtos: string[] | null }[]) ?? [])
    .filter((im) => {
      const prods = im.comanda_produtos;
      if (prods === null) return true; // imprime todos
      return itemIds.some((id) => prods.includes(id)); // tem item dessa via?
    })
    .map((im) => ({ tipo: "comanda", ref_id: lancamentoId, impressora_id: im.id }));
  if (jobs.length > 0) await supabase.from("impressao_fila").insert(jobs);

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
