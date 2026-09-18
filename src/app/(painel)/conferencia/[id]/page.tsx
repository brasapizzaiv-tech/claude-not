import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularDivergencias, notasSugeridas, type Db as DbConf } from "@/lib/conferencia-core";
import { ConferirClient, type ItemLinha, type NotaLigada, type NotaSugerida } from "./conferir-client";

export default async function ConferirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select(
      "id, data, status, observacoes, fornecedor_id, conf_colab_em, conf_colab_por, fornecedores(nome), cotacoes(descricao), pedido_itens(id, produto_id, qtd, preco_unit, qtd_recebida, preco_recebido, qtd_conf_colab, obs, produtos(nome, unidade))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  type Row = {
    id: string;
    data: string;
    status: string;
    observacoes: string | null;
    fornecedor_id: string | null;
    conf_colab_em: string | null;
    conf_colab_por: string | null;
    fornecedores: { nome?: string } | null;
    cotacoes: { descricao?: string } | null;
    pedido_itens: {
      id: string;
      produto_id: string | null;
      qtd: number;
      preco_unit: number | null;
      qtd_recebida: number | null;
      preco_recebido: number | null;
      qtd_conf_colab: number | null;
      obs: string | null;
      produtos: { nome?: string; unidade?: string } | null;
    }[];
  };
  const ped = data as unknown as Row;
  const db = supabase as unknown as DbConf;

  const [{ data: prodData }, { data: notaRow }, sugeridas, divergencias] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("notas_fiscais")
      .select("id, numero, valor, data_emissao, nota_itens(produto_id, descricao, qtd, valor_unit, fator)")
      .eq("pedido_id", id)
      .limit(1)
      .maybeSingle(),
    notasSugeridas(db, ped.fornecedor_id, ped.data),
    calcularDivergencias(db, id),
  ]);
  const produtos = (prodData as { id: string; nome: string }[]) ?? [];

  // Nota ligada: agrupa por produto (fator aplicado) pra mostrar ao lado do item.
  type NI = { produto_id: string | null; descricao: string | null; qtd: number; valor_unit: number | null; fator: number | null };
  const nota = notaRow as unknown as { id: string; numero: string | null; valor: number; data_emissao: string | null; nota_itens: NI[] } | null;
  const notaPorProduto = new Map<string, { qtd: number; valor: number }>();
  let notaSemVinculo = 0;
  for (const ni of nota?.nota_itens ?? []) {
    if (!ni.produto_id) { notaSemVinculo++; continue; }
    const f = Number(ni.fator ?? 1) || 1;
    const a = notaPorProduto.get(ni.produto_id) ?? { qtd: 0, valor: 0 };
    a.qtd += Number(ni.qtd) * f;
    a.valor += Number(ni.qtd) * Number(ni.valor_unit ?? 0);
    notaPorProduto.set(ni.produto_id, a);
  }
  const notaLigada: NotaLigada | null = nota
    ? { id: nota.id, numero: nota.numero, valor: Number(nota.valor), data_emissao: nota.data_emissao, itens: nota.nota_itens.length, semVinculo: notaSemVinculo }
    : null;

  const itens: ItemLinha[] = (ped.pedido_itens ?? [])
    .map((i) => {
      const n = i.produto_id ? notaPorProduto.get(i.produto_id) : undefined;
      return {
        id: i.id,
        nome: i.produtos?.nome ?? "—",
        unidade: i.produtos?.unidade ?? "",
        qtd: i.qtd,
        preco_unit: i.preco_unit,
        qtd_recebida: i.qtd_recebida,
        preco_recebido: i.preco_recebido,
        qtd_conf_colab: i.qtd_conf_colab,
        obs: i.obs,
        nota_qtd: n && n.qtd > 0 ? Math.round(n.qtd * 1000) / 1000 : null,
        nota_preco: n && n.qtd > 0 ? Math.round((n.valor / n.qtd) * 100) / 100 : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <ConferirClient
      pedidoId={ped.id}
      fornecedor={ped.fornecedores?.nome ?? "—"}
      cotacao={ped.cotacoes?.descricao ?? ""}
      data={ped.data}
      status={ped.status}
      observacoes={ped.observacoes ?? ""}
      confColab={ped.conf_colab_em ? { em: ped.conf_colab_em, por: ped.conf_colab_por } : null}
      itens={itens}
      produtos={produtos}
      nota={notaLigada}
      sugeridas={sugeridas as NotaSugerida[]}
      divergencias={divergencias}
    />
  );
}
