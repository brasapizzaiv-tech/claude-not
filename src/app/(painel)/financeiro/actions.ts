"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function criarLancamento(formData: FormData) {
  const supabase = await createClient();

  const data = (formData.get("data") as string) || null;
  const categoria_id = (formData.get("categoria_id") as string) || null;
  const descricao = (formData.get("descricao") as string)?.trim() || null;
  const forma_pagamento =
    (formData.get("forma_pagamento") as string)?.trim() || null;
  const vencimento = (formData.get("vencimento") as string) || null;
  const pago = formData.get("pago") === "on";
  const valorRaw = (formData.get("valor") as string) || "0";
  const valor = Number(valorRaw.replace(/\./g, "").replace(",", ".")) || 0;

  if (!categoria_id || valor <= 0) return;

  const dataLanc = data || new Date().toISOString().slice(0, 10);

  await supabase.from("lancamentos").insert({
    data: dataLanc,
    categoria_id,
    descricao,
    forma_pagamento,
    valor,
    origem: "manual",
    vencimento: vencimento || null,
    pago,
    pago_em: pago ? dataLanc : null,
  });

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
}

export async function excluirLancamento(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("lancamentos").delete().eq("id", id).eq("origem", "manual");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
}

// Marca uma conta como paga (ou volta para não paga).
export async function alternarPago(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const pago = formData.get("pago") === "true";
  await supabase
    .from("lancamentos")
    .update({
      pago,
      pago_em: pago ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}
