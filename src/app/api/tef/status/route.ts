import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { empresaAtualId } from "@/lib/empresa";

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

  // O nome do terminal ("CAIXA1") pode repetir entre restaurantes, então a
  // chave virou empresa + terminal (migration 0193). Aqui a empresa vem do
  // ENDEREÇO pra onde o agente manda o batimento — cada loja aponta pro
  // endereço dela. O jeito definitivo é o token do agente carregar a loja
  // (decisão 6 do multiempresa: instalador que pede um código); até lá, o
  // endereço resolve.
  const empresaId = await empresaAtualId();
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
