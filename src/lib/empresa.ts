import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_GARCOM } from "@/lib/garcom-auth";

// DE QUEM É ESTE ACESSO? (Etapa 1 do multiempresa)
//
// Esta é a pergunta que o sistema inteiro vai passar a fazer antes de mostrar
// qualquer coisa. Hoje a resposta é sempre a Brasa, porque só existe ela. O
// que muda aqui é que a resposta passa a ter um CAMINHO — e o caminho é um só,
// neste arquivo, em vez de espalhado.
//
// São quatro fontes, nesta ordem:
//
//   1. Quem entrou com e-mail e senha        → a empresa do perfil dele
//   2. Quem entrou pelo link pessoal          → a empresa do colaborador
//   3. O endereço da página (subdomínio)      → a empresa daquele apelido
//   4. Só existe uma empresa cadastrada       → ela
//
// A quarta é rede de segurança e se desarma sozinha: no dia em que a segunda
// empresa for criada, ela para de valer. É de propósito — um esquecimento aqui
// tem que virar "não vejo nada", nunca "vejo tudo".
//
// O mesmo caminho existe do lado do banco, na função `empresa_atual()`, que é
// quem protege as tabelas. Este arquivo é pra quando o código precisa saber
// (montar um endereço, escolher um logo, filtrar uma busca feita com a chave
// administrativa, que passa por cima das regras do banco).

export const BRASA = "00000000-0000-4000-8000-000000000001";

export type Empresa = {
  id: string;
  nome: string;
  slug: string;
};

/** Apelido tirado do endereço: `pizzariax.seusistema.com.br` → `pizzariax`.
 *  Devolve nulo em localhost, em endereço de teste da Vercel e no domínio
 *  próprio da Brasa — nesses casos quem responde é outra fonte. */
export function apelidoDoEndereco(host: string | null): string | null {
  if (!host) return null;
  const limpo = host.split(":")[0].toLowerCase();
  if (limpo === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(limpo)) return null;
  const partes = limpo.split(".");
  // Precisa de pelo menos apelido + domínio + terminação.
  if (partes.length < 3) return null;
  const primeiro = partes[0];
  if (primeiro === "www" || limpo.endsWith(".vercel.app")) return null;
  return primeiro;
}

async function porPerfil(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", user.id)
      .maybeSingle();
    return (data?.empresa_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function porColaborador(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_GARCOM)?.value ?? "";
    if (!token) return null;
    return await empresaDoColaborador(token);
  } catch {
    return null;
  }
}

/** A empresa de um colaborador pelo token do link pessoal. Serve pros apps que
 *  entram sem login: /eu, /garcom, /entrega, /folga. */
export async function empresaDoColaborador(token: string): Promise<string | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("empresa_id")
    .eq("token", token)
    .eq("ativo", true)
    .maybeSingle();
  return (data?.empresa_id as string | undefined) ?? null;
}

async function porEndereco(): Promise<string | null> {
  try {
    const apelido = apelidoDoEndereco((await headers()).get("host"));
    if (!apelido) return null;
    const admin = createAdminClient();
    const { data } = await admin
      .from("empresas")
      .select("id")
      .eq("slug", apelido)
      .eq("ativo", true)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** A única empresa cadastrada, ou nulo se já houver mais de uma. */
async function aUnica(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("empresas").select("id").limit(2);
  const linhas = (data as { id: string }[] | null) ?? [];
  return linhas.length === 1 ? linhas[0].id : null;
}

/** O id da empresa deste acesso, ou nulo quando não dá pra saber.
 *  Resolvido uma vez por página (o `cache` do React cuida disso). */
export const empresaAtualId = cache(async (): Promise<string | null> => {
  return (
    (await porPerfil()) ??
    (await porColaborador()) ??
    (await porEndereco()) ??
    (await aUnica())
  );
});

/** A empresa deste acesso, com nome e apelido. */
export const empresaAtual = cache(async (): Promise<Empresa | null> => {
  const id = await empresaAtualId();
  if (!id) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("empresas")
    .select("id, nome, slug")
    .eq("id", id)
    .maybeSingle();
  return (data as Empresa | null) ?? null;
});

/** Por onde a empresa foi reconhecida. Só pra mostrar na tela de diagnóstico:
 *  quando alguém disser "estou vendo os dados errados", é aqui que se olha. */
export async function comoReconheci(): Promise<{
  fonte: "perfil" | "colaborador" | "endereco" | "unica" | "nenhuma";
  empresa: Empresa | null;
}> {
  const empresa = await empresaAtual();
  if (!empresa) return { fonte: "nenhuma", empresa: null };
  if (await porPerfil()) return { fonte: "perfil", empresa };
  if (await porColaborador()) return { fonte: "colaborador", empresa };
  if (await porEndereco()) return { fonte: "endereco", empresa };
  return { fonte: "unica", empresa };
}
