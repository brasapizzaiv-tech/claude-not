"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarEtiqueta(dados: {
  produto_id: string;
  colaborador_nome: string;
  validade: string;
  conservacao: string;
  quantidade: string;
  unidade: string;
  impressora_id?: string;
}) {
  const supabase = await createClient();

  const { data: prod } = await supabase
    .from("produtos")
    .select("nome")
    .eq("id", dados.produto_id)
    .maybeSingle();

  // impressora de destino: a escolhida, ou a única ativa (se só houver uma).
  let impressoraId = dados.impressora_id || null;
  if (!impressoraId) {
    const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).limit(2);
    if (imps && imps.length === 1) impressoraId = imps[0].id as string;
  }

  const { data, error } = await supabase
    .from("etiquetas")
    .insert({
      produto_id: dados.produto_id,
      produto_nome: prod?.nome ?? "Produto",
      colaborador_nome: dados.colaborador_nome || null,
      validade: dados.validade || null,
      conservacao: dados.conservacao || null,
      quantidade: dados.quantidade
        ? Number(dados.quantidade.replace(",", ".")) || null
        : null,
      unidade: dados.unidade || null,
      impressora_id: impressoraId,
      // já entra na fila da Estação de impressão
      impressao_solicitada_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false };
  revalidatePath("/etiquetas");
  return { ok: true, id: data.id };
}

// ---- Estação de impressão (fila) ----

// Próxima etiqueta pendente para a Estação daquela impressora (null se não houver).
export async function proximaEtiquetaParaImprimir(impressoraId: string) {
  const supabase = await createClient();
  if (!impressoraId) return null;
  const { data } = await supabase
    .from("etiquetas")
    .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade, conservacao, quantidade, unidade")
    .eq("impressora_id", impressoraId)
    .not("impressao_solicitada_em", "is", null)
    .is("impresso_em", null)
    .order("impressao_solicitada_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    numero: data.numero as number,
    produto: data.produto_nome as string,
    colaborador: (data.colaborador_nome as string) ?? null,
    manipuladoEm: data.manipulado_em as string,
    validade: (data.validade as string) ?? null,
    conservacao: (data.conservacao as string) ?? null,
    quantidade: (data.quantidade as number) ?? null,
    unidade: (data.unidade as string) ?? null,
  };
}

export async function marcarEtiquetaImpressa(id: string) {
  const supabase = await createClient();
  await supabase.from("etiquetas").update({ impresso_em: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}

// Reenvia uma etiqueta para a fila da Estação (reimprimir).
export async function reimprimirEtiqueta(id: string) {
  const supabase = await createClient();
  await supabase
    .from("etiquetas")
    .update({ impressao_solicitada_em: new Date().toISOString(), impresso_em: null })
    .eq("id", id);
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

// ---- Impressoras ----
export async function criarImpressora(nome: string) {
  const supabase = await createClient();
  const n = nome?.trim();
  if (!n) return { ok: false as const };
  await supabase.from("impressoras").insert({ nome: n });
  revalidatePath("/etiquetas/estacao");
  revalidatePath("/etiquetas");
  return { ok: true as const };
}

export async function renomearImpressora(id: string, nome: string) {
  const supabase = await createClient();
  const n = nome?.trim();
  if (!n) return { ok: false as const };
  await supabase.from("impressoras").update({ nome: n }).eq("id", id);
  revalidatePath("/etiquetas/estacao");
  revalidatePath("/etiquetas");
  return { ok: true as const };
}

export async function definirImpressoraAtiva(id: string, ativo: boolean) {
  const supabase = await createClient();
  await supabase.from("impressoras").update({ ativo }).eq("id", id);
  revalidatePath("/etiquetas/estacao");
  revalidatePath("/etiquetas");
  return { ok: true as const };
}

// Atualiza a validade padrão (dias) de um produto.
export async function salvarValidadeProduto(produtoId: string, dias: number | null) {
  const supabase = await createClient();
  await supabase.from("produtos").update({ validade_dias: dias }).eq("id", produtoId);
  revalidatePath("/etiquetas");
  return { ok: true };
}
