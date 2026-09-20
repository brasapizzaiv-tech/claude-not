import { createAdminClient } from "@/lib/supabase/admin";
import { empresaDoAgente } from "@/lib/impressao-agente";

// Marca um item da fila como impresso (chamado pelo agente após imprimir).
export async function POST(req: Request) {
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return new Response("nao autorizado", { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response("id ausente", { status: 400 });
  const admin = createAdminClient();
  await admin
    .from("impressao_fila")
    .update({ impresso_em: new Date().toISOString() })
    .eq("id", id)
    .eq("empresa_id", empresaId);
  return Response.json({ ok: true });
}
