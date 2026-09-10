import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";
import { gerarEtiquetaPdf, type EtiquetaConfig } from "@/lib/etiqueta-pdf";
import { gerarComandaPdf, type ComandaConfig } from "@/lib/comanda-pdf";
import { gerarTestePdf } from "@/lib/teste-pdf";
import { gerarMarmitaPdf } from "@/lib/marmita-pdf";
import { gerarFechamentoPdf } from "@/lib/fechamento-pdf";
import { baixarXmlNfce, type FocusAmbiente } from "@/lib/fiscal/focus";
import { gerarNfceCupomPdf } from "@/lib/nfce-cupom-pdf";

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
    const [{ data }, { data: imp }] = await Promise.all([
      admin
        .from("etiquetas")
        .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade, conservacao, quantidade, unidade, tipo, categoria_nome, marca, lote, validade_original, sif, texto")
        .eq("id", job.ref_id)
        .maybeSingle(),
      job.impressora_id
        ? admin.from("impressoras").select("etiqueta_config").eq("id", job.impressora_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
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
        tipo: (data.tipo as string) ?? null,
        categoria: (data.categoria_nome as string) ?? null,
        marca: (data.marca as string) ?? null,
        lote: (data.lote as string) ?? null,
        validadeOriginal: (data.validade_original as string) ?? null,
        sif: (data.sif as string) ?? null,
        texto: (data.texto as string) ?? null,
      },
      baseUrl,
      ((imp as { etiqueta_config?: EtiquetaConfig | null } | null)?.etiqueta_config) ?? null,
    );
  } else if (job.tipo === "marmita") {
    // Etiqueta da marmita do convênio (Kern), no formato da impressora de etiquetas.
    const [{ data: ped }, { data: imp }, { data: cfgRows }] = await Promise.all([
      admin.from("mkt_pedidos").select("data, filial, cliente, matricula, pratos, proteina, salada").eq("id", job.ref_id).maybeSingle(),
      job.impressora_id
        ? admin.from("impressoras").select("etiqueta_config").eq("id", job.impressora_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("mkt_config").select("chave, valor").in("chave", ["nomeConvenio", "horaEntrega"]),
    ]);
    if (!ped) return new Response("pedido nao encontrado", { status: 404 });
    const cfg = Object.fromEntries((((cfgRows as { chave: string; valor: string }[]) ?? [])).map((r) => [r.chave, r.valor]));
    let pratos: string[] = [];
    try { const a = JSON.parse((ped.pratos as string) || "[]"); pratos = Array.isArray(a) ? a.map(String) : []; } catch {}
    const sal = ped.salada as string | null;
    pdf = await gerarMarmitaPdf(
      {
        convenio: cfg.nomeConvenio || "Kern",
        data: ped.data as string,
        horaEntrega: cfg.horaEntrega || null,
        filial: ped.filial as string,
        cliente: ped.cliente as string,
        matricula: (ped.matricula as string) || null,
        pratos,
        proteina: (ped.proteina as string) || null,
        salada: sal && sal !== "0" ? sal : null,
      },
      ((imp as { etiqueta_config?: EtiquetaConfig | null } | null)?.etiqueta_config) ?? null,
    );
  } else if (job.tipo === "teste_etiqueta") {
    // Etiqueta de exemplo com moldura na borda, no formato desta impressora.
    const { data: imp } = await admin.from("impressoras").select("etiqueta_config").eq("id", job.ref_id).maybeSingle();
    pdf = await gerarEtiquetaPdf(
      {
        id: "00000000-0000-0000-0000-000000000000",
        numero: 0,
        produto: "Etiqueta de teste",
        colaborador: "Calibração",
        manipuladoEm: new Date().toISOString(),
        validade: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        conservacao: "resfriado",
        quantidade: 1,
        unidade: "un",
        tipo: "manipulacao",
        categoria: "Teste",
      },
      baseUrl,
      ((imp as { etiqueta_config?: EtiquetaConfig | null } | null)?.etiqueta_config) ?? null,
      { moldura: true },
    );
  } else if (job.tipo === "nfce") {
    // Cupom da NFC-e montado por nós a partir do XML autorizado (ref_id =
    // nfce_emitidas.id). O "DANFE" do Focus para NFC-e é uma PÁGINA HTML — o
    // agente salvava como .pdf e a impressora não abria, e o cupom ficava preso
    // na fila tentando pra sempre.
    const [{ data: nota }, { data: impN }] = await Promise.all([
      admin.from("nfce_emitidas").select("url_danfe, url_xml, ambiente").eq("id", job.ref_id).maybeSingle(),
      job.impressora_id
        ? admin.from("impressoras").select("comanda_config").eq("id", job.impressora_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const origem = (nota?.url_xml as string) || (nota?.url_danfe as string) || "";
    if (!origem) return new Response("nota sem XML", { status: 404 });
    const { data: cfgRows } = await admin.from("config_fiscal").select("chave, valor").in("chave", ["emissor_token"]);
    const token = (cfgRows ?? []).find((r) => r.chave === "emissor_token")?.valor ?? "";
    const xml = await baixarXmlNfce({ token, ambiente: (nota?.ambiente as FocusAmbiente) || "producao" }, origem);
    if (!xml) return new Response("nao consegui baixar o XML da nota", { status: 502 });
    const largN = ((impN as { comanda_config?: { largura?: number } | null } | null)?.comanda_config?.largura) ?? 80;
    pdf = await gerarNfceCupomPdf(xml, largN);
  } else if (job.tipo === "fechamento") {
    // Cupom do fechamento de caixa (ref_id = pdv_caixas.id).
    const [{ data: cx }, { data: imp }, { data: cfgRows }] = await Promise.all([
      admin
        .from("pdv_caixas")
        .select("nome, saldo_inicial, aberto_em, fechado_em, dinheiro_contado, dinheiro_esperado, quebra, resumo, obs")
        .eq("id", job.ref_id)
        .maybeSingle(),
      job.impressora_id
        ? admin.from("impressoras").select("comanda_config").eq("id", job.impressora_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("pdv_config").select("valor").eq("chave", "nome_restaurante").maybeSingle(),
    ]);
    if (!cx) return new Response("caixa nao encontrado", { status: 404 });
    const r = (cx.resumo ?? {}) as {
      saldoInicial?: number;
      vendasPorForma?: Record<string, number>;
      totalVendas?: number;
      suprimentos?: number;
      sangrias?: number;
      operador?: string | null;
    };
    const largura = ((imp as { comanda_config?: { largura?: number } | null } | null)?.comanda_config?.largura) ?? 80;
    pdf = await gerarFechamentoPdf(
      {
        nome: ((cfgRows as { valor?: string } | null)?.valor) || "Brasa",
        caixaNome: (cx.nome as string) ?? null,
        abertoEm: (cx.aberto_em as string) ?? null,
        fechadoEm: (cx.fechado_em as string) ?? null,
        operador: r.operador ?? null,
        saldoInicial: Number(r.saldoInicial ?? cx.saldo_inicial ?? 0),
        vendasPorForma: Object.entries(r.vendasPorForma ?? {}).map(([f, v]) => [f, Number(v)] as [string, number]),
        totalVendas: Number(r.totalVendas ?? 0),
        suprimentos: Number(r.suprimentos ?? 0),
        sangrias: Number(r.sangrias ?? 0),
        esperado: Number(cx.dinheiro_esperado ?? 0),
        contado: Number(cx.dinheiro_contado ?? 0),
        quebra: Number(cx.quebra ?? 0),
        obs: (cx.obs as string) ?? null,
      },
      largura,
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
      .select("descricao, qtd, preco_unit, comanda_id, criado_por, criado_colab_id, criado_em, item_id, pdv_itens(categoria)")
      .eq("lancamento_id", job.ref_id)
      .order("criado_em");
    const itens = (itensRaw as unknown as {
      descricao: string; qtd: number; preco_unit: number | null; comanda_id: string; criado_por: string | null; criado_colab_id: string | null; criado_em: string; item_id: string | null;
      pdv_itens: { categoria: string | null } | { categoria: string | null }[] | null;
    }[]) ?? [];
    const catDe = (it: (typeof itens)[number]) => {
      const p = Array.isArray(it.pdv_itens) ? it.pdv_itens[0] : it.pdv_itens;
      return p?.categoria ?? undefined;
    };
    if (itens.length === 0) return new Response("comanda vazia", { status: 404 });

    const { data: imp } = job.impressora_id
      ? await admin.from("impressoras").select("nome, comanda_produtos, comanda_config, recebe_pizzas").eq("id", job.impressora_id).maybeSingle()
      : { data: null as { nome: string; comanda_produtos: string[] | null; comanda_config: Record<string, unknown> | null; recebe_pizzas: boolean | null } | null };
    const prods = (imp?.comanda_produtos as string[] | null) ?? null;
    const pizzas = !!(imp as { recebe_pizzas?: boolean | null } | null)?.recebe_pizzas;
    const config = (imp?.comanda_config as ComandaConfig | null) ?? null;
    // Via por produto: item da lista OU pizza montada (item_id nulo) se a impressora recebe pizzas.
    const filtrados = prods === null
      ? itens
      : itens.filter((it) => (it.item_id !== null && prods.includes(it.item_id)) || (it.item_id === null && pizzas));
    if (filtrados.length === 0) return new Response("sem itens para esta via", { status: 404 });

    const primeiro = itens[0];
    const [{ data: com }, { data: prof }] = await Promise.all([
      admin.from("pdv_comandas").select("numero, mesa").eq("id", primeiro.comanda_id).maybeSingle(),
      primeiro.criado_por
        ? admin.from("profiles").select("nome").eq("id", primeiro.criado_por).maybeSingle()
        : primeiro.criado_colab_id
          ? admin.from("colaboradores").select("nome").eq("id", primeiro.criado_colab_id).maybeSingle()
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
