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
  const valorRaw = (formData.get("valor") as string) || "0";
  const valor = Number(valorRaw.replace(/\./g, "").replace(",", ".")) || 0;

  if (!categoria_id || valor <= 0) return;

  await supabase.from("lancamentos").insert({
    data: data || new Date().toISOString().slice(0, 10),
    categoria_id,
    descricao,
    forma_pagamento,
    valor,
    origem: "manual",
  });

  revalidatePath("/financeiro");
}

export async function excluirLancamento(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("lancamentos").delete().eq("id", id).eq("origem", "manual");
  revalidatePath("/financeiro");
}
