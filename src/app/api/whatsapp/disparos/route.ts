import { NextResponse, type NextRequest } from "next/server";
import { rodarDisparos } from "@/lib/whatsapp-marketing";
import { rodarRotina } from "@/lib/saude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Campanhas e gatilhos do WhatsApp: roda a cada 5 minutos (vercel.json).
// Protegida pelo CRON_SECRET, igual às outras rotinas.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return rodarRotina("rotina:whatsapp-disparos", async () => {
    const r = await rodarDisparos();
    // Sem WhatsApp configurado não é falha da rotina (a conta aparece à parte).
    const n = r as Record<string, unknown>;
    const detalhe = typeof n.motivo === "string" ? n.motivo : `${n.gatilhos ?? 0} gatilho(s), ${n.campanhas ?? 0} campanha(s), ${n.falhas ?? 0} falha(s)`;
    return { ok: true, detalhe, resposta: r };
  });
}
