"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dados(formData: FormData) {
  const get = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  return {
    nome: get("nome") ?? "",
    cnpj: get("cnpj"),
    contato: get("contato"),
    telefone: get("telefone"),
    email: get("email"),
    whatsapp: get("whatsapp"),
    observacoes: get("observacoes"),
    // Padrão das notas desse fornecedor (preenche sozinho ao vincular/importar).
    dre_categoria_id: get("dre_categoria_id"),
    tipo_nota: (() => { const t = get("tipo_nota"); return t === "mercadoria" || t === "servico" ? t : null; })(),
  };
}

export async function salvarFornecedor(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const payload = dados(formData);

  if (!payload.nome) return;

  if (id) {
    await supabase.from("fornecedores").update(payload).eq("id", id);
  } else {
    await supabase.from("fornecedores").insert(payload);
  }
  revalidatePath("/fornecedores");
}

export async function excluirFornecedor(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  // Exclusão "suave": marca como inativo para preservar histórico.
  await supabase.from("fornecedores").update({ ativo: false }).eq("id", id);
  revalidatePath("/fornecedores");
}
