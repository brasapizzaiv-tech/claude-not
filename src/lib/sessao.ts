// Quem está logado, buscado UMA vez por requisição (auditoria DES-001, Onda 4).
//
// Antes, cada pedaço da tela do painel perguntava de novo: o título da aba, o
// layout, a empresa, as cores e o `exigirAcesso` de cada página — 3 a 4 idas
// ao servidor de login da Supabase e mais o perfil a cada clique (~0,15 s).
// O `cache` do React guarda a resposta só durante a requisição atual: a
// próxima página (ou ação) pergunta de novo, então sair, trocar de usuário ou
// mudar permissão continua valendo na hora.
//
// O middleware roda separado (não divide este cache) e segue conferindo o
// login antes de qualquer tela.
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type PerfilSessao = {
  nome: string | null;
  papel: string | null;
  permissoes: string[] | null;
  tema: string | null;
  empresa_id: string | null;
};

/** O usuário do login desta requisição (ou null) e o erro do Auth, se houve. */
export const usuarioDaSessao = cache(async (): Promise<{ user: User | null; erro: { name?: string; message: string } | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user ?? null, erro: error ? { name: error.name, message: error.message } : null };
});

/** O perfil de quem está logado (papel, permissões, tema, empresa), ou null. */
export const perfilDaSessao = cache(async (): Promise<PerfilSessao | null> => {
  const { user } = await usuarioDaSessao();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("nome, papel, permissoes, tema, empresa_id")
    .eq("id", user.id)
    .maybeSingle();
  return (data as PerfilSessao | null) ?? null;
});
