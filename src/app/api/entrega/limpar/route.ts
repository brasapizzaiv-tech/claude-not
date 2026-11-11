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
// Também apaga da fila de impressão o que já foi impresso há mais de 60 dias.
//
// Roda uma vez por dia (vercel.json), protegida pelo CRON_SECRET como as outras.
const DIAS = 90;
const DIAS_FILA = 60;

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
    // SEC-19: a fila de impressão guarda tudo o que já saiu (~150 por dia).
    // O que foi IMPRESSO há mais de 60 dias sai; com erro ou esperando fica.
    const limiteFila = new Date(Date.now() - DIAS_FILA * 24 * 60 * 60 * 1000).toISOString();
    const { error: errFila, count: nFila } = await createAdminClient()
      .from("impressao_fila")
      .delete({ count: "exact" })
      .not("impresso_em", "is", null)
      .lt("impresso_em", limiteFila);
    return {
      ok: !error && !errFila,
      detalhe: error ? error.message : errFila ? `fila de impressão: ${errFila.message}` : `${count ?? 0} posições e ${nFila ?? 0} impressões antigas apagadas`,
      resposta: { ok: !error && !errFila, apagadas: count ?? 0, impressoesApagadas: nFila ?? 0, antesDe: limite },
    };
  });
}
