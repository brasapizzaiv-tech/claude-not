import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { ExcluirPedido } from "./excluir";
import type { ResumoDivergencias } from "@/lib/conferencia-core";

const moedaCurta = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// Fora do componente por causa da regra de pureza do React.
const inicioDoMes = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7) + "-01";
const quandoCurto = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const badge: Record<string, string> = {
  rascunho:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  enviado:
    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  recebido:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  conferido:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

export default async function ConferenciaPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select(
      "id, data, status, conf_colab_em, conf_colab_por, divergencias, divergencias_n, fornecedores(nome), cotacoes(descricao), pedido_itens(qtd, preco_unit), notas_fiscais(id)",
    )
    .order("criado_em", { ascending: false });

  type Ped = {
    id: string;
    data: string;
    status: string;
    conf_colab_em: string | null;
    conf_colab_por: string | null;
    divergencias: ResumoDivergencias | Record<string, never> | null;
    divergencias_n: number;
    fornecedores: { nome?: string } | null;
    cotacoes: { descricao?: string } | null;
    pedido_itens: { qtd: number; preco_unit: number | null }[];
    notas_fiscais: { id: string }[] | null;
  };
  const pedidos = (data as unknown as Ped[]) ?? [];
  const mesIni = inicioDoMes();
  const comProblemaMes = pedidos.filter((p) => p.data >= mesIni && p.divergencias_n > 0).length;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Conferência
          </h1>
          <p className="mt-1 text-zinc-500">
            Confira a mercadoria que chegou contra o pedido.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/conferencia/divergencias"
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${comProblemaMes > 0 ? "border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"}`}
          >
            <Icone nome="alerta" tamanho={14} className="mr-1.5" /> Divergências{comProblemaMes > 0 ? ` (${comProblemaMes} este mês)` : ""}
          </Link>
          <Link
            href="/conferencia/novo"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            + Pedido manual
          </Link>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum pedido ainda. Gere pedidos numa cotação para conferir aqui.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Cotação</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Conferência</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pedidos.map((p) => {
                const total = (p.pedido_itens ?? []).reduce(
                  (s, i) => s + (i.preco_unit ?? 0) * i.qtd,
                  0,
                );
                return (
                  <tr
                    key={p.id}
                    className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      <Link
                        href={`/conferencia/${p.id}`}
                        className="hover:text-orange-600 hover:underline"
                      >
                        {p.fornecedores?.nome ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {p.cotacoes?.descricao ?? (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          Compra direta
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {dataBR(p.data)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                      {moeda(total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          badge[p.status] ?? badge.rascunho
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.conf_colab_em ? (
                        <div className="text-zinc-500">✓ {p.conf_colab_por ?? "equipe"} · {quandoCurto(p.conf_colab_em)}</div>
                      ) : p.status === "conferido" ? (
                        <div className="text-zinc-500">✓ painel</div>
                      ) : (
                        <div className="text-zinc-400">aguardando</div>
                      )}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {(p.notas_fiscais?.length ?? 0) > 0
                          ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">nota ligada</span>
                          : (p.conf_colab_em || p.status === "conferido") && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">sem nota</span>}
                        {p.divergencias_n > 0 && (
                          <Link href={`/conferencia/${p.id}`} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${(p.divergencias as ResumoDivergencias)?.gravidade === "grave" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                            <Icone nome="alerta" tamanho={12} className="mr-1" /> {p.divergencias_n} divergência{p.divergencias_n === 1 ? "" : "s"}
                            {((p.divergencias as ResumoDivergencias)?.valor_a_mais ?? 0) > 0 ? ` · ${moedaCurta((p.divergencias as ResumoDivergencias).valor_a_mais)} a mais` : ""}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ExcluirPedido id={p.id} nome={p.fornecedores?.nome ?? "fornecedor"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
