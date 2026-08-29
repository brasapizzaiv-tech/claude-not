"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function ok() {
  revalidatePath("/retiradas");
  return { ok: true as const };
}
function erro(m: string) {
  return { ok: false as const, mensagem: m };
}

export async function lancarRetirada(input: {
  colaboradorId: string;
  produtoId: number | null;
  item: string;
  valor: number;
  peso: number | null;
  data: string;
  observacao: string;
}) {
  const supabase = await createClient();
  const item = input.item?.trim();
  if (!input.colaboradorId) return erro("Escolha a pessoa.");
  if (!item) return erro("Informe o item.");
  const { data: auth } = await supabase.auth.getUser();
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("nome")
    .eq("id", input.colaboradorId)
    .maybeSingle();
  const { error } = await supabase.from("retiradas").insert({
    colaborador_id: input.colaboradorId,
    nome: colab?.nome ?? item,
    produto_id: input.produtoId,
    item,
    valor: input.valor || 0,
    peso: input.peso,
    data: input.data || hojeBR(),
    status: "aberto",
    observacao: input.observacao?.trim() || null,
    criado_por: auth.user?.id ?? null,
  });
  return error ? erro(error.message) : ok();
}

export async function definirStatusRetirada(id: number, pago: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("retiradas")
    .update({ status: pago ? "pago" : "aberto", data_pagamento: pago ? hojeBR() : null })
    .eq("id", id);
  return error ? erro(error.message) : ok();
}

// Quita tudo que está em aberto de um colaborador (marca como pago hoje).
export async function quitarColaborador(colaboradorId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("retiradas")
    .update({ status: "pago", data_pagamento: hojeBR() })
    .eq("colaborador_id", colaboradorId)
    .eq("status", "aberto");
  return error ? erro(error.message) : ok();
}

export async function excluirRetirada(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("retiradas").delete().eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function salvarProduto(input: {
  id: number | null;
  nome: string;
  categoria: string;
  preco: number;
  ativo: boolean;
}) {
  const supabase = await createClient();
  const nome = input.nome?.trim();
  if (!nome) return erro("Informe o nome do produto.");
  const row = { nome, categoria: input.categoria?.trim() || null, preco: input.preco || 0, ativo: input.ativo };
  if (input.id) {
    const { error } = await supabase.from("retirada_produtos").update(row).eq("id", input.id);
    if (error) return erro(error.message);
  } else {
    const { error } = await supabase.from("retirada_produtos").insert(row);
    if (error) return error.code === "23505" ? erro("Já existe um produto com esse nome.") : erro(error.message);
  }
  return ok();
}
