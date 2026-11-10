import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apaga as posições dos entregadores com mais de 90 dias. É o prazo que a
// política de privacidade do Motelli Entregador promete, então tem que ser
// cumprido por máquina, não por lembrança. O rastro que interessa é o do dia;
// 90 dias sobra pra qualquer acerto ou conferência.
//
// Roda uma vez por dia (vercel.json), protegida pelo CRON_SECRET como as outras.
const DIAS = 90;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  return rodarRotina("rotina:entrega-limpar", async () => {
    const limite = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await createAdminClient()
      .from("entregador_posicoes")
      .delete({ count: "exact" })
      .lt("em", limite);
    return {
      ok: !error,
      detalhe: error ? error.message : `${count ?? 0} posições apagadas`,
      resposta: { ok: !error, apagadas: count ?? 0, antesDe: limite },
    };
  });
}
