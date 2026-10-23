"use server";

// Entrada do garçom AVULSO (migration 0249): confere o link da noite, cria (ou
// reaproveita pelo nome) um colaborador esporádico marcado como garçom, com
// acesso até o fim do link, e grava o mesmo cookie do "Modo garçom" do app.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_GARCOM } from "@/lib/garcom-auth";

export async function conviteValido(token: string) {
  if (!/^[0-9a-f]{20}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("garcom_convites")
    .select("empresa_id, valido_ate, ativo")
    .eq("token", token)
    .maybeSingle();
  const c = data as { empresa_id: string; valido_ate: string; ativo: boolean } | null;
  if (!c || !c.ativo || new Date(c.valido_ate).getTime() <= Date.now()) return null;
  return c;
}

export async function entrarGarcomAvulso(token: string, nomeDigitado: string) {
  const nome = nomeDigitado.replace(/\s+/g, " ").trim().slice(0, 40);
  if (nome.length < 2) return { ok: false as const, mensagem: "Digite o seu nome." };
  const conv = await conviteValido(token);
  if (!conv) return { ok: false as const, mensagem: "Este link não vale mais. Peça um novo no caixa." };
  const admin = createAdminClient();

  // Mesmo nome de um avulso de outra noite: reaproveita (não enche o cadastro).
  const { data: ja } = await admin
    .from("colaboradores")
    .select("id, token")
    .eq("empresa_id", conv.empresa_id)
    .ilike("nome", nome)
    .not("garcom_ate", "is", null)
    .limit(1)
    .maybeSingle();
  let colabToken: string;
  if (ja) {
    colabToken = ja.token as string;
    await admin.from("colaboradores").update({ ativo: true, faz_garcom: true, garcom_ate: conv.valido_ate }).eq("id", ja.id);
  } else {
    colabToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const { error } = await admin.from("colaboradores").insert({
      empresa_id: conv.empresa_id,
      nome,
      token: colabToken,
      esporadico: true,
      faz_garcom: true,
      faz_contagem: false,
      turno: "noite",
      vinculo: "freelance",
      recebe_10: false,
      garcom_ate: conv.valido_ate,
    });
    if (error) return { ok: false as const, mensagem: "Não consegui entrar: " + error.message };
  }

  const h = await headers();
  const https = (h.get("x-forwarded-proto") ?? "https") === "https";
  const jar = await cookies();
  jar.set(COOKIE_GARCOM, colabToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: Math.max(60, Math.floor((new Date(conv.valido_ate).getTime() - Date.now()) / 1000)),
  });
  redirect("/garcom");
}
