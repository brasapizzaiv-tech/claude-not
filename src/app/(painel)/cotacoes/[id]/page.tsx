import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao, Produto } from "@/lib/types";
import { CotacaoClient, type LinhaProduto } from "./cotacao-client";

export default async function CotacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cotData } = await supabase
    .from("cotacoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!cotData) notFound();
  const cotacao = cotData as Cotacao;

  const [{ data: prodData }, { data: itensData }] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, unidade, estoque_ideal, categorias(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("cotacao_itens").select("produto_id, qtd").eq("cotacao_id", id),
  ]);

  // Estoque contado na contagem base (se houver). A presença aqui = produto
  // que fez parte daquela contagem (o que foi "solicitado").
  const contado = new Map<string, number>();
  if (cotacao.contagem_id) {
    const { data: cont } = await supabase
      .from("contagem_itens")
      .select("produto_id, qtd_estoque")
      .eq("contagem_id", cotacao.contagem_id);
    for (const c of cont ?? []) contado.set(c.produto_id, Number(c.qtd_estoque) || 0);
  }

  const jaCotado = new Map<string, number>();
  for (const i of itensData ?? []) jaCotado.set(i.produto_id, Number(i.qtd) || 0);

  let produtos = (prodData as unknown as Produto[]) ?? [];

  // Cotação baseada em contagem: cota SÓ os produtos que entraram naquela
  // contagem, mais qualquer produto já salvo manualmente nesta cotação.
  if (cotacao.contagem_id) {
    const permitidos = new Set<string>([...contado.keys(), ...jaCotado.keys()]);
    produtos = produtos.filter((p) => permitidos.has(p.id));
  }

  const linhas: LinhaProduto[] = produtos.map((p) => {
    const cont = contado.get(p.id) ?? 0;
    const ideal = Number(p.estoque_ideal) || 0;
    // Sugestão = o que falta para o estoque ideal.
    const sugestao = Math.max(0, ideal - cont);
    const existente = jaCotado.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      unidade: p.unidade,
      categoria: p.categorias?.nome ?? "Sem categoria",
      contado: cont,
      ideal,
      sugestao,
      // Se já foi salvo, usa o salvo; senão, começa com a sugestão.
      qtd: existente != null ? existente : sugestao,
    };
  });

  return (
    <CotacaoClient
      cotacao={cotacao}
      temContagem={!!cotacao.contagem_id}
      linhas={linhas}
    />
  );
}
