import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepararAgendados } from "@/lib/delivery-agendados";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De 5 em 5 min (vercel.json): pedido agendado entra em preparo e imprime na
// cozinha quando falta o tempo de preparo pro horário marcado.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return rodarRotina("rotina:delivery-agendados", async () => {
    const r = await prepararAgendados(createAdminClient());
    return {
      ok: r.erros.length === 0,
      detalhe: `${r.impressos} agendado(s) mandado(s) pra cozinha${r.erros.length ? `; ${r.erros.length} erro(s)` : ""}`,
      resposta: { ok: true, ...r },
    };
  });
}
