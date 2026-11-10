import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conferirNotasPendentes } from "@/lib/fiscal/conferir-notas";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Confere na Focus as notas que saíram num estado que não é o final
// (contingência offline, processando, enviando, cancelando) — NFE-01.
// De 30 em 30 min (vercel.json), protegida pelo CRON_SECRET no cabeçalho.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return rodarRotina("rotina:fiscal-conferir", async () => {
    const r = await conferirNotasPendentes(createAdminClient());
    return { ok: true, detalhe: JSON.stringify(r).slice(0, 200), resposta: { ok: true, ...r } };
  });
}
