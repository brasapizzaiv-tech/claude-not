import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarBuscaSefaz, type ConfigSefaz } from "@/lib/sefaz/busca";

// Busca automática de notas na SEFAZ, disparada 1x por dia pelo Vercel Cron.
// Protegida pelo CRON_SECRET (o Vercel envia no cabeçalho Authorization).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  // Aceita o segredo pelo cabeçalho (Vercel Cron) ou por ?key= (pinger externo).
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
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

  // Batimento: marca que o cron horário realmente rodou.
  await admin
    .from("config_sefaz")
    .update({ cron_hora_em: new Date().toISOString() })
    .eq("id", cfg.id);

  const r = await rodarBuscaSefaz(admin, cfg);
  return NextResponse.json({ ok: !r.erro, ...r });
}
