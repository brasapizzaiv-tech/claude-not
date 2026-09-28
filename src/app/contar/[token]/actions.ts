"use server";

import { createClient } from "@/lib/supabase/server";

import type { Parcela } from "@/lib/contagem-parcelas";

type Item = { produto_id: string; qtd_estoque: number; qtd_pedir: number; preenchido?: string; parcelas?: Parcela[] };

export type EtiquetaContagem =
  | {
      ok: true;
      id: string;
      numero: number;
      produto_id: string | null;
      produto: string;          // nome escrito na etiqueta
      nome_produto: string | null; // nome do produto no cadastro de compras
      quantidade: number | null;
      unidade: string | null;
      conservacao: string | null;
      status: string;
      validade: string | null;
      unidade_produto: string | null;
      categoria: string | null;
    }
  | { ok: false; mensagem: string };

// Etiqueta lida (QR) ou digitada (número) durante a contagem. A função do
// banco valida o link do contador e devolve o produto da etiqueta.
export async function consultarEtiquetaContagem(token: string, ref: { id?: string; numero?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contar_etiqueta", {
    p_token: token,
    p_id: ref.id ?? null,
    p_numero: ref.numero ?? null,
  });
  if (error || !data) return { ok: false, mensagem: "Não consegui consultar a etiqueta." } as EtiquetaContagem;
  return data as EtiquetaContagem;
}

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
