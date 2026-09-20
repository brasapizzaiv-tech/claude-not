import { createAdminClient } from "@/lib/supabase/admin";
import { empresaDoAgente } from "@/lib/impressao-agente";

export const runtime = "nodejs";

// Heartbeat do Agente TEF (um por PC de caixa): mostra no sistema quais
// terminais estão com TEF ligado. Usa o mesmo token dos outros agentes.
export async function POST(req: Request) {
  let body: { hostname?: string; terminal?: string; versao?: string; gerenciador?: boolean; etapa?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const terminal = String(body.terminal ?? "").slice(0, 20);
  if (!terminal) return Response.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();

  // O nome do terminal ("CAIXA1") pode repetir entre restaurantes, então a
  // chave é empresa + terminal. A empresa vem do TOKEN do agente, que é o
  // mesmo da estação de impressão e já diz de qual loja é o PC.
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return Response.json({ ok: false, erro: "empresa nao identificada" }, { status: 400 });

  await admin.from("tef_status").upsert(
    {
      empresa_id: empresaId,
      terminal,
      hostname: String(body.hostname ?? "").slice(0, 100) || null,
      versao: String(body.versao ?? "").slice(0, 20) || null,
      gerenciador: !!body.gerenciador,
      etapa: String(body.etapa ?? "").slice(0, 40) || null,
      visto_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id,terminal" },
  );
  return Response.json({ ok: true });
}
