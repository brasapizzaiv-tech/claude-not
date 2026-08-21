"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarProduto(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;

  const unidade = ((formData.get("unidade") as string) || "un").trim();
  const estoqueMinimoRaw = (formData.get("estoque_minimo") as string) || "0";
  const estoque_minimo = Number(estoqueMinimoRaw.replace(",", ".")) || 0;
  const estoqueIdealRaw = (formData.get("estoque_ideal") as string) || "0";
  const estoque_ideal = Number(estoqueIdealRaw.replace(",", ".")) || 0;
  const observacoes =
    (formData.get("observacoes") as string)?.trim() || null;
  const categoria_id =
    (formData.get("categoria_id") as string)?.trim() || null;
  const dias = (campo: string) => {
    const v = (formData.get(campo) as string)?.trim();
    return v ? Number(v) || null : null;
  };

  const tem_st = formData.get("tem_st") === "on";
  const stPctRaw = (formData.get("st_pct_padrao") as string)?.replace(",", ".").trim();
  const st_pct_padrao = tem_st && stPctRaw ? Number(stPctRaw) || null : null;

  const payload = {
    nome,
    unidade,
    estoque_minimo,
    estoque_ideal,
    validade_congelado: dias("validade_congelado"),
    validade_resfriado: dias("validade_resfriado"),
    validade_ambiente: dias("validade_ambiente"),
    observacoes,
    categoria_id,
    tem_st,
    st_pct_padrao,
  };

  if (id) {
    await supabase.from("produtos").update(payload).eq("id", id);
  } else {
    await supabase.from("produtos").insert(payload);
  }
  revalidatePath("/produtos");
}

export async function excluirProduto(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("produtos").update({ ativo: false }).eq("id", id);
  revalidatePath("/produtos");
}

// Define quais fornecedores fornecem um produto (substitui a lista atual).
export async function definirFornecedoresDoProduto(
  produtoId: string,
  fornecedorIds: string[],
) {
  const supabase = await createClient();
  await supabase.from("fornecedor_produto").delete().eq("produto_id", produtoId);
  if (fornecedorIds.length > 0) {
    await supabase.from("fornecedor_produto").insert(
      fornecedorIds.map((fornecedor_id) => ({ produto_id: produtoId, fornecedor_id })),
    );
  }
  revalidatePath("/produtos");
  return { ok: true, total: fornecedorIds.length };
}

// Vincula VÁRIOS produtos a um fornecedor de uma vez (aditivo — mantém os
// fornecedores que os produtos já tiverem).
export async function vincularProdutosAoFornecedor(
  produtoIds: string[],
  fornecedorId: string,
) {
  const supabase = await createClient();
  if (!fornecedorId || produtoIds.length === 0) return { ok: false, total: 0 };
  await supabase.from("fornecedor_produto").upsert(
    produtoIds.map((produto_id) => ({ produto_id, fornecedor_id: fornecedorId })),
    { onConflict: "fornecedor_id,produto_id", ignoreDuplicates: true },
  );
  revalidatePath("/produtos");
  return { ok: true, total: produtoIds.length };
}

// Cria um fornecedor "Hortifrúti / Feira" (se não existir) e vincula a ele
// todos os produtos que hoje estão sem nenhum fornecedor.
export async function vincularSemFornecedorNaFeira() {
  const supabase = await createClient();

  let { data: forn } = await supabase
    .from("fornecedores")
    .select("id")
    .eq("nome", "Hortifrúti / Feira")
    .maybeSingle();
  if (!forn) {
    const { data } = await supabase
      .from("fornecedores")
      .insert({ nome: "Hortifrúti / Feira" })
      .select("id")
      .single();
    forn = data;
  }
  if (!forn) return { ok: false, total: 0 };

  // produtos ativos sem nenhum vínculo
  const { data: prods } = await supabase.from("produtos").select("id").eq("ativo", true);
  const { data: vinc } = await supabase.from("fornecedor_produto").select("produto_id");
  const comForn = new Set((vinc ?? []).map((v) => v.produto_id));
  const semForn = (prods ?? []).map((p) => p.id).filter((id) => !comForn.has(id));

  if (semForn.length > 0) {
    await supabase
      .from("fornecedor_produto")
      .insert(semForn.map((produto_id) => ({ produto_id, fornecedor_id: forn!.id })));
  }
  revalidatePath("/produtos");
  return { ok: true, total: semForn.length };
}
