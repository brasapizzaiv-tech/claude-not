import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao } from "@/lib/types";
import { PedidoAcoes } from "./pedido-acoes";
import { ExcluirPedido, ItensPedido } from "./pedido-editar";
import { lerMarca } from "@/lib/marca";

export const metadata = { title: "Pedidos" };

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PedidosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { nome: nomeEmpresa } = await lerMarca();

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
      "id, fornecedor_id, status, conferido_em, conf_colab_em, fornecedores(nome, whatsapp), pedido_itens(id, qtd, preco_unit, produtos(nome, unidade))",
    )
    .eq("cotacao_id", id);

  type PedItem = {
    id: string;
    qtd: number;
    preco_unit: number | null;
    produtos: { nome?: string; unidade?: string } | null;
  };
  type Ped = {
    id: string;
    status: string | null;
    conferido_em: string | null;
    conf_colab_em: string | null;
    fornecedores: { nome?: string; whatsapp?: string | null } | null;
    pedido_itens: PedItem[];
  };
  const pedidos = (pedidosData as unknown as Ped[]) ?? [];

  return (
    <div className="pagina">
      <Link
        href={`/cotacoes/${cotacao.id}/comparar`}
        className="text-sm text-texto-suave hover:text-orange-600"
      >
        ← Voltar para a comparação
      </Link>
      <h1 className="mt-2 titulo-pagina">
        Pedidos
      </h1>
      <p className="mt-1 text-texto-suave">
        Um pedido por fornecedor. Revise e envie pelo WhatsApp. Enquanto o pedido não chegou, dá pra corrigir a
        quantidade, tirar um item ou excluir o pedido.
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
            const itens = [...(ped.pedido_itens ?? [])].sort((a, b) => (a.produtos?.nome ?? "").localeCompare(b.produtos?.nome ?? "", "pt-BR"));
            // Ainda não chegou nem foi conferido: dá pra mexer.
            const mexivel = (ped.status ?? "rascunho") === "rascunho" && !ped.conferido_em && !ped.conf_colab_em;
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
              `*Pedido - ${nomeEmpresa}*\n${nome}\n\n` +
              linhas.join("\n") +
              `\n\nTotal: ${moeda(total)}`;

            return (
              <div
                key={ped.id}
                className="cartao p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-texto">
                    {nome}
                  </h2>
                  <span className="text-sm font-semibold text-texto">
                    {moeda(total)}
                  </span>
                </div>
                <ItensPedido
                  mexivel={mexivel}
                  itens={itens.map((i) => ({
                    id: i.id,
                    nome: i.produtos?.nome ?? "",
                    unidade: i.produtos?.unidade ?? "",
                    qtd: Number(i.qtd),
                    preco_unit: i.preco_unit != null ? Number(i.preco_unit) : null,
                  }))}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <PedidoAcoes texto={texto} whatsapp={ped.fornecedores?.whatsapp ?? null} />
                  {mexivel && <ExcluirPedido pedidoId={ped.id} fornecedor={nome} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
