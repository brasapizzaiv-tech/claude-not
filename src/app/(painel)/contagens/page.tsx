import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import type { Contagem } from "@/lib/types";
import { dataBR } from "@/lib/format";
import { criarContagem, excluirContagem } from "./actions";
import { AvulsaForm } from "./avulsa";

export default async function ContagensPage() {
  const supabase = await createClient();
  const [{ data }, { data: cats }, { data: colabs }] = await Promise.all([
    supabase.from("contagens").select("*").order("criado_em", { ascending: false }),
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase
      .from("colaboradores")
      .select("id, nome, whatsapp")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const contagens = (data as Contagem[]) ?? [];
  const categorias = (cats as { id: string; nome: string }[]) ?? [];
  const colaboradores =
    (colabs as { id: string; nome: string; whatsapp: string | null }[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Contagem de estoque
          </h1>
          <p className="mt-1 text-texto-suave">
            Conte o estoque e gere a sugestão do que pedir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AvulsaForm categorias={categorias} colaboradores={colaboradores} />
          <Link
            href="/contagens/agendamentos"
            className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            <Icone nome="relogio" tamanho={15} className="mr-1.5" /> Agendamentos
          </Link>
          <form action={criarContagem}>
            <Enviar className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
              + Nova contagem
            </Enviar>
          </form>
        </div>
      </div>

      {contagens.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhuma contagem ainda. Clique em <b>+ Nova contagem</b> para começar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <div className="overflow-x-auto">
            <table className="min-w-[560px] w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
                <tr>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {contagens.map((c) => (
                  <tr
                    key={c.id}
                    className="transition hover:bg-superficie-suave"
                  >
                    <td className="px-4 py-3 font-medium text-texto">
                      <Link
                        href={`/contagens/${c.id}`}
                        className="hover:text-orange-600 hover:underline"
                      >
                        {c.descricao}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-texto-suave">
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
                        <Enviar
                          className="text-texto-fraco hover:text-red-600"
                        >
                          Remover
                        </Enviar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
