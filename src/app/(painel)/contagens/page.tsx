import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Contagem } from "@/lib/types";
import { dataBR } from "@/lib/format";
import { criarContagem, excluirContagem } from "./actions";

export default async function ContagensPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contagens")
    .select("*")
    .order("criado_em", { ascending: false });

  const contagens = (data as Contagem[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Contagem de estoque
          </h1>
          <p className="mt-1 text-zinc-500">
            Conte o estoque e gere a sugestão do que pedir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/contagens/agendamentos"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            ⏰ Agendamentos
          </Link>
          <form action={criarContagem}>
            <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600">
              + Nova contagem
            </button>
          </form>
        </div>
      </div>

      {contagens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma contagem ainda. Clique em <b>+ Nova contagem</b> para começar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {contagens.map((c) => (
                <tr
                  key={c.id}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    <Link
                      href={`/contagens/${c.id}`}
                      className="hover:text-orange-600 hover:underline"
                    >
                      {c.descricao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {dataBR(c.data)}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "finalizada" ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        Finalizada
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/contagens/${c.id}`}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Abrir
                    </Link>
                    <form action={excluirContagem} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-600"
                      >
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
