import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

// Lista as etiquetas pendentes de impressão (para o agente do PC central).
export async function GET(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("etiquetas")
    .select("id, impressoras(nome, impressora_windows)")
    .not("impressao_solicitada_em", "is", null)
    .is("impresso_em", null)
    .order("impressao_solicitada_em", { ascending: true })
    .limit(50);

  type Imp = { nome: string; impressora_windows: string | null };
  type Row = { id: string; impressoras: Imp | Imp[] | null };
  const jobs = ((data as unknown as Row[]) ?? []).map((e) => {
    const imp = Array.isArray(e.impressoras) ? e.impressoras[0] : e.impressoras;
    return { id: e.id, impressora: imp?.nome ?? null, printer: imp?.impressora_windows ?? null };
  });
  return Response.json({ jobs });
}
