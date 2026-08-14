import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Verifica e dispara os agendamentos de contagem que estão na hora.
// Protegida pelo CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("contagem_rodar_agendamentos");
  return NextResponse.json({ ok: !error, ...(data ?? {}), erro: error?.message });
}
