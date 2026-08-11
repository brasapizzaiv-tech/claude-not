"use server";

import { createClient } from "@/lib/supabase/server";

type Item = { produto_id: string; qtd_estoque: number; qtd_pedir: number };

// Salva a contagem preenchida pelo colaborador via link público.
// Usa uma função no banco (SECURITY DEFINER) que valida o token — não precisa
// da chave secreta, só da chave anon pública.
export async function salvarContagemPublica(token: string, itens: Item[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contar_salvar", {
    p_token: token,
    p_itens: itens,
  });
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  return data as { ok: boolean; gravados?: number; erro?: string };
}
