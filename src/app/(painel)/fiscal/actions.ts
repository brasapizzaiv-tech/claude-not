"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Salva a configuração fiscal (dados da empresa + emissor). Chave/valor.
export async function salvarConfigFiscal(formData: FormData) {
  const supabase = await createClient();
  const campos = [
    "razao_social",
    "nome_fantasia",
    "cnpj",
    "ie",
    "crt",
    "cep",
    "logradouro",
    "numero",
    "bairro",
    "municipio",
    "uf",
    "cod_municipio",
    "emissor",
    "emissor_token",
    "emissor_ambiente",
    "csc",
    "csc_id",
    "cfop_padrao",
    "csosn_padrao",
    "ncm_buffet",
  ];
  const linhas = campos.map((chave) => ({
    chave,
    valor: ((formData.get(chave) as string) ?? "").trim(),
  }));
  await supabase.from("config_fiscal").upsert(linhas);
  revalidatePath("/fiscal");
}
