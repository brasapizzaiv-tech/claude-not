import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao } from "@/lib/types";
import {
  FornecedoresClient,
  type FornecedorLinha,
} from "./fornecedores-client";

export default async function CotacaoFornecedoresPage({
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

  // Itens da cotação (produtos com quantidade > 0).
  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("produto_id, qtd")
    .eq("cotacao_id", id)
    .gt("qtd", 0);
  const produtoIds = (itens ?? []).map((i) => i.produto_id);

  let linhas: FornecedorLinha[] = [];

  if (produtoIds.length > 0) {
    // Quais fornecedores fornecem esses produtos (e quantos deles).
    const { data: vinculos } = await supabase
      .from("fornecedor_produto")
      .select("fornecedor_id, produto_id")
      .in("produto_id", produtoIds);

    const cobertura = new Map<string, number>();
    for (const v of vinculos ?? [])
      cobertura.set(v.fornecedor_id, (cobertura.get(v.fornecedor_id) ?? 0) + 1);

    const fornIds = [...cobertura.keys()];

    const [{ data: forns }, { data: convidados }] = await Promise.all([
      fornIds.length
        ? supabase
            .from("fornecedores")
            .select("id, nome, whatsapp, contato")
            .in("id", fornIds)
            .eq("ativo", true)
        : Promise.resolve({
            data: [] as { id: string; nome: string; whatsapp: string | null; contato: string | null }[],
          }),
      supabase
        .from("cotacao_fornecedores")
        .select("fornecedor_id, status, token")
        .eq("cotacao_id", id),
    ]);

    const convidadoPor = new Map(
      (convidados ?? []).map((c) => [c.fornecedor_id, c]),
    );

    linhas = (forns ?? [])
      .map((f) => {
        const conv = convidadoPor.get(f.id);
        return {
          id: f.id,
          nome: f.nome,
          whatsapp: f.whatsapp,
          contato: f.contato ?? null,
          cobertura: cobertura.get(f.id) ?? 0,
          convidado: !!conv,
          token: conv?.token ?? null,
          respondido: conv?.status === "respondido",
        };
      })
      .sort((a, b) => b.cobertura - a.cobertura || a.nome.localeCompare(b.nome));
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link
        href={`/cotacoes/${cotacao.id}`}
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para a cotação
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Escolher fornecedores
        </h1>
        <Link
          href={`/cotacoes/${cotacao.id}/comparar`}
          className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
        >
          Comparar preços →
        </Link>
      </div>
      <p className="mt-1 text-zinc-500">
        Convide os fornecedores e envie o link para cada um preencher os preços.
      </p>

      {produtoIds.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum item para cotar ainda.{" "}
          <Link
            href={`/cotacoes/${cotacao.id}`}
            className="font-medium text-orange-600 underline"
          >
            Volte e defina as quantidades
          </Link>{" "}
          primeiro.
        </div>
      ) : (
        <FornecedoresClient
          cotacaoId={cotacao.id}
          totalItens={produtoIds.length}
          linhas={linhas}
        />
      )}
    </div>
  );
}
