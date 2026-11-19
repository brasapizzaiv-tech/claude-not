import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDaEmpresa } from "@/lib/supabase/admin-empresa";
import { rodarBuscaSefaz, type ConfigSefaz } from "@/lib/sefaz/busca";
import { marcarSinal } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

// Busca automática de notas na SEFAZ pelo Vercel Cron, de 10 em 10 minutos a
// partir do :03 (vercel.json). A trava de 1 hora decide: quase todas as rodadas
// só leem a trava e saem, e a busca acontece uma vez por hora, sem perder a vez
// por 1 segundo (NFE-05) nem disparar junto com a busca esperta do :00 (CRN-06).
// Protegida pelo CRON_SECRET (o Vercel envia no cabeçalho Authorization).
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // Uma configuração por empresa (cada uma com o certificado dela). Antes era
  // `limit(1)`: com dois restaurantes no banco, só o primeiro buscava nota.
  const admin = createAdminClient();
  const { data } = await admin.from("config_sefaz").select("*").not("cert_pfx", "is", null).order("empresa_id");
  const cfgs = (data as ConfigSefaz[] | null) ?? [];
  if (!cfgs.length) return NextResponse.json({ erro: "sem configuração" });

  const resultados = [];
  for (const cfg of cfgs) {
    // Batimento: marca que o cron horário realmente rodou.
    await admin.from("config_sefaz").update({ cron_hora_em: new Date().toISOString() }).eq("id", cfg.id);
    await marcarSinal("rotina:sefaz-hora", true, null);
    // As notas que chegam entram presas à empresa dona do certificado.
    const db = cfg.empresa_id ? adminDaEmpresa(cfg.empresa_id, admin) : admin;
    const r = await rodarBuscaSefaz(db, cfg);
    resultados.push({ empresa: cfg.empresa_id, ok: !r.erro, ...r });
  }
  if (resultados.length === 1) return NextResponse.json(resultados[0]);
  return NextResponse.json({ ok: resultados.every((r) => r.ok), resultados });
}
