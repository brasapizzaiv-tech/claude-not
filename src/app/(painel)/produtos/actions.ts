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
  const fardoRaw = (formData.get("fardo") as string) || "0";
  const fardo = Number(fardoRaw.replace(",", ".")) || 0;
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

  const fiscalTxt = (campo: string) => ((formData.get(campo) as string) || "").trim() || null;

  const payload = {
    nome,
    unidade,
    estoque_minimo,
    estoque_ideal,
    fardo,
    validade_congelado: dias("validade_congelado"),
    validade_resfriado: dias("validade_resfriado"),
    validade_ambiente: dias("validade_ambiente"),
    observacoes,
    categoria_id,
    tem_st,
    st_pct_padrao,
    ncm: fiscalTxt("ncm"),
    cest: fiscalTxt("cest"),
    cfop: fiscalTxt("cfop"),
    csosn: fiscalTxt("csosn"),
    origem: fiscalTxt("origem") ?? "0",
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
  exclusivo = false,
) {
  const supabase = await createClient();
  // Produto exclusivo: garante no máximo 1 fornecedor.
  const ids = exclusivo ? fornecedorIds.slice(0, 1) : fornecedorIds;
  await supabase.from("fornecedor_produto").delete().eq("produto_id", produtoId);
  if (ids.length > 0) {
    await supabase.from("fornecedor_produto").insert(
      ids.map((fornecedor_id) => ({ produto_id: produtoId, fornecedor_id })),
    );
  }
  await supabase.from("produtos").update({ exclusivo }).eq("id", produtoId);
  revalidatePath("/produtos");
  return { ok: true, total: ids.length };
}

// Marca/desmarca um produto como exclusivo direto na lista. Se ligar exclusivo
// com mais de 1 fornecedor, recusa (precisaEscolher) para a tela forçar a
// escolha de qual fornecedor fica.
export async function marcarExclusivo(produtoId: string, valor: boolean) {
  const supabase = await createClient();
  if (valor) {
    const { count } = await supabase
      .from("fornecedor_produto")
      .select("*", { count: "exact", head: true })
      .eq("produto_id", produtoId);
    if ((count ?? 0) > 1) return { ok: false as const, precisaEscolher: true as const };
  }
  await supabase.from("produtos").update({ exclusivo: valor }).eq("id", produtoId);
  revalidatePath("/produtos");
  return { ok: true as const };
}

// Vincula VÁRIOS produtos a um fornecedor de uma vez (aditivo — mantém os
// fornecedores que os produtos já tiverem).
export async function vincularProdutosAoFornecedor(
  produtoIds: string[],
  fornecedorId: string,
) {
  const supabase = await createClient();
  if (!fornecedorId || produtoIds.length === 0) return { ok: false, total: 0 };
  // Não vincula em lote produtos exclusivos (eles têm 1 fornecedor fixo).
  const { data: exc } = await supabase
    .from("produtos")
    .select("id")
    .in("id", produtoIds)
    .eq("exclusivo", true);
  const bloqueados = new Set((exc ?? []).map((e) => e.id));
  const alvos = produtoIds.filter((id) => !bloqueados.has(id));
  if (alvos.length > 0) {
    await supabase.from("fornecedor_produto").upsert(
      alvos.map((produto_id) => ({ produto_id, fornecedor_id: fornecedorId })),
      { onConflict: "fornecedor_id,produto_id", ignoreDuplicates: true },
    );
  }
  revalidatePath("/produtos");
  return { ok: true, total: alvos.length, pulados: bloqueados.size };
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
