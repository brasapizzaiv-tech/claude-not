import { NextResponse, type NextRequest } from "next/server";
import { analisarPendentes } from "@/lib/cardapio-ia";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Leitura dos pratos do cardápio pela IA (migration 0318): ingrediente de
// destaque, preparo e ideias pra sobra. Roda de 10 em 10 minutos
// (vercel.json); sem prato novo é só uma consulta vazia. Prato digitado na hora
// também é lido ao publicar. Protegida pelo CRON_SECRET.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return rodarRotina("rotina:cardapio-ia", async () => {
    const r = await analisarPendentes(200);
    return { ok: true, detalhe: `${r.lidos} prato(s) lido(s)${r.faltam ? `, faltam ${r.faltam}` : ""}`, resposta: r };
  });
}
