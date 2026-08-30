import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { gerarEtiquetaPdf } from "@/lib/etiqueta-pdf";
import { gerarComandaPdf } from "@/lib/comanda-pdf";

export const runtime = "nodejs";

// Gera o PDF de um item da fila (etiqueta ou comanda) para o agente imprimir.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const baseUrl = new URL(req.url).origin;

  const { data: job } = await admin.from("impressao_fila").select("tipo, ref_id").eq("id", id).maybeSingle();
  if (!job) return new Response("nao encontrado", { status: 404 });

  let pdf: Buffer;

  if (job.tipo === "etiqueta") {
    const { data } = await admin
      .from("etiquetas")
      .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade, conservacao, quantidade, unidade")
      .eq("id", job.ref_id)
      .maybeSingle();
    if (!data) return new Response("etiqueta nao encontrada", { status: 404 });
    pdf = await gerarEtiquetaPdf(
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
  } else {
    // comanda: itens de um lançamento (ref_id = lancamento_id)
    const { data: itens } = await admin
      .from("pdv_comanda_itens")
      .select("descricao, qtd, comanda_id, criado_por, criado_em")
      .eq("lancamento_id", job.ref_id)
      .order("criado_em");
    if (!itens || itens.length === 0) return new Response("comanda vazia", { status: 404 });

    const primeiro = itens[0] as { comanda_id: string; criado_por: string | null; criado_em: string };
    const [{ data: com }, { data: prof }] = await Promise.all([
      admin.from("pdv_comandas").select("numero, mesa").eq("id", primeiro.comanda_id).maybeSingle(),
      primeiro.criado_por
        ? admin.from("profiles").select("nome").eq("id", primeiro.criado_por).maybeSingle()
        : Promise.resolve({ data: null as { nome: string } | null }),
    ]);
    const hora = new Date(primeiro.criado_em).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
    });
    pdf = await gerarComandaPdf({
      mesa: (com?.mesa as string) || "Balcão",
      numero: (com?.numero as number) ?? null,
      hora,
      garcom: (prof?.nome as string) ?? null,
      observacao: null,
      itens: (itens as { descricao: string; qtd: number }[]).map((i) => ({ qtd: Number(i.qtd), descricao: i.descricao })),
    });
  }

  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
