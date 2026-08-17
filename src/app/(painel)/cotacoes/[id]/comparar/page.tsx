import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao } from "@/lib/types";
import { CompararClient, type ProdutoLinha, type FornecedorCol } from "./comparar-client";

export default async function CompararPage({
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

  const [{ data: itens }, { data: fornsData }, { data: precos }] =
    await Promise.all([
      supabase
        .from("cotacao_itens")
        .select("produto_id, qtd, produtos(nome, unidade, categorias(nome))")
        .eq("cotacao_id", id)
        .gt("qtd", 0),
      supabase
        .from("cotacao_fornecedores")
        .select(
          "fornecedor_id, status, respondido_em, prazo_entrega, pedido_minimo, condicao_pagamento, observacao, fornecedores(nome, whatsapp)",
        )
        .eq("cotacao_id", id),
      supabase
        .from("cotacao_precos")
        .select("fornecedor_id, produto_id, preco_unit, disponivel, foto_url, embalagem, observacao")
        .eq("cotacao_id", id),
    ]);

  const fornecedores: FornecedorCol[] = (fornsData ?? []).map(
    (f: Record<string, unknown>) => ({
      id: f.fornecedor_id as string,
      nome:
        ((f.fornecedores as { nome?: string } | null)?.nome as string) ?? "—",
      whatsapp:
        (f.fornecedores as { whatsapp?: string | null } | null)?.whatsapp ??
        null,
      status: f.status as string,
      respondido_em: (f.respondido_em as string) ?? null,
      prazo_entrega: (f.prazo_entrega as string) ?? null,
      pedido_minimo: f.pedido_minimo != null ? Number(f.pedido_minimo) : null,
      condicao_pagamento: (f.condicao_pagamento as string) ?? null,
      observacao: (f.observacao as string) ?? null,
    }),
  );

  // Ordena por resposta: quem respondeu primeiro vem antes; quem não
  // respondeu fica por último (e entre eles, por nome).
  fornecedores.sort((a, b) => {
    if (a.respondido_em && b.respondido_em)
      return a.respondido_em.localeCompare(b.respondido_em);
    if (a.respondido_em) return -1;
    if (b.respondido_em) return 1;
    return a.nome.localeCompare(b.nome);
  });

  // Mapa de preços: fornecedorId -> produtoId -> {preco, disponivel, foto}
  const precoMap = new Map<
    string,
    { preco: number | null; disp: boolean; foto: string | null; emb: string | null; obs: string | null }
  >();
  for (const p of precos ?? []) {
    precoMap.set(`${p.fornecedor_id}_${p.produto_id}`, {
      preco: p.preco_unit != null ? Number(p.preco_unit) : null,
      disp: p.disponivel,
      foto: p.foto_url ?? null,
      emb: (p.embalagem as string) ?? null,
      obs: (p.observacao as string) ?? null,
    });
  }

  const produtos: ProdutoLinha[] = (itens ?? []).map(
    (i: Record<string, unknown>) => {
      const prod = i.produtos as {
        nome?: string;
        unidade?: string;
        categorias?: { nome?: string } | null;
      } | null;
      const produtoId = i.produto_id as string;
      const precosDoProduto: Record<
        string,
        { preco: number | null; disp: boolean; foto: string | null; emb: string | null; obs: string | null }
      > = {};
      let melhorForn: string | null = null;
      let melhorPreco = Infinity;
      for (const f of fornecedores) {
        const cel = precoMap.get(`${f.id}_${produtoId}`);
        if (cel) {
          precosDoProduto[f.id] = cel;
          if (cel.disp && cel.preco != null && cel.preco < melhorPreco) {
            melhorPreco = cel.preco;
            melhorForn = f.id;
          }
        }
      }
      return {
        produto_id: produtoId,
        nome: prod?.nome ?? "—",
        unidade: prod?.unidade ?? "",
        categoria: prod?.categorias?.nome ?? "Sem categoria",
        qtd: Number(i.qtd) || 0,
        precos: precosDoProduto,
        melhorForn,
      };
    },
  );

  produtos.sort(
    (a, b) =>
      a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome),
  );

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link
        href={`/cotacoes/${cotacao.id}`}
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para a cotação
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Comparar preços
      </h1>
      <p className="mt-1 text-zinc-500">
        Veja o preço de cada fornecedor, escolha de quem comprar e gere os
        pedidos. O <b>mais barato</b> de cada item vem marcado em verde.
      </p>

      {fornecedores.length === 0 || produtos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Ainda não há fornecedores convidados ou itens com preço.{" "}
          <Link
            href={`/cotacoes/${cotacao.id}/fornecedores`}
            className="font-medium text-orange-600 underline"
          >
            Convide fornecedores
          </Link>{" "}
          e aguarde as respostas.
        </div>
      ) : (
        <CompararClient
          cotacaoId={cotacao.id}
          produtos={produtos}
          fornecedores={fornecedores}
        />
      )}
    </div>
  );
}
