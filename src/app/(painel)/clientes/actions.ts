"use server";

import { numeroBR } from "@/lib/format";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarCliente(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = ((formData.get("nome") as string) || "").trim();
  if (!nome) return { ok: false as const, mensagem: "Informe o nome." };
  const t = (c: string) => ((formData.get(c) as string) || "").trim() || null;
  const payload = {
    nome,
    cpf_cnpj: t("cpf_cnpj"),
    ie: t("ie"),
    email: t("email"),
    telefone: t("telefone"),
    cep: t("cep"),
    logradouro: t("logradouro"),
    numero: t("numero"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    municipio: t("municipio"),
    uf: t("uf"),
    cod_municipio: t("cod_municipio"),
    // Teto do fiado ("Saldo cliente" no caixa). Vazio = sem limite.
    limite_credito: (() => {
      const v = ((formData.get("limite_credito") as string) || "").trim();
      if (!v) return null;
      const n = numeroBR(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
  };
  const { error } = id
    ? await supabase.from("clientes").update(payload).eq("id", id)
    : await supabase.from("clientes").insert(payload);
  revalidatePath("/clientes");
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const };
}

export async function excluirCliente(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("clientes").update({ ativo: false }).eq("id", formData.get("id") as string);
  revalidatePath("/clientes");
}
