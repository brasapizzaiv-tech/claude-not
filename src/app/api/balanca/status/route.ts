import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

export const runtime = "nodejs";

// Heartbeat do agente da balança: hostname + tamanho da fila offline.
// O painel usa isso pra ALERTAR pesagens não sincronizadas (nunca em silêncio).
export async function POST(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });

  let body: { hostname?: string; fila_pendente?: number; versao?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("balanca_status")
    .upsert({
      id: 1,
      hostname: (body.hostname ?? "").slice(0, 100) || null,
      fila_pendente: Math.max(0, Math.round(Number(body.fila_pendente) || 0)),
      versao: (body.versao ?? "").slice(0, 20) || null,
      visto_em: new Date().toISOString(),
    }, { onConflict: "id" });

  return Response.json({ ok: true });
}
