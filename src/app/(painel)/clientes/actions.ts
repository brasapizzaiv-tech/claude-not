"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarCliente(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = ((formData.get("nome") as string) || "").trim();
  if (!nome) return;
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
  };
  if (id) await supabase.from("clientes").update(payload).eq("id", id);
  else await supabase.from("clientes").insert(payload);
  revalidatePath("/clientes");
}

export async function excluirCliente(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("clientes").update({ ativo: false }).eq("id", formData.get("id") as string);
  revalidatePath("/clientes");
}
