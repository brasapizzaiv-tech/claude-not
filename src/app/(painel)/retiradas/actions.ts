"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { receberFiado } from "@/lib/retiradas-quitar";

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
  await exigirAcesso("/retiradas");
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

export async function definirStatusRetirada(id: number, pago: boolean, obs?: string) {
  await exigirAcesso("/retiradas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("retiradas")
    .update({
      status: pago ? "pago" : "aberto",
      data_pagamento: pago ? hojeBR() : null,
      obs_pagamento: pago ? (obs?.trim() || null) : null,
    })
    .eq("id", id);
  return error ? erro(error.message) : ok();
}

// Quita tudo que está em aberto de um colaborador (marca como pago hoje).
export async function quitarColaborador(colaboradorId: string, obs?: string) {
  await exigirAcesso("/retiradas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("retiradas")
    .update({ status: "pago", data_pagamento: hojeBR(), obs_pagamento: obs?.trim() || null })
    .eq("colaborador_id", colaboradorId)
    .eq("status", "aberto");
  return error ? erro(error.message) : ok();
}

// Recebe só uma parte do que está em aberto: quita as compras mais antigas
// e divide a que não couber inteira (ver lib/retiradas-quitar).
export async function receberParcial(colaboradorId: string, valor: number, obs?: string) {
  await exigirAcesso("/retiradas");
  const supabase = await createClient();
  const v = Math.round(Number(valor) * 100) / 100;
  if (!colaboradorId || !(v > 0)) return erro("Informe o valor recebido.");
  const r = await receberFiado(supabase, colaboradorId, v, hojeBR(), obs?.trim() || "Pagamento parcial");
  if (r.erro) return erro(r.erro);
  if (r.recebido <= 0) return erro("Essa pessoa não tem nada em aberto.");
  revalidatePath("/colaboradores/semana");
  return ok();
}

export async function excluirRetirada(id: number) {
  await exigirAcesso("/retiradas");
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
  await exigirAcesso("/retiradas");
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
