import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarRotina } from "@/lib/saude";

// Verifica e dispara os agendamentos de contagem que estão na hora.
// Protegida pelo CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  // Aceita o segredo pelo cabeçalho (Vercel Cron) ou por ?key= (pinger externo).
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  return rodarRotina("rotina:contagem", async () => {
    const { data, error } = await createAdminClient().rpc("contagem_rodar_agendamentos");
    return { ok: !error, detalhe: error?.message, resposta: { ok: !error, ...(data ?? {}) } };
  });
}
