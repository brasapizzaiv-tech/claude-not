import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

// Marca um item da fila como impresso (chamado pelo agente após imprimir).
export async function POST(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response("id ausente", { status: 400 });
  const admin = createAdminClient();
  await admin.from("impressao_fila").update({ impresso_em: new Date().toISOString() }).eq("id", id);
  return Response.json({ ok: true });
}
