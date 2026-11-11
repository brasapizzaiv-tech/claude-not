"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    // Prazo da cotação terminou (migration 0247): o banco recusa a gravação.
    if (/cotacao_fechada/.test(error.message)) {
      return { ok: false, fechada: true, erro: "O prazo pra responder esta cotação terminou. Se ainda quiser mandar preço, fale com o comprador." };
    }
    // Loga o motivo real (ex.: valor que não é número/data) para diagnóstico.
    console.error("cotar_fornecedor_salvar erro:", error.message, error.details ?? "");
    return { ok: false, erro: "Não foi possível salvar. Confira preços/valores e tente de novo." };
  }
  return data as { ok: boolean; gravados?: number; erro?: string; fechada?: boolean };
}

// "Não trabalho com este item": remove o vínculo (some das próximas cotações).
export async function removerItemPublico(token: string, produtoId: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cotar_fornecedor_remover_item", {
    p_token: token,
    p_produto_id: produtoId,
  });
  if (error) return { ok: false };
  return data as { ok: boolean; erro?: string };
}

// Foto do produto/promoção (auditoria SEC-07). Antes o celular do fornecedor
// subia direto pro bucket com a chave pública, na pasta {token}/ — e a pasta
// era listável, o que entregava o token de todos os fornecedores. Agora o
// servidor confere o link, a cotação aberta, o tipo e o tamanho, e devolve um
// endereço de envio de uso único com nome aleatório.
const FOTO_MAX_BYTES = 3 * 1024 * 1024;
const FOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function urlParaFoto(token: string, tipo: string, tamanho: number) {
  const ext = FOTO_EXT[tipo];
  if (!ext) return { ok: false as const, erro: "Envie uma foto (JPG, PNG ou WEBP)." };
  if (!(tamanho > 0) || tamanho > FOTO_MAX_BYTES) return { ok: false as const, erro: "A foto passou de 3 MB." };
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(token))) return { ok: false as const, erro: "Link inválido." };
  const admin = createAdminClient();
  const { data: cf } = await admin
    .from("cotacao_fornecedores")
    .select("id, cotacoes(status, respostas_ate)")
    .eq("token", token)
    .maybeSingle();
  if (!cf) return { ok: false as const, erro: "Link inválido." };
  const cot = (Array.isArray(cf.cotacoes) ? cf.cotacoes[0] : cf.cotacoes) as { status?: string; respostas_ate?: string | null } | null;
  if (cot?.respostas_ate && new Date(cot.respostas_ate).getTime() < Date.now())
    return { ok: false as const, erro: "O prazo pra responder esta cotação terminou." };
  const path = `f/${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("cotacao-fotos").createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, erro: "Não consegui preparar o envio. Tente de novo." };
  const publica = admin.storage.from("cotacao-fotos").getPublicUrl(path).data.publicUrl;
  return { ok: true as const, path, envio: data.token, publica };
}
