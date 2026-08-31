"use server";

import { createClient } from "@/lib/supabase/server";

type Item = { produto_id: string; qtd_estoque: number; qtd_pedir: number; preenchido?: string };

// Busca produtos do estoque pro contador ADICIONAR um item fora da lista dele.
export async function buscarProdutosContagem(token: string, termo: string) {
  const supabase = await createClient();
  const t = (termo || "").trim();
  if (t.length < 2) return [];
  const { data } = await supabase.rpc("contar_buscar_produtos", { p_token: token, p_busca: t });
  return ((data as { id: string; nome: string; unidade: string; categoria: string }[]) ?? []);
}

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
