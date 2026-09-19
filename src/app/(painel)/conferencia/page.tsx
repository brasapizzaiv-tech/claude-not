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
    "bg-superficie-suave text-texto-suave",
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
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Conferência
          </h1>
          <p className="mt-1 text-texto-suave">
            Confira a mercadoria que chegou contra o pedido.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/conferencia/divergencias"
            className={`flex min-h-11 items-center rounded-controle border px-4 text-sm font-semibold transition ${comProblemaMes > 0 ? "border-alerta text-alerta hover:bg-superficie-suave" : "border-borda-forte text-texto-suave hover:bg-superficie-suave"}`}
          >
            <Icone nome="alerta" tamanho={14} className="mr-1.5" /> Divergências{comProblemaMes > 0 ? ` (${comProblemaMes} este mês)` : ""}
          </Link>
          <Link
            href="/conferencia/novo"
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
          >
            + Pedido manual
          </Link>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <div className="mt-6 rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum pedido ainda. Gere pedidos numa cotação para conferir aqui.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-cartao bg-painel-cartao">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
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
              <tbody className="divide-y divide-borda">
                {pedidos.map((p) => {
                  const total = (p.pedido_itens ?? []).reduce(
                    (s, i) => s + (i.preco_unit ?? 0) * i.qtd,
                    0,
                  );
                  return (
                    <tr
                      key={p.id}
                      className="transition hover:bg-superficie-suave"
                    >
                      <td className="px-4 py-3 font-medium text-texto">
                        <Link
                          href={`/conferencia/${p.id}`}
                          className="hover:text-orange-600 hover:underline"
                        >
                          {p.fornecedores?.nome ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-texto-suave">
                        {p.cotacoes?.descricao ?? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            Compra direta
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-texto-suave">
                        {dataBR(p.data)}
                      </td>
                      <td className="px-4 py-3 text-right text-texto-suave">
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
                          <div className="text-texto-suave">✓ {p.conf_colab_por ?? "equipe"} · {quandoCurto(p.conf_colab_em)}</div>
                        ) : p.status === "conferido" ? (
                          <div className="text-texto-suave">✓ painel</div>
                        ) : (
                          <div className="text-texto-fraco">aguardando</div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(p.notas_fiscais?.length ?? 0) > 0
                            ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-mini font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">nota ligada</span>
                            : (p.conf_colab_em || p.status === "conferido") && <span className="rounded-controle bg-superficie-suave px-1.5 py-0.5 text-mini text-texto-suave">sem nota</span>}
                          {p.divergencias_n > 0 && (
                            <Link href={`/conferencia/${p.id}`} className={`rounded px-1.5 py-0.5 text-mini font-semibold ${(p.divergencias as ResumoDivergencias)?.gravidade === "grave" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
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
        </div>
      )}
    </div>
  );
}
