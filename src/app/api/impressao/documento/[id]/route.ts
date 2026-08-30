import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { gerarEtiquetaPdf } from "@/lib/etiqueta-pdf";
import { gerarComandaPdf, type ComandaConfig } from "@/lib/comanda-pdf";
import { gerarTestePdf } from "@/lib/teste-pdf";

export const runtime = "nodejs";

// Gera o PDF de um item da fila (etiqueta ou comanda) para o agente imprimir.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const baseUrl = new URL(req.url).origin;

  const { data: job } = await admin.from("impressao_fila").select("tipo, ref_id, impressora_id").eq("id", id).maybeSingle();
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
  } else if (job.tipo === "teste") {
    const { data: imp } = await admin.from("impressoras").select("nome, comanda_config").eq("id", job.ref_id).maybeSingle();
    const largura = ((imp?.comanda_config as { largura?: number } | null)?.largura) ?? 80;
    pdf = await gerarTestePdf((imp?.nome as string) ?? "Impressora", largura);
  } else {
    // comanda: itens de um lançamento (ref_id = lancamento_id), filtrados pela
    // via (categorias) da impressora.
    const { data: itensRaw } = await admin
      .from("pdv_comanda_itens")
      .select("descricao, qtd, preco_unit, comanda_id, criado_por, criado_em, item_id, pdv_itens(categoria)")
      .eq("lancamento_id", job.ref_id)
      .order("criado_em");
    const itens = (itensRaw as unknown as {
      descricao: string; qtd: number; preco_unit: number | null; comanda_id: string; criado_por: string | null; criado_em: string; item_id: string | null;
      pdv_itens: { categoria: string | null } | { categoria: string | null }[] | null;
    }[]) ?? [];
    const catDe = (it: (typeof itens)[number]) => {
      const p = Array.isArray(it.pdv_itens) ? it.pdv_itens[0] : it.pdv_itens;
      return p?.categoria ?? undefined;
    };
    if (itens.length === 0) return new Response("comanda vazia", { status: 404 });

    const { data: imp } = job.impressora_id
      ? await admin.from("impressoras").select("nome, comanda_produtos, comanda_config").eq("id", job.impressora_id).maybeSingle()
      : { data: null as { nome: string; comanda_produtos: string[] | null; comanda_config: Record<string, unknown> | null } | null };
    const prods = (imp?.comanda_produtos as string[] | null) ?? null;
    const config = (imp?.comanda_config as ComandaConfig | null) ?? null;
    const filtrados = prods === null ? itens : itens.filter((it) => it.item_id !== null && prods.includes(it.item_id));
    if (filtrados.length === 0) return new Response("sem itens para esta via", { status: 404 });

    const primeiro = itens[0];
    const [{ data: com }, { data: prof }] = await Promise.all([
      admin.from("pdv_comandas").select("numero, mesa").eq("id", primeiro.comanda_id).maybeSingle(),
      primeiro.criado_por
        ? admin.from("profiles").select("nome").eq("id", primeiro.criado_por).maybeSingle()
        : Promise.resolve({ data: null as { nome: string } | null }),
    ]);
    const hora = new Date(primeiro.criado_em).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
    });
    pdf = await gerarComandaPdf(
      {
        via: (imp?.nome as string) ?? null,
        mesa: (com?.mesa as string) || "Balcão",
        numero: (com?.numero as number) ?? null,
        hora,
        garcom: (prof?.nome as string) ?? null,
        observacao: null,
        itens: filtrados.map((i) => ({ qtd: Number(i.qtd), descricao: i.descricao, preco: i.preco_unit != null ? Number(i.preco_unit) : undefined, categoria: catDe(i) })),
      },
      config,
    );
  }

  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
