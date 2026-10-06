// Lê as formas de pagamento da empresa (tabela formas_pagamento) pra cada
// tela de venda. Usa o service role porque o app do cliente (/pedir) é
// público, sem login; o filtro por empresa garante que cada um vê o seu.
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { FORMAS_PADRAO, type FormaOpcao, type FormaPagamento } from "./formas-pagamento";

export type CanalForma = keyof typeof FORMAS_PADRAO;

const CAMPO: Record<CanalForma, keyof FormaPagamento> = {
  caixa: "no_caixa",
  pdv: "no_pdv",
  delivery: "no_delivery",
  app: "no_app",
  fiado: "no_fiado",
};

/** Todas as formas cadastradas da empresa (ativas ou não), na ordem da tela. */
export const todasFormas = cache(async (): Promise<FormaPagamento[]> => {
  const empresaId = await empresaAtualId();
  if (!empresaId) return [];
  const { data } = await createAdminClient()
    .from("formas_pagamento")
    .select("id, nome, tipo, nome_app, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ativo, ordem")
    .eq("empresa_id", empresaId)
    .order("ordem")
    .order("criado_em");
  return (data as FormaPagamento[] | null) ?? [];
});

/** As formas ativas de um canal, prontas pra tela. Empresa sem cadastro
 *  recebe a lista que valia fixa no código, pra não ficar sem botão. */
export async function listarFormas(canal: CanalForma): Promise<FormaOpcao[]> {
  const todas = await todasFormas();
  if (todas.length === 0) return FORMAS_PADRAO[canal];
  const campo = CAMPO[canal];
  return todas
    .filter((f) => f.ativo && f[campo] === true)
    .map((f) => ({
      nome: f.nome,
      tipo: f.tipo,
      ...(canal === "app" && f.nome_app ? { label: f.nome_app } : {}),
    }));
}

/** Nome + tipo de tudo que está cadastrado (pra achar o tipo de um pagamento
 *  antigo pelo nome, ex.: código fiscal da nota). */
export async function formasParaTipo(): Promise<FormaOpcao[]> {
  return (await todasFormas()).map((f) => ({ nome: f.nome, tipo: f.tipo }));
}
