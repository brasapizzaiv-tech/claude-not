// Quem está usando o app do garçom (/garcom):
//  1) usuário logado no sistema (caixa/dono) — usa o client normal (RLS), ou
//  2) colaborador vindo do app pessoal (/eu/{token} → "Modo garçom"): cookie
//     garcom_colab = token do colaborador, marcado com faz_garcom. Usa o client
//     admin (não tem sessão do Supabase) e grava criado_colab_id nos itens.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeAcessar } from "@/lib/permissoes";

export const COOKIE_GARCOM = "garcom_colab";

export type SessaoGarcom = {
  db: ReturnType<typeof createAdminClient>;
  uid: string | null; // usuário do sistema
  colabId: string | null; // colaborador (app pessoal)
  nome: string | null;
  token: string | null; // token do colaborador (pra voltar pro /eu)
  viaColab: boolean;
  podeGarcom: boolean; // pode abrir as TELAS do garçom
};

// Colaborador válido pelo cookie (ou null).
export async function colaboradorGarcom(): Promise<{ id: string; nome: string; token: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_GARCOM)?.value ?? "";
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, token")
    .eq("token", token)
    .eq("ativo", true)
    .eq("faz_garcom", true)
    .maybeSingle();
  const c = data as { id: string; nome: string; token: string } | null;
  return c ? { id: c.id, nome: c.nome, token: c.token } : null;
}

export async function sessaoGarcom(): Promise<SessaoGarcom | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("papel, permissoes, nome").eq("id", user.id).maybeSingle();
    const admin = prof?.papel === "dono";
    const permissoes = (prof?.permissoes as string[] | null) ?? [];
    return {
      db: supabase as unknown as ReturnType<typeof createAdminClient>,
      uid: user.id,
      colabId: null,
      nome: (prof?.nome as string | null) ?? null,
      token: null,
      viaColab: false,
      podeGarcom: podeAcessar("/garcom", admin, permissoes),
    };
  }
  const colab = await colaboradorGarcom();
  if (!colab) return null;
  return { db: createAdminClient(), uid: null, colabId: colab.id, nome: colab.nome, token: colab.token, viaColab: true, podeGarcom: true };
}

// Client de banco pra ações que o garçom (logado OU por cookie) pode usar.
export async function dbGarcomOuUsuario() {
  const s = await sessaoGarcom();
  if (s) return s.db;
  return (await createClient()) as unknown as ReturnType<typeof createAdminClient>;
}
