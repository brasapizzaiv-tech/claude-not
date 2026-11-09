// Quem está usando o app do garçom (/garcom):
//  1) usuário logado no sistema (caixa/dono) — usa o client normal (RLS), ou
//  2) colaborador vindo do app pessoal (/eu/{token} → "Modo garçom"): cookie
//     garcom_colab = token do colaborador, marcado com faz_garcom. Usa o client
//     admin (não tem sessão do Supabase) e grava criado_colab_id nos itens.
// O cookie é "token.assinatura": a assinatura é feita pelo servidor e amarrada
// ao PIN atual da pessoa (auditoria SEC-05, 08/11/2026: antes era só o token, e
// quem tinha o link de um garçom montava o cookie e usava o app sem o PIN).
// Trocar ou zerar o PIN derruba o modo garçom aberto nos celulares.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeAcessar } from "@/lib/permissoes";
import { cookieGarcomConfere, montarCookieGarcom, tokenDoValor } from "@/lib/garcom-assinatura";

export const COOKIE_GARCOM = "garcom_colab";

const chave = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Valor do cookie do modo garçom (só o servidor sabe gerar). */
export function valorCookieGarcom(token: string, pin: string | null): string {
  return montarCookieGarcom(chave(), token, pin);
}

/** O token que está no cookie (sem conferir a assinatura). */
export function tokenDoCookieGarcom(valor: string): string {
  return tokenDoValor(valor);
}

/** Pra onde mandar quem abriu /garcom sem sessão válida. Cookie do formato
 *  antigo (só o token, de antes de 08/11/2026) vai renovar pelo /eu/{token}/garcom,
 *  que confere o PIN do app e grava o cookie novo — quem já estava com o modo
 *  garçom aberto no celular entra sem perceber. */
export async function destinoSemSessaoGarcom(): Promise<string> {
  const v = (await cookies()).get(COOKIE_GARCOM)?.value ?? "";
  if (v && !v.includes(".") && /^[A-Za-z0-9_-]{8,64}$/.test(v)) return `/eu/${v}/garcom`;
  return "/login?next=/garcom";
}

export type SessaoGarcom = {
  db: ReturnType<typeof createAdminClient>;
  uid: string | null; // usuário do sistema
  colabId: string | null; // colaborador (app pessoal)
  nome: string | null;
  token: string | null; // token do colaborador (pra voltar pro /eu)
  viaColab: boolean;
  avulso?: boolean; // garçom avulso (link da noite): não tem app pessoal pra voltar
  podeGarcom: boolean; // pode abrir as TELAS do garçom
};

// Colaborador válido pelo cookie (ou null).
export async function colaboradorGarcom(): Promise<{ id: string; nome: string; token: string; avulso: boolean } | null> {
  const jar = await cookies();
  const valor = jar.get(COOKIE_GARCOM)?.value ?? "";
  const token = tokenDoValor(valor);
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, nome, token, garcom_ate, pin")
    .eq("token", token)
    .eq("ativo", true)
    .eq("faz_garcom", true)
    .maybeSingle();
  const c = data as { id: string; nome: string; token: string; garcom_ate: string | null; pin: string | null } | null;
  if (!c) return null;
  if (!cookieGarcomConfere(chave(), valor, c.token, c.pin)) return null;
  // Garçom avulso (link da noite, migration 0249): só até o fim do link.
  if (c.garcom_ate && new Date(c.garcom_ate).getTime() <= Date.now()) return null;
  return { id: c.id, nome: c.nome, token: c.token, avulso: !!c.garcom_ate };
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
    // Celular logado no sistema com um usuário SEM garçom (ex.: "Forno") e a
    // pessoa entrou pelo "Modo garçom" do app dela: vale o cookie do app.
    // Antes o login de outro usuário ganhava e mandava pra tela inicial.
    if (!podeAcessar("/garcom", admin, permissoes)) {
      const colab = await colaboradorGarcom();
      if (colab) return { db: createAdminClient(), uid: null, colabId: colab.id, nome: colab.nome, token: colab.token, viaColab: true, avulso: colab.avulso, podeGarcom: true };
    }
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
  return { db: createAdminClient(), uid: null, colabId: colab.id, nome: colab.nome, token: colab.token, viaColab: true, avulso: colab.avulso, podeGarcom: true };
}

// Client de banco pra ações que o garçom (logado OU por cookie) pode usar.
export async function dbGarcomOuUsuario() {
  const s = await sessaoGarcom();
  if (s) return s.db;
  return (await createClient()) as unknown as ReturnType<typeof createAdminClient>;
}
