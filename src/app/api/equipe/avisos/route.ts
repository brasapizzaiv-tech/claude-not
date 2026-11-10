import { NextResponse, type NextRequest } from "next/server";
import { avisosDaManha } from "@/lib/push-avisos";
import { rodarRotina } from "@/lib/saude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resumo da manhã no celular da equipe (app Motelli Equipe): lembretes do dia
// e pedidos que chegam hoje (quem faz contagem). Todo dia às 08:00 de
// Brasília (vercel.json "0 11 * * *", que é UTC). Protegida pelo CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return rodarRotina("rotina:avisos-manha", async () => {
    const r = await avisosDaManha();
    return { ok: true, detalhe: r.jaEnviado ? "já tinha saído hoje" : `${r.enviados} aviso(s) para ${r.pessoas} pessoa(s)`, resposta: r };
  });
}
