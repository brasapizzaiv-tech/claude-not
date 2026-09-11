import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

export const runtime = "nodejs";

// Heartbeat do Agente TEF (um por PC de caixa): mostra no sistema quais
// terminais estão com TEF ligado. Usa o mesmo token dos outros agentes.
export async function POST(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  let body: { hostname?: string; terminal?: string; versao?: string; gerenciador?: boolean; etapa?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const terminal = String(body.terminal ?? "").slice(0, 20);
  if (!terminal) return Response.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("tef_status").upsert(
    {
      terminal,
      hostname: String(body.hostname ?? "").slice(0, 100) || null,
      versao: String(body.versao ?? "").slice(0, 20) || null,
      gerenciador: !!body.gerenciador,
      etapa: String(body.etapa ?? "").slice(0, 40) || null,
      visto_em: new Date().toISOString(),
    },
    { onConflict: "terminal" },
  );
  return Response.json({ ok: true });
}
