"use server";

import { createClient } from "@/lib/supabase/server";

type Preco = {
  produto_id: string;
  preco_unit: string;
  disponivel: boolean;
};

// Salva os preços informados pelo fornecedor via link público.
// Usa uma função no banco (SECURITY DEFINER) que valida o token — só precisa
// da chave anon pública.
export async function salvarPrecosPublico(token: string, precos: Preco[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cotar_fornecedor_salvar", {
    p_token: token,
    p_precos: precos,
  });
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  return data as { ok: boolean; gravados?: number; erro?: string };
}
