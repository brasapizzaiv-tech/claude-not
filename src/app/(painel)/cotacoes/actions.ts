"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function criarCotacao(formData: FormData) {
  const supabase = await createClient();

  const descricao =
    (formData.get("descricao") as string)?.trim() ||
    `Cotação ${new Date().toLocaleDateString("pt-BR")}`;
  const contagem_id = (formData.get("contagem_id") as string)?.trim() || null;

  const { data, error } = await supabase
    .from("cotacoes")
    .insert({ descricao, contagem_id })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/cotacoes/${data.id}`);
}

type ItemCotacao = { produto_id: string; qtd: number };

// Gera (e mantém em sincronia) os pedidos dos itens EXCLUSIVOS da cotação —
// produtos com 1 único fornecedor, que não precisam de comparação. Assim já dá
// para enviar o pedido a esses fornecedores sem esperar as respostas dos outros.
// Gera pra TODO fornecedor que tenha item exclusivo — mesmo que ele também
// dispute outros itens na comparação: os itens disputados entram no MESMO
// pedido depois, pelo "Gerar pedidos" (que completa em vez de pular).
export async function gerarPedidosExclusivos(cotacaoId: string) {
  const supabase = await createClient();
  const { data: cot } = await supabase
    .from("cotacoes")
    .select("pedidos_gerados_em")
    .eq("id", cotacaoId)
    .maybeSingle();
  if (cot?.pedidos_gerados_em) return { ok: false as const, travada: true as const };

  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("produto_id, qtd")
    .eq("cotacao_id", cotacaoId)
    .gt("qtd", 0);
  if (!itens || itens.length === 0) return { ok: true as const, gerados: 0 };

  const produtoIds = itens.map((i) => i.produto_id as string);
  const qtdDe = new Map(itens.map((i) => [i.produto_id as string, Number(i.qtd)]));

  const { data: vinc } = await supabase
    .from("fornecedor_produto")
    .select("produto_id, fornecedor_id")
    .in("produto_id", produtoIds);
  const sups = new Map<string, string[]>();
  for (const v of vinc ?? []) {
    const arr = sups.get(v.produto_id as string) ?? [];
    arr.push(v.fornecedor_id as string);
    sups.set(v.produto_id as string, arr);
  }

  // Itens exclusivos (1 fornecedor) agrupados por fornecedor.
  const exclDoForn = new Map<string, { produto_id: string; qtd: number }[]>();
  for (const [pid, fs] of sups) {
    if (fs.length === 1) {
      const arr = exclDoForn.get(fs[0]) ?? [];
      arr.push({ produto_id: pid, qtd: qtdDe.get(pid) ?? 0 });
      exclDoForn.set(fs[0], arr);
    }
  }

  let gerados = 0;
  for (const [forn, exItens] of exclDoForn) {
    const validos = exItens.filter((i) => i.qtd > 0);
    if (validos.length === 0) continue;

    let pedidoId: string | undefined;
    const { data: ped } = await supabase
      .from("pedidos")
      .select("id")
      .eq("cotacao_id", cotacaoId)
      .eq("fornecedor_id", forn)
      .maybeSingle();
    if (ped) pedidoId = ped.id as string;
    else {
      const { data: novo } = await supabase
        .from("pedidos")
        .insert({ cotacao_id: cotacaoId, fornecedor_id: forn })
        .select("id")
        .single();
      pedidoId = novo?.id as string | undefined;
    }
    if (!pedidoId) continue;

    // Sincroniza SÓ os itens exclusivos com as quantidades atuais (o que o
    // fornecedor ganhou na comparação, se já foi adiantado, fica como está).
    await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId).in("produto_id", validos.map((i) => i.produto_id));
    await supabase.from("pedido_itens").insert(
      validos.map((i) => ({
        pedido_id: pedidoId,
        produto_id: i.produto_id,
        qtd: i.qtd,
        preco_unit: null,
      })),
    );
    gerados++;
  }

  revalidatePath(`/cotacoes/${cotacaoId}/pedidos`);
  revalidatePath(`/cotacoes/${cotacaoId}`);
  return { ok: true as const, gerados };
}

export async function salvarCotacaoItens(
  cotacaoId: string,
  itens: ItemCotacao[],
) {
  const supabase = await createClient();

  // Backup do estado ATUAL antes de sobrescrever (para "Desfazer").
  const { data: atuais } = await supabase
    .from("cotacao_itens")
    .select("produto_id, qtd")
    .eq("cotacao_id", cotacaoId);
  if (atuais && atuais.length > 0) {
    await supabase
      .from("cotacao_itens_backup")
      .insert({ cotacao_id: cotacaoId, itens: atuais });
    // Mantém só os 15 backups mais recentes por cotação.
    const { data: velhos } = await supabase
      .from("cotacao_itens_backup")
      .select("id")
      .eq("cotacao_id", cotacaoId)
      .order("criado_em", { ascending: false })
      .range(15, 1000);
    if (velhos && velhos.length > 0) {
      await supabase
        .from("cotacao_itens_backup")
        .delete()
        .in("id", velhos.map((v) => v.id as string));
    }
  }

  const paraGravar = itens
    .filter((i) => i.qtd > 0)
    .map((i) => ({ ...i, cotacao_id: cotacaoId }));

  if (paraGravar.length > 0) {
    await supabase
      .from("cotacao_itens")
      .upsert(paraGravar, { onConflict: "cotacao_id,produto_id" });
  }

  const comValor = new Set(paraGravar.map((i) => i.produto_id));
  const zerados = itens
    .filter((i) => !comValor.has(i.produto_id))
    .map((i) => i.produto_id);
  if (zerados.length > 0) {
    await supabase
      .from("cotacao_itens")
      .delete()
      .eq("cotacao_id", cotacaoId)
      .in("produto_id", zerados);
  }

  revalidatePath(`/cotacoes/${cotacaoId}`);
  return { ok: true, gravados: paraGravar.length };
}

// Desfaz o último salvamento: restaura as quantidades do backup mais recente.
export async function reverterCotacao(cotacaoId: string) {
  const supabase = await createClient();
  const { data: bkp } = await supabase
    .from("cotacao_itens_backup")
    .select("id, itens")
    .eq("cotacao_id", cotacaoId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bkp) return { ok: false as const, vazio: true as const };

  const itens = ((bkp.itens as { produto_id: string; qtd: number }[]) ?? []).filter(
    (i) => Number(i.qtd) > 0,
  );
  await supabase.from("cotacao_itens").delete().eq("cotacao_id", cotacaoId);
  if (itens.length > 0) {
    await supabase.from("cotacao_itens").insert(
      itens.map((i) => ({ cotacao_id: cotacaoId, produto_id: i.produto_id, qtd: i.qtd })),
    );
  }
  // Consome o backup usado (para o próximo "desfazer" ir mais para trás).
  await supabase.from("cotacao_itens_backup").delete().eq("id", bkp.id as string);

  revalidatePath(`/cotacoes/${cotacaoId}`);
  return { ok: true as const, restaurados: itens.length };
}

// Convida um fornecedor para a cotação (cria o link/token se ainda não existe).
export async function convidarFornecedor(
  cotacaoId: string,
  fornecedorId: string,
) {
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("cotacao_fornecedores")
    .select("id")
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();

  if (!existente) {
    await supabase.from("cotacao_fornecedores").insert({
      cotacao_id: cotacaoId,
      fornecedor_id: fornecedorId,
      token: randomUUID().replace(/-/g, ""),
    });
  }
  revalidatePath(`/cotacoes/${cotacaoId}/fornecedores`);
}

// Convida vários fornecedores de uma vez (cria o link de quem ainda não tem).
export async function convidarVarios(cotacaoId: string, fornecedorIds: string[]) {
  const supabase = await createClient();
  if (fornecedorIds.length === 0) return;

  const { data: jaTem } = await supabase
    .from("cotacao_fornecedores")
    .select("fornecedor_id")
    .eq("cotacao_id", cotacaoId)
    .in("fornecedor_id", fornecedorIds);
  const existentes = new Set((jaTem ?? []).map((x) => x.fornecedor_id));

  const novos = fornecedorIds
    .filter((id) => !existentes.has(id))
    .map((fornecedor_id) => ({
      cotacao_id: cotacaoId,
      fornecedor_id,
      token: randomUUID().replace(/-/g, ""),
    }));
  if (novos.length > 0) {
    await supabase.from("cotacao_fornecedores").insert(novos);
  }
  revalidatePath(`/cotacoes/${cotacaoId}/fornecedores`);
}

export async function removerFornecedor(
  cotacaoId: string,
  fornecedorId: string,
) {
  const supabase = await createClient();
  await supabase
    .from("cotacao_precos")
    .delete()
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId);
  await supabase
    .from("cotacao_fornecedores")
    .delete()
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId);
  revalidatePath(`/cotacoes/${cotacaoId}/fornecedores`);
}

type Escolha = {
  fornecedor_id: string;
  produto_id: string;
  qtd: number;
  preco_unit: number | null;
  marca?: string | null;
};

// Gera os pedidos de compra a partir das escolhas (agrupadas por fornecedor).
export async function gerarPedidos(cotacaoId: string, escolhas: Escolha[]) {
  const supabase = await createClient();

  // TRAVA: se esta cotação já gerou pedidos, NÃO regenera (senão apagaria os
  // pedidos e conferências antigos). Para pedir o que faltou, abra nova cotação.
  const { data: cot } = await supabase
    .from("cotacoes")
    .select("pedidos_gerados_em")
    .eq("id", cotacaoId)
    .maybeSingle();
  if (cot?.pedidos_gerados_em) {
    return { ok: false, travada: true };
  }

  const porForn = new Map<string, Escolha[]>();
  for (const e of escolhas) {
    if (!e.fornecedor_id) continue;
    const arr = porForn.get(e.fornecedor_id) ?? [];
    arr.push(e);
    porForn.set(e.fornecedor_id, arr);
  }

  // Fornecedores que já têm pedido nesta cotação (exclusivos gerados antes ou
  // pedido adiantado): COMPLETA o pedido com os itens que ainda não estão nele,
  // em vez de pular o fornecedor — era isso que deixava item de fora.
  const { data: jaTem } = await supabase
    .from("pedidos")
    .select("id, fornecedor_id, pedido_itens(produto_id)")
    .eq("cotacao_id", cotacaoId);
  const pedidoDe = new Map<string, { id: string; produtos: Set<string> }>();
  for (const p of (jaTem as unknown as { id: string; fornecedor_id: string; pedido_itens: { produto_id: string }[] | null }[]) ?? []) {
    pedidoDe.set(p.fornecedor_id, { id: p.id, produtos: new Set((p.pedido_itens ?? []).map((x) => x.produto_id)) });
  }

  for (const [fornId, itens] of porForn) {
    const existente = pedidoDe.get(fornId);
    let pedidoId = existente?.id;
    if (!pedidoId) {
      const { data: ped } = await supabase
        .from("pedidos")
        .insert({ cotacao_id: cotacaoId, fornecedor_id: fornId })
        .select("id")
        .single();
      pedidoId = (ped as { id: string } | null)?.id;
    }
    if (!pedidoId) continue;
    const novos = itens.filter((i) => !existente?.produtos.has(i.produto_id));
    if (novos.length === 0) continue;
    await supabase.from("pedido_itens").insert(
      novos.map((i) => ({
        pedido_id: pedidoId,
        produto_id: i.produto_id,
        qtd: i.qtd,
        preco_unit: i.preco_unit,
        marca: i.marca ?? null,
      })),
    );
  }

  // Trava a cotação: pedidos gerados, não pode regenerar por cima.
  await supabase
    .from("cotacoes")
    .update({ pedidos_gerados_em: new Date().toISOString(), status: "fechada" })
    .eq("id", cotacaoId);

  revalidatePath(`/cotacoes/${cotacaoId}/pedidos`);
  revalidatePath(`/cotacoes/${cotacaoId}/comparar`);
  return { ok: true };
}

// Adianta o pedido de UM fornecedor (sem travar a cotação nem esperar os outros).
export async function adiantarPedidoFornecedor(
  cotacaoId: string,
  fornecedorId: string,
  escolhas: Escolha[],
) {
  const supabase = await createClient();
  const { data: cot } = await supabase
    .from("cotacoes")
    .select("pedidos_gerados_em")
    .eq("id", cotacaoId)
    .maybeSingle();
  if (cot?.pedidos_gerados_em) return { ok: false as const, travada: true as const };

  const itens = escolhas.filter((e) => e.fornecedor_id === fornecedorId && e.qtd > 0);
  if (itens.length === 0) return { ok: false as const, semItens: true as const };

  // Já existe pedido desse fornecedor (itens exclusivos gerados antes)? Completa
  // com o que foi escolhido na comparação e ainda não está nele.
  const { data: existe } = await supabase
    .from("pedidos")
    .select("id, pedido_itens(produto_id)")
    .eq("cotacao_id", cotacaoId)
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();
  const ex = existe as { id: string; pedido_itens: { produto_id: string }[] | null } | null;
  let pedidoId = ex?.id;
  const jaTem = new Set((ex?.pedido_itens ?? []).map((x) => x.produto_id));
  const novos = itens.filter((i) => !jaTem.has(i.produto_id));
  if (pedidoId && novos.length === 0) return { ok: false as const, jaGerado: true as const };
  if (!pedidoId) {
    const { data: ped } = await supabase
      .from("pedidos")
      .insert({ cotacao_id: cotacaoId, fornecedor_id: fornecedorId })
      .select("id")
      .single();
    pedidoId = (ped as { id: string } | null)?.id;
  }
  if (pedidoId) {
    await supabase.from("pedido_itens").insert(
      novos.map((i) => ({
        pedido_id: pedidoId,
        produto_id: i.produto_id,
        qtd: i.qtd,
        preco_unit: i.preco_unit,
        marca: i.marca ?? null,
      })),
    );
  }

  revalidatePath(`/cotacoes/${cotacaoId}/pedidos`);
  revalidatePath(`/cotacoes/${cotacaoId}/comparar`);
  return { ok: true as const };
}

// Cria uma NOVA cotação só com os itens que ainda não foram pedidos na atual.
export async function novaCotacaoDosFaltantes(cotacaoId: string) {
  const supabase = await createClient();

  const [{ data: itens }, { data: peds }] = await Promise.all([
    supabase.from("cotacao_itens").select("produto_id, qtd").eq("cotacao_id", cotacaoId),
    supabase.from("pedidos").select("id").eq("cotacao_id", cotacaoId),
  ]);
  const pedIds = (peds ?? []).map((p) => p.id);
  const jaPedido = new Set<string>();
  if (pedIds.length) {
    const { data: pit } = await supabase
      .from("pedido_itens")
      .select("produto_id")
      .in("pedido_id", pedIds);
    for (const x of pit ?? []) jaPedido.add(x.produto_id);
  }
  const faltantes = (itens ?? []).filter((i) => !jaPedido.has(i.produto_id));
  if (faltantes.length === 0) return { ok: false, erro: "nada" };

  const { data: orig } = await supabase
    .from("cotacoes")
    .select("descricao, contagem_id")
    .eq("id", cotacaoId)
    .maybeSingle();
  const { data: nova } = await supabase
    .from("cotacoes")
    .insert({
      descricao: `${orig?.descricao ?? "Cotação"} — faltantes`,
      contagem_id: orig?.contagem_id ?? null,
    })
    .select("id")
    .single();
  if (!nova) return { ok: false };
  await supabase
    .from("cotacao_itens")
    .insert(faltantes.map((f) => ({ cotacao_id: nova.id, produto_id: f.produto_id, qtd: f.qtd })));
  redirect(`/cotacoes/${nova.id}`);
}

export async function fecharCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").update({ status: "fechada" }).eq("id", id);
  revalidatePath(`/cotacoes/${id}`);
  revalidatePath("/cotacoes");
}

export async function reabrirCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  // Reabrir também solta a trava de "já gerei os pedidos".
  //
  // O carimbo `pedidos_gerados_em` existe pra ninguém gerar duas vezes e
  // duplicar pedido. Mas ele ficava pra sempre: quem reabria a cotação pra
  // refazer (porque ninguém respondeu, por exemplo) esbarrava numa mensagem
  // dizendo que a cotação "já pode estar fechada" — e ela estava aberta.
  //
  // Só solto a trava se NÃO houver pedido nenhum. Com pedido, soltar deixaria
  // gerar por cima e duplicar, que é exatamente o que o carimbo evita.
  const { count } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("cotacao_id", id);

  await supabase
    .from("cotacoes")
    .update({ status: "aberta", ...((count ?? 0) === 0 ? { pedidos_gerados_em: null } : {}) })
    .eq("id", id);
  revalidatePath(`/cotacoes/${id}`);
  revalidatePath("/cotacoes");
}

export async function excluirCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").delete().eq("id", id);
  revalidatePath("/cotacoes");
}
