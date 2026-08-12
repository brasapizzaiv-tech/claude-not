import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { EtiquetaForm } from "./etiqueta-form";
import { excluirEtiqueta } from "./actions";

export default async function EtiquetasPage() {
  const supabase = await createClient();
  const [{ data: prods }, { data: colabs }, { data: etiqs }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, validade_congelado, validade_resfriado, validade_ambiente")
        .eq("ativo", true)
        .order("nome"),
      supabase.from("colaboradores").select("nome").eq("ativo", true).order("nome"),
      supabase
        .from("etiquetas")
        .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade")
        .order("criado_em", { ascending: false })
        .limit(30),
    ]);

  const produtos =
    (prods as {
      id: string;
      nome: string;
      validade_congelado: number | null;
      validade_resfriado: number | null;
      validade_ambiente: number | null;
    }[]) ?? [];
  const colaboradores = (colabs as { nome: string }[]) ?? [];
  type Et = {
    id: string;
    numero: number;
    produto_nome: string;
    colaborador_nome: string | null;
    manipulado_em: string;
    validade: string | null;
  };
  const etiquetas = (etiqs as Et[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Etiquetas
        </h1>
        <p className="mt-1 text-zinc-500">
          Gere etiquetas de manipulação para os insumos da cozinha.
        </p>
      </div>

      <EtiquetaForm produtos={produtos} colaboradores={colaboradores} />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Últimas etiquetas
      </h2>
      {etiquetas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma etiqueta gerada ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Manipulado</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Por</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {etiquetas.map((e) => (
                <tr key={e.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-2 font-mono text-zinc-500">
                    #{e.numero}
                  </td>
                  <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {e.produto_nome}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(e.manipulado_em).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {e.validade ? dataBR(e.validade) : "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {e.colaborador_nome ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/etiquetas/${e.id}`}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Imprimir
                    </Link>
                    <form action={excluirEtiqueta} className="inline">
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-zinc-400 hover:text-red-600">
                        ×
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
