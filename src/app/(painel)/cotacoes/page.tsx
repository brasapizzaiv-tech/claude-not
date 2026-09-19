import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Cotacao, Contagem } from "@/lib/types";
import { dataBR } from "@/lib/format";
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
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Cotações
          </h1>
          <p className="mt-1 text-texto-suave">
            Escolha o que comprar e peça preço aos fornecedores.
          </p>
        </div>
        <form action={criarCotacao} className="flex flex-wrap items-center gap-2">
          <select
            name="contagem_id"
            defaultValue=""
            className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria"
          >
            <option value="">Sem contagem (usar só o ideal)</option>
            {contagens.map((c) => (
              <option key={c.id} value={c.id}>
                Base: {c.descricao}
              </option>
            ))}
          </select>
          <button className="min-h-11 rounded-controle bg-texto px-4 text-sm font-medium text-fundo transition hover:opacity-90">
            + Nova cotação
          </button>
        </form>
      </div>

      {cotacoes.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhuma cotação ainda. Escolha uma contagem (ou nenhuma) e clique em{" "}
          <b>+ Nova cotação</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {cotacoes.map((c) => (
                <tr
                  key={c.id}
                  className="transition hover:bg-superficie-suave"
                >
                  <td className="px-4 py-3 font-medium text-texto">
                    <Link
                      href={`/cotacoes/${c.id}`}
                      className="hover:text-orange-600 hover:underline"
                    >
                      {c.descricao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {dataBR(c.data)}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "fechada" ? (
                      <span className="rounded-controle bg-superficie-suave px-2 py-0.5 text-xs font-medium text-texto-suave">
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
                        className="text-texto-fraco transition hover:text-erro"
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
