import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { UploadNota } from "./upload";
import { excluirNota } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function NotasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notas_fiscais")
    .select("id, numero, emit_nome, valor, data_emissao, vencimento, status, pedido_id")
    .order("data_emissao", { ascending: false })
    .limit(300);

  type Nota = {
    id: string;
    numero: string | null;
    emit_nome: string | null;
    valor: number;
    data_emissao: string | null;
    vencimento: string | null;
    status: string;
    pedido_id: string | null;
  };
  const notas = (data as Nota[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Notas Fiscais
          </h1>
          <p className="mt-1 text-zinc-500">
            Importe o XML da NF-e. Ela vira conta a pagar e pode ser cruzada com
            o pedido.
          </p>
        </div>
        <UploadNota />
      </div>

      {notas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma nota ainda. Clique em <b>+ Importar XML</b> e escolha os
          arquivos <b>.xml</b> das notas.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {notas.map((n) => (
                <tr key={n.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    <Link href={`/notas/${n.id}`} className="hover:text-orange-600 hover:underline">
                      {n.emit_nome ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{n.numero}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {n.data_emissao ? dataBR(n.data_emissao) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {n.vencimento ? dataBR(n.vencimento) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-800 dark:text-zinc-200">
                    {moeda(Number(n.valor))}
                  </td>
                  <td className="px-4 py-3">
                    {n.pedido_id ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        conciliada
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        a conciliar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={excluirNota} className="inline">
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-zinc-400 hover:text-red-600">
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
