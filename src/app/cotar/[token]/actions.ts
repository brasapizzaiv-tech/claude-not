"use server";

import { createClient } from "@/lib/supabase/server";

type PrecoExtra = {
  marca: string;
  preco_unit: string;
  embalagem: string;
  tamanho_embalagem: string;
  observacao: string;
  st_inclusa?: string;
  st_pct?: string;
};

type Preco = {
  produto_id: string;
  preco_unit: string;
  disponivel: boolean;
  foto_url: string;
  embalagem: string;
  tamanho_embalagem: string;
  observacao: string;
  st_inclusa?: string; // "true" | "false" | ""
  st_pct?: string;
  extras?: PrecoExtra[];
};

export type DadosCotacao = {
  precos: Preco[];
  prazo_entrega: string;
  pedido_minimo: string;
  condicao_pagamento: string;
  observacao: string;
  promocao_texto?: string;
  promocao_foto?: string;
  rascunho?: boolean;
};

// Salva os preços + dados do rodapé informados pelo fornecedor via link público.
// Usa função no banco (SECURITY DEFINER) que valida o token — só a chave anon.
export async function salvarPrecosPublico(token: string, dados: DadosCotacao) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cotar_fornecedor_salvar", {
    p_token: token,
    p_dados: dados,
  });
  if (error) {
    // Loga o motivo real (ex.: valor que não é número/data) para diagnóstico.
    console.error("cotar_fornecedor_salvar erro:", error.message, error.details ?? "");
    return { ok: false, erro: "Não foi possível salvar. Confira preços/valores e tente de novo." };
  }
  return data as { ok: boolean; gravados?: number; erro?: string };
}

// "Não trabalho com este item": remove o vínculo (some das próximas cotações).
export async function removerItemPublico(token: string, produtoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cotar_fornecedor_remover_item", {
    p_token: token,
    p_produto_id: produtoId,
  });
  if (error) return { ok: false };
  return data as { ok: boolean };
}
