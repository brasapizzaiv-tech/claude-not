import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_GARCOM } from "@/lib/garcom-auth";

// "Modo garçom" do app pessoal: confere PIN (cookie eu_{token}) e a marcação
// faz_garcom, grava o cookie do garçom e manda pra /garcom.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origem = new URL(req.url).origin;
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  const admin = createAdminClient();

  const { data: colab } = await admin
    .from("colaboradores")
    .select("id, pin, faz_garcom, ativo")
    .eq("token", token)
    .maybeSingle();
  const c = colab as { id: string; pin: string | null; faz_garcom: boolean; ativo: boolean } | null;
  const ok = !!c && c.ativo && c.faz_garcom && (!c.pin || c.pin === pin);
  if (!ok) return NextResponse.redirect(`${origem}/eu/${token}?garcom=negado`);

  const res = NextResponse.redirect(`${origem}/garcom`);
  res.cookies.set(COOKIE_GARCOM, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: origem.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
