import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao } from "@/lib/types";
import { PedidoAcoes } from "./pedido-acoes";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PedidosPage({
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

  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select(
      "id, fornecedor_id, fornecedores(nome, whatsapp), pedido_itens(qtd, preco_unit, produtos(nome, unidade))",
    )
    .eq("cotacao_id", id);

  type PedItem = {
    qtd: number;
    preco_unit: number | null;
    produtos: { nome?: string; unidade?: string } | null;
  };
  type Ped = {
    id: string;
    fornecedores: { nome?: string; whatsapp?: string | null } | null;
    pedido_itens: PedItem[];
  };
  const pedidos = (pedidosData as unknown as Ped[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link
        href={`/cotacoes/${cotacao.id}/comparar`}
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para a comparação
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Pedidos
      </h1>
      <p className="mt-1 text-zinc-500">
        Um pedido por fornecedor. Revise e envie pelo WhatsApp.
      </p>

      {pedidos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum pedido gerado ainda.{" "}
          <Link
            href={`/cotacoes/${cotacao.id}/comparar`}
            className="font-medium text-orange-600 underline"
          >
            Volte à comparação
          </Link>{" "}
          e clique em “Gerar pedidos”.
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {pedidos.map((ped) => {
            const nome = ped.fornecedores?.nome ?? "Fornecedor";
            const itens = ped.pedido_itens ?? [];
            const total = itens.reduce(
              (s, i) => s + (i.preco_unit ?? 0) * i.qtd,
              0,
            );
            const linhas = itens.map(
              (i) =>
                `- ${i.produtos?.nome ?? ""}: ${i.qtd} ${i.produtos?.unidade ?? ""}` +
                (i.preco_unit != null ? ` (${moeda(i.preco_unit)})` : ""),
            );
            const texto =
              `*Pedido - Brasa Pizza*\n${nome}\n\n` +
              linhas.join("\n") +
              `\n\nTotal: ${moeda(total)}`;

            return (
              <div
                key={ped.id}
                className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {nome}
                  </h2>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {moeda(total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {itens.map((i, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 text-zinc-800 dark:text-zinc-200">
                          {i.produtos?.nome}
                        </td>
                        <td className="py-1.5 text-right text-zinc-500">
                          {i.qtd} {i.produtos?.unidade}
                        </td>
                        <td className="py-1.5 text-right text-zinc-500">
                          {i.preco_unit != null ? moeda(i.preco_unit) : "—"}
                        </td>
                        <td className="py-1.5 text-right text-zinc-800 dark:text-zinc-200">
                          {i.preco_unit != null
                            ? moeda(i.preco_unit * i.qtd)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4">
                  <PedidoAcoes texto={texto} whatsapp={ped.fornecedores?.whatsapp ?? null} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
