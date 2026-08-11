import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao, Contagem } from "@/lib/types";
import { criarCotacao, excluirCotacao } from "./actions";

export default async function CotacoesPage() {
  const supabase = await createClient();

  const [{ data: cotData }, { data: contData }] = await Promise.all([
    supabase.from("cotacoes").select("*").order("criado_em", { ascending: false }),
    supabase
      .from("contagens")
      .select("*")
      .eq("status", "finalizada")
      .order("criado_em", { ascending: false }),
  ]);

  const cotacoes = (cotData as Cotacao[]) ?? [];
  const contagens = (contData as Contagem[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Cotações
          </h1>
          <p className="mt-1 text-zinc-500">
            Escolha o que comprar e peça preço aos fornecedores.
          </p>
        </div>
        <form action={criarCotacao} className="flex flex-wrap items-center gap-2">
          <select
            name="contagem_id"
            defaultValue=""
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Sem contagem (usar só o ideal)</option>
            {contagens.map((c) => (
              <option key={c.id} value={c.id}>
                Base: {c.descricao}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600">
            + Nova cotação
          </button>
        </form>
      </div>

      {cotacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma cotação ainda. Escolha uma contagem (ou nenhuma) e clique em{" "}
          <b>+ Nova cotação</b>.
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
              {cotacoes.map((c) => (
                <tr
                  key={c.id}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    <Link
                      href={`/cotacoes/${c.id}`}
                      className="hover:text-orange-600 hover:underline"
                    >
                      {c.descricao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(c.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "fechada" ? (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Fechada
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        Aberta
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/cotacoes/${c.id}`}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Abrir
                    </Link>
                    <form action={excluirCotacao} className="inline">
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
