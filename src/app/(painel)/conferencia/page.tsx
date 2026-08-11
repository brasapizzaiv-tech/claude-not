import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
      "id, data, status, fornecedores(nome), cotacoes(descricao), pedido_itens(qtd, preco_unit)",
    )
    .order("criado_em", { ascending: false });

  type Ped = {
    id: string;
    data: string;
    status: string;
    fornecedores: { nome?: string } | null;
    cotacoes: { descricao?: string } | null;
    pedido_itens: { qtd: number; preco_unit: number | null }[];
  };
  const pedidos = (data as unknown as Ped[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Conferência
      </h1>
      <p className="mt-1 text-zinc-500">
        Confira a mercadoria que chegou contra o pedido.
      </p>

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
                      {p.cotacoes?.descricao ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(p.data).toLocaleDateString("pt-BR")}
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
