import { NextResponse, type NextRequest } from "next/server";
import { rodarDisparos } from "@/lib/whatsapp-marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Campanhas e gatilhos do WhatsApp: roda a cada 5 minutos (vercel.json).
// Protegida pelo CRON_SECRET, igual às outras rotinas.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const r = await rodarDisparos();
  return NextResponse.json(r);
}
