import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { processarNfcePendentes } from "@/lib/fiscal/pendentes";

// Lista os documentos pendentes de impressão (fila genérica) para o agente.
// Cada item entregue fica RESERVADO por 90 s (entregue_em): se dois agentes
// estiverem rodando, o segundo não pega o mesmo item — acabou a impressão em
// dobro. Se o agente cair antes de dar baixa, o item volta depois dos 90 s.
export async function GET(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });

  // O agente consulta esta rota a cada 3 s — é o "relógio" do sistema. Aqui
  // também saem as notas automáticas cujo prazo de espera venceu (ninguém
  // precisa estar com a tela do caixa aberta).
  try { await processarNfcePendentes(); } catch { /* nota não pode travar a impressão */ }

  const admin = createAdminClient();
  const limite = new Date(Date.now() - 90_000).toISOString();
  const { data } = await admin
    .from("impressao_fila")
    .select("id, tipo, impressoras(nome, impressora_windows)")
    .is("impresso_em", null)
    .or(`entregue_em.is.null,entregue_em.lt.${limite}`)
    .order("solicitado_em", { ascending: true })
    .limit(50);

  type Imp = { nome: string; impressora_windows: string | null };
  type Row = { id: string; tipo: string; impressoras: Imp | Imp[] | null };
  const jobs = ((data as unknown as Row[]) ?? []).map((e) => {
    const imp = Array.isArray(e.impressoras) ? e.impressoras[0] : e.impressoras;
    return {
      id: e.id,
      tipo: e.tipo,
      impressora: imp?.nome ?? null,
      printer: imp?.impressora_windows ?? null,
      url: `/api/impressao/documento/${e.id}`,
      // Todo documento que o sistema gera já sai na medida da impressora, então
      // imprime 1:1. Quem manda é o servidor: assim dá pra ajustar sem trocar o
      // agente de novo (o agente antigo ignora e usa o padrão dele).
      escala: "noscale" as const,
      orientacao: "portrait" as const,
    };
  });
  if (jobs.length > 0) {
    await admin.from("impressao_fila").update({ entregue_em: new Date().toISOString() }).in("id", jobs.map((j) => j.id));
  }
  return Response.json({ jobs });
}
