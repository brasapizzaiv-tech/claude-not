import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { gerarEtiquetaPdf } from "@/lib/etiqueta-pdf";

export const runtime = "nodejs";

// Devolve a etiqueta pronta em PDF (55x55mm) para o agente imprimir.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("etiquetas")
    .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade, conservacao, quantidade, unidade")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new Response("nao encontrada", { status: 404 });

  const baseUrl = new URL(req.url).origin;
  const pdf = await gerarEtiquetaPdf(
    {
      id: data.id as string,
      numero: data.numero as number,
      produto: data.produto_nome as string,
      colaborador: (data.colaborador_nome as string) ?? null,
      manipuladoEm: data.manipulado_em as string,
      validade: (data.validade as string) ?? null,
      conservacao: (data.conservacao as string) ?? null,
      quantidade: (data.quantidade as number) ?? null,
      unidade: (data.unidade as string) ?? null,
    },
    baseUrl,
  );
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
