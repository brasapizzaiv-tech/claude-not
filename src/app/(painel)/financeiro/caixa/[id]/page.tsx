import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { calcFechamento, type FormaLinha } from "@/lib/caixa";
import { excluirFechamento } from "../actions";

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
  observacao: string | null;
};

export default async function FechamentoRelatorio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("fechamentos_caixa")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Row;
  const c = calcFechamento(r);

  // Painel esquerdo: A..N
  const linhas: [string, string, "+" | "−" | "=", number][] = [
    ["A", "Venda bruta", "+", r.venda_bruta],
    ["B", "Acréscimos", "+", r.acrescimos],
    ["C", "Cancelados", "−", r.cancelados],
    ["D", "Descontos", "−", r.descontos],
    ["E", "Venda líquida", "=", c.venda_liquida],
    ["F", "Fretes", "+", r.fretes],
    ["G", "Total pedidos", "=", c.total_pedidos],
    ["H", "Fundo de caixa", "+", r.fundo_caixa],
    ["I", "Recebimentos", "+", r.recebimentos],
    ["J", "Créditos", "+", r.creditos],
    ["K", "Pagamentos", "−", r.pagamentos],
    ["L", "Fiado", "−", r.fiado],
    ["M", "Quebra", "−", r.quebra],
    ["N", "Saldo final", "=", c.saldo_final],
  ];
  const corSinal = (sinal: string) =>
    sinal === "+" ? "text-green-600" : sinal === "−" ? "text-red-500" : "text-orange-600";

  // Painel direito: por forma de pagamento (Outros só no Dinheiro).
  const formasCalc = r.formas.map((f) => {
    const outros = f.forma === "Dinheiro" ? c.outros_dinheiro : 0;
    return { ...f, outros, saldo: f.valor + outros };
  });
  const subPedidos = formasCalc.reduce((s, f) => s + f.pedidos, 0);
  const subTotal = formasCalc.reduce((s, f) => s + f.valor, 0);
  const subOutros = formasCalc.reduce((s, f) => s + f.outros, 0);
  const subSaldo = formasCalc.reduce((s, f) => s + f.saldo, 0);
  const totalFinal = subSaldo - r.quebra;

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/financeiro/caixa"
            className="text-sm text-zinc-500 hover:text-orange-600"
          >
            ← Fechamentos
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Caixa de {dataBR(r.data)}
          </h1>
          {r.observacao && (
            <p className="mt-1 text-sm text-zinc-500">{r.observacao}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro/caixa/novo?id=${r.id}`}
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Editar
          </Link>
          <form action={excluirFechamento}>
            <input type="hidden" name="id" value={r.id} />
            <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-500 hover:border-red-400 hover:text-red-600 dark:border-zinc-700">
              Excluir
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Detalhes do caixa */}
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
            Detalhes do caixa
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Fechamento do caixa nesse dia.
          </p>
          <div className="space-y-1.5">
            {linhas.map(([letra, label, sinal, valor]) => {
              const destaque = sinal === "=";
              return (
                <div
                  key={letra}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 ${
                    destaque
                      ? "bg-zinc-100 dark:bg-zinc-900"
                      : "border-b border-zinc-100 dark:border-zinc-800/60"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                    {letra}
                  </span>
                  <span
                    className={`flex-1 text-sm ${
                      destaque
                        ? "font-semibold text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {label}
                  </span>
                  <span className={`text-sm font-bold ${corSinal(sinal)}`}>{sinal}</span>
                  <span
                    className={`w-28 text-right text-sm font-semibold ${
                      destaque
                        ? "text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    {moeda(valor)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Estatísticas + por forma */}
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Ticket médio</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {moeda(c.ticket_medio)}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Pedidos pagos</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {subPedidos}
              </p>
              <p className="text-xs text-zinc-400">{moeda(subTotal)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Total pedidos</p>
              <p className="mt-1 text-lg font-bold text-orange-600">
                {moeda(c.total_pedidos)}
              </p>
            </div>
          </div>

          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-50">
            Por forma de pagamento
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2">Forma de pag.</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                  <th className="px-4 py-2 text-right">Total pedidos</th>
                  <th className="px-4 py-2 text-right">Outros</th>
                  <th className="px-4 py-2 text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {formasCalc.map((f) => (
                  <tr key={f.forma} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                      {f.forma}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500">{f.pedidos}</td>
                    <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {moeda(f.valor)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500">
                      {f.outros ? (
                        <span className="text-green-600">+ {moeda(f.outros)}</span>
                      ) : (
                        moeda(0)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                      {moeda(f.saldo)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                  <td className="px-4 py-2">Subtotal</td>
                  <td className="px-4 py-2 text-right">{subPedidos}</td>
                  <td className="px-4 py-2 text-right">{moeda(subTotal)}</td>
                  <td className="px-4 py-2 text-right">{moeda(subOutros)}</td>
                  <td className="px-4 py-2 text-right">{moeda(subSaldo)}</td>
                </tr>
                {r.quebra !== 0 && (
                  <tr className="bg-white text-red-600 dark:bg-zinc-950">
                    <td className="px-4 py-2">Quebra</td>
                    <td className="px-4 py-2 text-right">–</td>
                    <td className="px-4 py-2 text-right">–</td>
                    <td className="px-4 py-2 text-right">–</td>
                    <td className="px-4 py-2 text-right">{moeda(-r.quebra)}</td>
                  </tr>
                )}
                <tr className="bg-zinc-100 font-bold dark:bg-zinc-800">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{subPedidos}</td>
                  <td className="px-4 py-2 text-right">{moeda(subTotal)}</td>
                  <td className="px-4 py-2 text-right">{moeda(subOutros)}</td>
                  <td className="px-4 py-2 text-right">{moeda(totalFinal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
