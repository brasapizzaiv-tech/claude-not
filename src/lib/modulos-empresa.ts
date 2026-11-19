// Módulos que cada EMPRESA contratou (19/11/2026). Arquivo à parte de
// empresa.ts pra poder ser usado por garcom-auth sem import circular.
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ModulosEmpresa } from "@/lib/permissoes";

/** Módulos que a empresa contratou (`empresas.modulos`, migration 0322).
 *  NULL = todos (a Brasa). Uma busca por empresa por requisição.
 *
 *  Se a leitura falhar (coluna ainda não criada, rede), devolve NULL: o menu
 *  mostra tudo em vez de trancar a loja no meio do serviço. Não é furo — o que
 *  separa os DADOS de cada empresa são as regras do banco, não esta lista. */
export const modulosDaEmpresa = cache(async (empresaId: string | null): Promise<ModulosEmpresa> => {
  if (!empresaId) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("empresas")
      .select("modulos")
      .eq("id", empresaId)
      .maybeSingle();
    if (error) return null;
    const m = (data as { modulos: string[] | null } | null)?.modulos;
    return Array.isArray(m) ? m : null;
  } catch {
    return null;
  }
});

