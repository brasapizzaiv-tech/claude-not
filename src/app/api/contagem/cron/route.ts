import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

// Verifica e dispara os agendamentos de contagem que estão na hora.
// Protegida pelo CRON_SECRET.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  return rodarRotina("rotina:contagem", async () => {
    const { data, error } = await createAdminClient().rpc("contagem_rodar_agendamentos");
    return { ok: !error, detalhe: error?.message, resposta: { ok: !error, ...(data ?? {}) } };
  });
}
