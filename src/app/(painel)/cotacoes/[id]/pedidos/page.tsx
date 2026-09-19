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
        className="text-sm text-texto-suave hover:text-orange-600"
      >
        ← Voltar para a comparação
      </Link>
      <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">
        Pedidos
      </h1>
      <p className="mt-1 text-texto-suave">
        Um pedido por fornecedor. Revise e envie pelo WhatsApp.
      </p>

      {pedidos.length === 0 ? (
        <div className="mt-6 rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
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
                className="rounded-cartao border border-borda p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-texto">
                    {nome}
                  </h2>
                  <span className="text-sm font-semibold text-texto">
                    {moeda(total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-borda">
                    {itens.map((i, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 text-texto">
                          {i.produtos?.nome}
                        </td>
                        <td className="py-1.5 text-right text-texto-suave">
                          {i.qtd} {i.produtos?.unidade}
                        </td>
                        <td className="py-1.5 text-right text-texto-suave">
                          {i.preco_unit != null ? moeda(i.preco_unit) : "—"}
                        </td>
                        <td className="py-1.5 text-right text-texto">
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
