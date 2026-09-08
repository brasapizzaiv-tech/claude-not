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

  // Devolve o que o agente precisa pra numerar: número inicial da balança e
  // quando o caixa atual abriu (muda → o agente reinicia a numeração).
  const [{ data: cfg }, { data: caixa }] = await Promise.all([
    admin.from("pdv_config").select("valor").eq("chave", "numero_inicial_balanca").maybeSingle(),
    admin.from("pdv_caixas").select("aberto_em").is("fechado_em", null).order("aberto_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return Response.json({
    ok: true,
    numero_inicial_balanca: Number((cfg as { valor?: string } | null)?.valor) || 200,
    caixa_aberto_em: (caixa as { aberto_em?: string } | null)?.aberto_em ?? null,
  });
}
