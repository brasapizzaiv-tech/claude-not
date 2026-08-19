import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { calcFechamento, type FormaLinha } from "@/lib/caixa";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Row = {
  id: string;
  data: string;
  venda_bruta: number;
  acrescimos: number;
  cancelados: number;
  descontos: number;
  fretes: number;
  fundo_caixa: number;
  recebimentos: number;
  creditos: number;
  pagamentos: number;
  fiado: number;
  quebra: number;
  formas: FormaLinha[];
};

export default async function CaixaListaPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fechamentos_caixa")
    .select("*")
    .order("data", { ascending: false })
    .limit(200);
  const lista = (data as Row[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Fechamento de caixa
          </h1>
          <p className="mt-1 text-zinc-500">
            Faturamento real do dia, por forma de pagamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <Link
            href="/financeiro/caixa/novo"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            + Novo fechamento
          </Link>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum fechamento ainda. Clique em <b>+ Novo fechamento</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">Total pedidos</th>
                <th className="px-4 py-3 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((r) => {
                const c = calcFechamento(r);
                return (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/financeiro/caixa/${r.id}`}
                        className="text-zinc-900 hover:text-orange-600 hover:underline dark:text-zinc-100"
                      >
                        {dataBR(r.data)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {c.pedidos_total}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                      {moeda(c.total_pedidos)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                      {moeda(c.saldo_final)}
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
