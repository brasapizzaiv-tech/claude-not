"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type DadosItem = {
  nome: string;
  categoria_id: string | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
};

export async function criarEtiqueta(dados: {
  item_id?: string;
  produto_id?: string;
  colaborador_nome: string;
  validade: string;
  conservacao: string;
  quantidade: string;
  unidade: string;
  impressora_id?: string;
  copias?: number;
}) {
  const supabase = await createClient();

  let nome = "Produto";
  let produtoId: string | null = dados.produto_id || null;
  let categoriaNome: string | null = null;
  if (dados.item_id) {
    const { data: item } = await supabase
      .from("etiqueta_itens")
      .select("nome, produto_id, etiqueta_categorias(nome)")
      .eq("id", dados.item_id)
      .maybeSingle();
    if (!item) return { ok: false };
    nome = item.nome as string;
    produtoId = (item.produto_id as string | null) ?? null;
    const cat = item.etiqueta_categorias as { nome?: string } | { nome?: string }[] | null;
    categoriaNome = (Array.isArray(cat) ? cat[0]?.nome : cat?.nome) ?? null;
  } else if (produtoId) {
    const { data: prod } = await supabase.from("produtos").select("nome").eq("id", produtoId).maybeSingle();
    nome = prod?.nome ?? "Produto";
  } else {
    return { ok: false };
  }

  // impressora de destino: a escolhida, ou a única ativa (se só houver uma).
  let impressoraId = dados.impressora_id || null;
  if (!impressoraId) {
    const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).limit(2);
    if (imps && imps.length === 1) impressoraId = imps[0].id as string;
  }

  const { data, error } = await supabase
    .from("etiquetas")
    .insert({
      item_id: dados.item_id || null,
      produto_id: produtoId,
      produto_nome: nome,
      categoria_nome: categoriaNome,
      colaborador_nome: dados.colaborador_nome || null,
      validade: dados.validade || null,
      conservacao: dados.conservacao || null,
      quantidade: dados.quantidade
        ? Number(dados.quantidade.replace(",", ".")) || null
        : null,
      unidade: dados.unidade || null,
      impressora_id: impressoraId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false };
  // entra na fila de impressão (genérica) — uma vez por cópia
  const copias = Math.min(Math.max(Math.floor(dados.copias ?? 1), 1), 10);
  await supabase.from("impressao_fila").insert(
    Array.from({ length: copias }, () => ({ tipo: "etiqueta", ref_id: data.id, impressora_id: impressoraId })),
  );
  revalidatePath("/etiquetas");
  return { ok: true, id: data.id };
}

// Reenvia uma etiqueta para a fila de impressão (reimprimir).
export async function reimprimirEtiqueta(id: string) {
  const supabase = await createClient();
  const { data: et } = await supabase.from("etiquetas").select("impressora_id").eq("id", id).maybeSingle();
  await supabase.from("impressao_fila").insert({ tipo: "etiqueta", ref_id: id, impressora_id: et?.impressora_id ?? null });
  revalidatePath("/etiquetas");
  return { ok: true };
}

// Dá baixa na etiqueta (usada ou descartada) — controle de validade.
export async function darBaixaEtiqueta(id: string, status: "usada" | "descartada") {
  const supabase = await createClient();
  await supabase
    .from("etiquetas")
    .update({ status, baixa_em: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/etiquetas");
  return { ok: true };
}

export async function reativarEtiqueta(id: string) {
  const supabase = await createClient();
  await supabase
    .from("etiquetas")
    .update({ status: "ativa", baixa_em: null })
    .eq("id", id);
  revalidatePath("/etiquetas");
  return { ok: true };
}

export async function excluirEtiqueta(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("etiquetas").delete().eq("id", id);
  revalidatePath("/etiquetas");
}

// Atualiza a validade padrão (dias) de um produto.
export async function salvarValidadeProduto(produtoId: string, dias: number | null) {
  const supabase = await createClient();
  await supabase.from("produtos").update({ validade_dias: dias }).eq("id", produtoId);
  revalidatePath("/etiquetas");
  return { ok: true };
}

// ---------- Catálogo de itens de etiqueta ----------
const dias = (v: unknown) => (v == null || v === "" ? null : Math.max(0, Math.floor(Number(v))) || null);

export async function criarItemEtiqueta(d: DadosItem) {
  const supabase = await createClient();
  const nome = (d.nome || "").trim();
  if (!nome) return null;
  const { data } = await supabase
    .from("etiqueta_itens")
    .insert({
      nome,
      categoria_id: d.categoria_id || null,
      validade_congelado: dias(d.validade_congelado),
      validade_resfriado: dias(d.validade_resfriado),
      validade_ambiente: dias(d.validade_ambiente),
    })
    .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente")
    .single();
  revalidatePath("/etiquetas");
  revalidatePath("/etiquetas/itens");
  return data ?? null;
}

export async function salvarItemEtiqueta(d: DadosItem & { id?: string; ativo?: boolean; produto_id?: string | null }) {
  const supabase = await createClient();
  const nome = (d.nome || "").trim();
  if (!nome) return { ok: false };
  const row = {
    nome,
    categoria_id: d.categoria_id || null,
    produto_id: d.produto_id || null,
    validade_congelado: dias(d.validade_congelado),
    validade_resfriado: dias(d.validade_resfriado),
    validade_ambiente: dias(d.validade_ambiente),
    ativo: d.ativo ?? true,
  };
  if (d.id) await supabase.from("etiqueta_itens").update(row).eq("id", d.id);
  else await supabase.from("etiqueta_itens").insert(row);
  revalidatePath("/etiquetas");
  revalidatePath("/etiquetas/itens");
  return { ok: true };
}

export async function excluirItemEtiqueta(id: string) {
  const supabase = await createClient();
  await supabase.from("etiqueta_itens").delete().eq("id", id);
  revalidatePath("/etiquetas");
  revalidatePath("/etiquetas/itens");
  return { ok: true };
}

export async function salvarCategoriaEtiqueta(d: { id?: string; nome: string; ordem?: number; ativo?: boolean }) {
  const supabase = await createClient();
  const nome = (d.nome || "").trim();
  if (!nome) return { ok: false };
  const row = { nome, ordem: Math.floor(Number(d.ordem ?? 0)) || 0, ativo: d.ativo ?? true };
  const r = d.id
    ? await supabase.from("etiqueta_categorias").update(row).eq("id", d.id)
    : await supabase.from("etiqueta_categorias").insert(row);
  if (r.error) return { ok: false, mensagem: r.error.message.includes("unique") ? "Já existe uma categoria com esse nome." : r.error.message };
  revalidatePath("/etiquetas");
  revalidatePath("/etiquetas/itens");
  return { ok: true };
}
