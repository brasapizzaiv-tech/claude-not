import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao } from "@/lib/types";
import { custoComSt } from "@/lib/st";
import {
  CompararClient,
  type ProdutoLinha,
  type FornecedorCol,
  type ExclusivoLinha,
} from "./comparar-client";

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
  const travada = !!(cotData as { pedidos_gerados_em?: string | null }).pedidos_gerados_em;

  const [{ data: itens }, { data: fornsData }, { data: precos }] =
    await Promise.all([
      supabase
        .from("cotacao_itens")
        .select("produto_id, qtd, produtos(nome, unidade, tem_st, categorias(nome))")
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
        .select("fornecedor_id, produto_id, preco_unit, disponivel, foto_url, embalagem, observacao, st_inclusa, st_pct")
        .eq("cotacao_id", id),
    ]);

  // Quais produtos têm ST (para calcular o custo real com a ST).
  const temStMap = new Map<string, boolean>();
  for (const i of (itens ?? []) as Record<string, unknown>[]) {
    const prod = i.produtos as { tem_st?: boolean } | null;
    temStMap.set(i.produto_id as string, !!prod?.tem_st);
  }

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

  // Mapa de preços: fornecedorId -> produtoId -> célula. O `preco` já é o CUSTO
  // REAL (com ST quando o produto tem e o fornecedor não incluiu no preço).
  const precoMap = new Map<
    string,
    {
      preco: number | null;
      precoBruto: number | null;
      temSt: boolean;
      disp: boolean;
      foto: string | null;
      emb: string | null;
      obs: string | null;
    }
  >();
  for (const p of precos ?? []) {
    const raw = p.preco_unit != null ? Number(p.preco_unit) : null;
    const temSt = temStMap.get(p.produto_id as string) ?? false;
    const eff =
      raw != null
        ? custoComSt(
            raw,
            temSt,
            (p.st_inclusa as boolean | null) ?? null,
            p.st_pct != null ? Number(p.st_pct) : null,
          )
        : null;
    precoMap.set(`${p.fornecedor_id}_${p.produto_id}`, {
      preco: eff,
      precoBruto: raw,
      temSt,
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
        {
          preco: number | null;
          precoBruto: number | null;
          temSt: boolean;
          disp: boolean;
          foto: string | null;
          emb: string | null;
          obs: string | null;
        }
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

  // Descobre quantos fornecedores cada produto tem (exclusividade).
  const produtoIds = produtos.map((p) => p.produto_id);
  const supsPorProduto = new Map<string, string[]>();
  const nomeForn = new Map<string, string>(fornecedores.map((f) => [f.id, f.nome]));
  if (produtoIds.length) {
    const { data: vinc } = await supabase
      .from("fornecedor_produto")
      .select("fornecedor_id, produto_id")
      .in("produto_id", produtoIds);
    const idsForaLista = new Set<string>();
    for (const v of vinc ?? []) {
      const arr = supsPorProduto.get(v.produto_id) ?? [];
      arr.push(v.fornecedor_id);
      supsPorProduto.set(v.produto_id, arr);
      if (!nomeForn.has(v.fornecedor_id)) idsForaLista.add(v.fornecedor_id);
    }
    if (idsForaLista.size) {
      const { data: nomes } = await supabase
        .from("fornecedores")
        .select("id, nome")
        .in("id", [...idsForaLista]);
      for (const n of nomes ?? []) nomeForn.set(n.id, n.nome);
    }
  }

  // Última compra de cada produto (pedidos anteriores), para comparar.
  const ultimaCompra: Record<
    string,
    { forn: string; preco: number | null; data: string }
  > = {};
  if (produtoIds.length) {
    const { data: hist } = await supabase
      .from("pedido_itens")
      .select(
        "produto_id, preco_unit, preco_recebido, pedidos!inner(fornecedor_id, criado_em, cotacao_id, fornecedores(nome))",
      )
      .in("produto_id", produtoIds);
    const maisRecente: Record<string, string> = {};
    for (const row of (hist as unknown as {
      produto_id: string;
      preco_unit: number | null;
      preco_recebido: number | null;
      pedidos: {
        criado_em: string | null;
        cotacao_id: string;
        fornecedores: { nome: string } | null;
      } | null;
    }[]) ?? []) {
      const ped = row.pedidos;
      if (!ped || ped.cotacao_id === id) continue;
      const quando = ped.criado_em || "";
      const pid = row.produto_id;
      if (!maisRecente[pid] || quando > maisRecente[pid]) {
        maisRecente[pid] = quando;
        ultimaCompra[pid] = {
          forn: ped.fornecedores?.nome ?? "—",
          preco:
            row.preco_recebido != null
              ? Number(row.preco_recebido)
              : row.preco_unit != null
                ? Number(row.preco_unit)
                : null,
          data: quando ? new Date(quando).toLocaleDateString("pt-BR") : "",
        };
      }
    }
  }

  // Separa: exclusivos (1 fornecedor) vão para pedido direto (sem cotação);
  // o resto fica na comparação de preços.
  const exclusivos: ExclusivoLinha[] = [];
  const comparados: ProdutoLinha[] = [];
  for (const p of produtos) {
    const sups = supsPorProduto.get(p.produto_id) ?? [];
    if (sups.length === 1) {
      exclusivos.push({
        produto_id: p.produto_id,
        nome: p.nome,
        unidade: p.unidade,
        categoria: p.categoria,
        qtd: p.qtd,
        fornecedorId: sups[0],
        fornecedorNome: nomeForn.get(sups[0]) ?? "—",
      });
    } else {
      comparados.push(p);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] p-4 sm:p-6">
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

      {comparados.length === 0 && exclusivos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Ainda não há itens para comparar.{" "}
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
          produtos={comparados}
          fornecedores={fornecedores}
          exclusivos={exclusivos}
          ultimaCompra={ultimaCompra}
          travada={travada}
        />
      )}
    </div>
  );
}
