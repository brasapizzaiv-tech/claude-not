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
      .select("id, nome, unidade, estoque_ideal, fardo, categoria_id, categorias(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("cotacao_itens").select("produto_id, qtd").eq("cotacao_id", id),
  ]);

  // Estoque contado na contagem base (se houver). A presença aqui = produto
  // que fez parte daquela contagem (o que foi "solicitado").
  const contado = new Map<string, number>();
  // Produtos que faziam parte da LISTA da contagem (pelas categorias atribuídas):
  // item deixado em branco na contagem vale 0 e entra na cotação do mesmo jeito.
  const daLista = new Set<string>();
  if (cotacao.contagem_id) {
    const [{ data: cont }, { data: atrib }] = await Promise.all([
      supabase.from("contagem_itens").select("produto_id, qtd_estoque").eq("contagem_id", cotacao.contagem_id),
      supabase.from("contagem_atribuicoes").select("categoria_id").eq("contagem_id", cotacao.contagem_id),
    ]);
    for (const c of cont ?? []) contado.set(c.produto_id, Number(c.qtd_estoque) || 0);
    const catIds = new Set((atrib ?? []).map((a) => a.categoria_id as string | null).filter(Boolean) as string[]);
    if (catIds.size) {
      for (const p of (prodData as unknown as { id: string; categoria_id?: string | null }[]) ?? []) {
        if (p.categoria_id && catIds.has(p.categoria_id)) daLista.add(p.id);
      }
    }
  }

  const jaCotado = new Map<string, number>();
  for (const i of itensData ?? []) jaCotado.set(i.produto_id, Number(i.qtd) || 0);

  // A sugestão só pré-preenche na PRIMEIRA vez (cotação ainda sem itens
  // salvos). Depois de salvar, o que o comprador zerou/deixou de fora tem que
  // voltar vazio — senão a sugestão "ressuscita" itens tirados de propósito.
  const primeiraVez = jaCotado.size === 0;

  let produtos = (prodData as unknown as Produto[]) ?? [];

  // Cotação baseada em contagem: cota SÓ os produtos que entraram naquela
  // contagem, mais qualquer produto já salvo manualmente nesta cotação.
  if (cotacao.contagem_id) {
    const permitidos = new Set<string>([...contado.keys(), ...daLista, ...jaCotado.keys()]);
    produtos = produtos.filter((p) => permitidos.has(p.id));
  }

  const linhas: LinhaProduto[] = produtos.map((p) => {
    const cont = contado.get(p.id) ?? 0;
    const ideal = Number(p.estoque_ideal) || 0;
    const fardo = Number(p.fardo) || 0;
    // Sugestão = o que falta para o estoque ideal, arredondada para CIMA
    // até fechar fardos inteiros (quando o produto tem fardo definido).
    const bruta = Math.max(0, ideal - cont);
    const sugestao = fardo > 1 && bruta > 0 ? Math.ceil(bruta / fardo) * fardo : bruta;
    const existente = jaCotado.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      unidade: p.unidade,
      categoria: p.categorias?.nome ?? "Sem categoria",
      contado: cont,
      ideal,
      sugestao,
      fardo,
      // Se já foi salvo, usa o salvo. Sugestão só na primeira abertura.
      qtd: existente != null ? existente : primeiraVez ? sugestao : 0,
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
