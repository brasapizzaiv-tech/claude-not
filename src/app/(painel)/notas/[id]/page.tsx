import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import type { NotaFiscal, NotaItem } from "@/lib/types";
import { BotaoConciliar } from "./conciliar";
import { ManifestarNota } from "./manifestar";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function NotaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: notaData } = await supabase
    .from("notas_fiscais")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!notaData) notFound();
  const nota = notaData as NotaFiscal;

  const { data: itensData } = await supabase
    .from("nota_itens")
    .select("*")
    .eq("nota_id", id);
  const itens = (itensData as NotaItem[]) ?? [];

  // Pedidos candidatos (mesmo fornecedor).
  type Ped = {
    id: string;
    data: string;
    status: string;
    pedido_itens: { qtd: number; preco_unit: number | null }[];
  };
  let pedidos: (Ped & { total: number })[] = [];
  if (nota.fornecedor_id) {
    const { data: peds } = await supabase
      .from("pedidos")
      .select("id, data, status, pedido_itens(qtd, preco_unit)")
      .eq("fornecedor_id", nota.fornecedor_id)
      .order("data", { ascending: false })
      .limit(20);
    pedidos = ((peds as unknown as Ped[]) ?? []).map((p) => ({
      ...p,
      total: (p.pedido_itens ?? []).reduce(
        (s, i) => s + (i.preco_unit ?? 0) * i.qtd,
        0,
      ),
    }));
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/notas" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Voltar para notas
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {nota.emit_nome}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        NF {nota.numero} · série {nota.serie} ·{" "}
        {nota.data_emissao ? dataBR(nota.data_emissao) : "—"} ·{" "}
        {moeda(Number(nota.valor))}
        {nota.vencimento ? ` · vence ${dataBR(nota.vencimento)}` : ""}
      </p>
      {!nota.fornecedor_id && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Fornecedor (CNPJ {nota.emit_cnpj}) não está no seu cadastro — cadastre-o
          com esse CNPJ para o sistema reconhecer as próximas notas.
        </p>
      )}

      {/* Nota em resumo (sem itens) → oferecer manifestação */}
      {itens.length === 0 && <ManifestarNota notaId={nota.id} />}

      {/* Itens */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Itens da nota
      </h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2 text-right">Qtd</th>
              <th className="px-4 py-2 text-right">Unit.</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {itens.map((i) => (
              <tr key={i.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                  {i.descricao}
                </td>
                <td className="px-4 py-2 text-right text-zinc-500">
                  {i.qtd} {i.unidade}
                </td>
                <td className="px-4 py-2 text-right text-zinc-500">
                  {i.valor_unit != null ? moeda(Number(i.valor_unit)) : "—"}
                </td>
                <td className="px-4 py-2 text-right text-zinc-800 dark:text-zinc-200">
                  {i.valor_total != null ? moeda(Number(i.valor_total)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cruzamento com pedido */}
      <h2 className="mt-8 mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Cruzar com pedido
      </h2>
      {!nota.fornecedor_id ? (
        <p className="text-sm text-zinc-500">
          Reconheça o fornecedor primeiro para cruzar com os pedidos dele.
        </p>
      ) : pedidos.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhum pedido deste fornecedor para cruzar.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pedidos.map((p) => {
                const vinculado = nota.pedido_id === p.id;
                const dif = Number(nota.valor) - p.total;
                return (
                  <tr
                    key={p.id}
                    className={`bg-white dark:bg-zinc-950 ${vinculado ? "bg-orange-50 dark:bg-orange-950/30" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <div className="text-zinc-800 dark:text-zinc-200">
                        Pedido de {dataBR(p.data)}
                      </div>
                      <div className="text-xs text-zinc-400">
                        pedido {moeda(p.total)} · nota {moeda(Number(nota.valor))}
                        {Math.abs(dif) > 0.01 && (
                          <span className="ml-1 text-amber-600">
                            (dif {moeda(dif)})
                          </span>
                        )}
                        {Math.abs(dif) <= 0.01 && (
                          <span className="ml-1 text-green-600">(bate ✓)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BotaoConciliar
                        notaId={nota.id}
                        pedidoId={p.id}
                        vincular={!vinculado}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {nota.pedido_id && (
        <p className="mt-2 text-xs text-zinc-400">
          Conciliada: a conta provisória do pedido foi substituída por esta nota.
        </p>
      )}
    </div>
  );
}
