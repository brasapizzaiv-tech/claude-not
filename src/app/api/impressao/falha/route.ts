import { createAdminClient } from "@/lib/supabase/admin";
import { empresaDoAgente } from "@/lib/impressao-agente";

// O agente avisa que um item da fila falhou ao imprimir (AGT-05). Antes a falha
// ficava só no log do PC e o item voltava sem limite. Agora conta as tentativas
// e guarda o último erro; depois de 5 a fila para de entregar e a Saúde do
// sistema mostra o item com "Tentar de novo" e "Descartar".
export async function POST(req: Request) {
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return new Response("nao autorizado", { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { id?: unknown; erro?: unknown };
  const id = typeof corpo.id === "string" ? corpo.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("id ausente", { status: 400 });
  const erro = String(corpo.erro ?? "falhou").slice(0, 300);
  const admin = createAdminClient();
  const { data } = await admin
    .from("impressao_fila")
    .select("tentativas")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!data) return Response.json({ ok: false }, { status: 404 });
  const tentativas = (Number((data as { tentativas?: number }).tentativas) || 0) + 1;
  const { error } = await admin
    .from("impressao_fila")
    .update({ tentativas, ultimo_erro: erro, erro_em: new Date().toISOString() })
    .eq("id", id)
    .eq("empresa_id", empresaId);
  if (error) return Response.json({ ok: false }, { status: 500 });
  return Response.json({ ok: true, tentativas });
}
