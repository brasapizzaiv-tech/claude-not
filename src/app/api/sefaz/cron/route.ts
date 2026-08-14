import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarBuscaSefaz, type ConfigSefaz } from "@/lib/sefaz/busca";

// Busca automática de notas na SEFAZ, disparada 1x por dia pelo Vercel Cron.
// Protegida pelo CRON_SECRET (o Vercel envia no cabeçalho Authorization).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("config_sefaz")
    .select("*")
    .limit(1)
    .maybeSingle();
  const cfg = data as ConfigSefaz | null;
  if (!cfg) return NextResponse.json({ erro: "sem configuração" });

  const r = await rodarBuscaSefaz(admin, cfg);
  return NextResponse.json({ ok: !r.erro, ...r });
}
