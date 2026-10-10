import { NextResponse, type NextRequest } from "next/server";
import { empresasKernAtivas, gerarPedidosKern } from "@/lib/kern-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pedido de delivery da Kern: segunda a sábado às 08:35 de Brasília
// (vercel.json "35 11 * * 1-6", que é UTC). Os pedidos de marmita fecham às
// 08:30. Protegida pelo CRON_SECRET, igual às outras rotinas.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const saida: Record<string, unknown> = { dia };
  for (const empresaId of await empresasKernAtivas()) {
    saida[empresaId] = await gerarPedidosKern(empresaId, dia);
  }
  return NextResponse.json(saida);
}
