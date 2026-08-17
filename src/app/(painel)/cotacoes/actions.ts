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

export async function salvarCotacaoItens(
  cotacaoId: string,
  itens: ItemCotacao[],
) {
  const supabase = await createClient();

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
};

// Gera os pedidos de compra a partir das escolhas (agrupadas por fornecedor).
export async function gerarPedidos(cotacaoId: string, escolhas: Escolha[]) {
  const supabase = await createClient();

  // Regenera: remove pedidos anteriores desta cotação.
  await supabase.from("pedidos").delete().eq("cotacao_id", cotacaoId);

  const porForn = new Map<string, Escolha[]>();
  for (const e of escolhas) {
    if (!e.fornecedor_id) continue;
    const arr = porForn.get(e.fornecedor_id) ?? [];
    arr.push(e);
    porForn.set(e.fornecedor_id, arr);
  }

  for (const [fornId, itens] of porForn) {
    const { data: ped } = await supabase
      .from("pedidos")
      .insert({ cotacao_id: cotacaoId, fornecedor_id: fornId })
      .select("id")
      .single();
    if (ped) {
      await supabase.from("pedido_itens").insert(
        itens.map((i) => ({
          pedido_id: ped.id,
          produto_id: i.produto_id,
          qtd: i.qtd,
          preco_unit: i.preco_unit,
        })),
      );
    }
  }

  revalidatePath(`/cotacoes/${cotacaoId}/pedidos`);
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
  await supabase.from("cotacoes").update({ status: "aberta" }).eq("id", id);
  revalidatePath(`/cotacoes/${id}`);
  revalidatePath("/cotacoes");
}

export async function excluirCotacao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("cotacoes").delete().eq("id", id);
  revalidatePath("/cotacoes");
}
