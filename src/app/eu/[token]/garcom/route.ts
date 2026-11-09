import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinConfere } from "@/lib/pin-colaborador";
import { COOKIE_GARCOM, valorCookieGarcom } from "@/lib/garcom-auth";

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
    .select("id, pin, faz_garcom, ativo, garcom_ate")
    .eq("token", token)
    .maybeSingle();
  const c = colab as { id: string; pin: string | null; faz_garcom: boolean; ativo: boolean; garcom_ate: string | null } | null;
  // Garçom avulso com o link da noite vencido não renova (senão o /garcom
  // mandaria pra cá de novo, sem fim).
  const vencido = !!c?.garcom_ate && new Date(c.garcom_ate).getTime() <= Date.now();
  const ok = !!c && c.ativo && c.faz_garcom && !vencido && (!c.pin || (await pinConfere(token, pin)));
  if (!ok) return NextResponse.redirect(vencido ? `${origem}/login?next=/garcom` : `${origem}/eu/${token}?garcom=negado`);

  const res = NextResponse.redirect(`${origem}/garcom`);
  res.cookies.set(COOKIE_GARCOM, valorCookieGarcom(token, c!.pin), {
    httpOnly: true,
    sameSite: "lax",
    secure: origem.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
