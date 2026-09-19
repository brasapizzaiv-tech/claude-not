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
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Fechamento de caixa
          </h1>
          <p className="mt-1 text-texto-suave">
            Faturamento real do dia, por forma de pagamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <Link
            href="/financeiro/caixa/novo"
            className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
          >
            + Novo fechamento
          </Link>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum fechamento ainda. Clique em <b>+ Novo fechamento</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <div className="overflow-x-auto">
            <table className="min-w-[560px] w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Total pedidos</th>
                  <th className="px-4 py-3 text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.map((r) => {
                  const c = calcFechamento(r);
                  return (
                    <tr key={r.id} className="">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/financeiro/caixa/${r.id}`}
                          className="text-texto hover:text-orange-600 hover:underline"
                        >
                          {dataBR(r.data)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-texto-suave">
                        {c.pedidos_total}
                      </td>
                      <td className="px-4 py-3 text-right text-texto-suave">
                        {moeda(c.total_pedidos)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-texto">
                        {moeda(c.saldo_final)}
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
