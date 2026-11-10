import { createAdminClient } from "@/lib/supabase/admin";
import { empresaDoAgente } from "@/lib/impressao-agente";

// O agente avisa que está online e manda a lista de impressoras do PC.
export async function POST(req: Request) {
  // O token do agente diz de qual loja é este PC.
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return new Response("nao autorizado", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { hostname?: string; printers?: string[]; versao?: string; rodada_ha_ms?: number | null };
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    hostname: body.hostname ?? null,
    printers: Array.isArray(body.printers) ? body.printers : [],
    visto_em: new Date().toISOString(),
  };
  // Versão do agente (AGT-07) e hora da última rodada COMPLETA da fila (AGT-03):
  // o sinal de vida tem relógio próprio, então o agente pode estar travado e
  // ainda mandar sinal. O agente antigo não manda: fica como estava.
  if (typeof body.versao === "string" && body.versao) patch.versao = body.versao.slice(0, 20);
  // O agente manda há quanto tempo foi a rodada (pelo relógio dele) e o servidor
  // converte pro relógio daqui. Sem rodada ainda (acabou de ligar): null.
  if (typeof body.rodada_ha_ms === "number" && Number.isFinite(body.rodada_ha_ms) && body.rodada_ha_ms >= 0)
    patch.rodada_em = new Date(Date.now() - body.rodada_ha_ms).toISOString();
  else if (body.rodada_ha_ms === null) patch.rodada_em = null;
  const { error } = await admin.from("impressao_config").update(patch).eq("empresa_id", empresaId);
  if (error) {
    // Nunca deixar o sinal de vida parar por causa de um campo novo.
    await admin.from("impressao_config").update({ hostname: patch.hostname, printers: patch.printers, visto_em: patch.visto_em }).eq("empresa_id", empresaId);
  }
  return Response.json({ ok: true });
}
