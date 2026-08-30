import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

// O agente avisa que está online e manda a lista de impressoras do PC.
export async function POST(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { hostname?: string; printers?: string[] };
  const admin = createAdminClient();
  await admin
    .from("impressao_config")
    .update({
      hostname: body.hostname ?? null,
      printers: Array.isArray(body.printers) ? body.printers : [],
      visto_em: new Date().toISOString(),
    })
    .eq("id", 1);
  return Response.json({ ok: true });
}
