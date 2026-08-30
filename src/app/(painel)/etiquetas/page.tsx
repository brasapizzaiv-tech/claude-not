import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { EtiquetaForm } from "./etiqueta-form";
import { EtiquetaBaixa } from "./baixa";
import { excluirEtiqueta } from "./actions";

export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const sp = await searchParams;
  const historico = sp.ver === "historico";

  const supabase = await createClient();
  const [{ data: prods }, { data: colabs }, { data: imps }, { data: etiqs }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, validade_congelado, validade_resfriado, validade_ambiente")
        .eq("ativo", true)
        .order("nome"),
      supabase.from("colaboradores").select("nome").eq("ativo", true).order("nome"),
      supabase.from("impressoras").select("id, nome").eq("ativo", true).order("criado_em"),
      historico
        ? supabase
            .from("etiquetas")
            .select("id, numero, produto_nome, colaborador_nome, validade, conservacao, quantidade, unidade, status, baixa_em")
            .in("status", ["usada", "descartada"])
            .order("baixa_em", { ascending: false })
            .limit(100)
        : supabase
            .from("etiquetas")
            .select("id, numero, produto_nome, colaborador_nome, validade, conservacao, quantidade, unidade, status, baixa_em")
            .eq("status", "ativa")
            .order("validade", { ascending: true, nullsFirst: false })
            .limit(300),
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
  const impressoras = (imps as { id: string; nome: string }[]) ?? [];
  type Et = {
    id: string;
    numero: number;
    produto_nome: string;
    colaborador_nome: string | null;
    validade: string | null;
    conservacao: string | null;
    quantidade: number | null;
    unidade: string | null;
    status: string;
    baixa_em: string | null;
  };
  const etiquetas = (etiqs as Et[]) ?? [];

  const hoje = new Date().toISOString().slice(0, 10);
  const em2 = new Date(new Date().getTime() + 2 * 864e5).toISOString().slice(0, 10);
  const vencidas = etiquetas.filter((e) => e.validade && e.validade < hoje).length;
  const vencendo = etiquetas.filter(
    (e) => e.validade && e.validade >= hoje && e.validade <= em2,
  ).length;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Etiquetas
          </h1>
          <p className="mt-1 text-zinc-500">
            Gere etiquetas de manipulação e controle a validade dos insumos.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Link
            href="/impressao"
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            🖨️ Impressoras
          </Link>
          <Link
            href="/etiquetas/scanner"
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            📷 Modo Leitor
          </Link>
        </div>
      </div>

      <EtiquetaForm produtos={produtos} colaboradores={colaboradores} impressoras={impressoras} />

      {/* Abas + resumo */}
      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href="/etiquetas"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              !historico
                ? "bg-orange-500 text-white"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            Ativas
          </Link>
          <Link
            href="/etiquetas?ver=historico"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              historico
                ? "bg-orange-500 text-white"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            Histórico
          </Link>
        </div>
        {!historico && (
          <div className="flex gap-4 text-sm">
            <span className="text-red-600">{vencidas} vencida(s)</span>
            <span className="text-amber-600">{vencendo} vencendo</span>
          </div>
        )}
      </div>

      {etiquetas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          {historico ? "Nenhuma etiqueta baixada ainda." : "Nenhuma etiqueta ativa."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Por</th>
                <th className="px-4 py-3">{historico ? "Baixa" : ""}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {etiquetas.map((e) => {
                const venc = e.validade;
                const cor = !venc
                  ? "text-zinc-400"
                  : venc < hoje
                    ? "text-red-600 font-semibold"
                    : venc <= em2
                      ? "text-amber-600 font-medium"
                      : "text-green-600";
                return (
                  <tr key={e.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2 font-mono text-zinc-500">
                      #{e.numero}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {e.produto_nome}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {e.conservacao ? e.conservacao : ""}
                        {e.conservacao && e.quantidade != null ? " · " : ""}
                        {e.quantidade != null ? `${e.quantidade} ${e.unidade ?? ""}` : ""}
                      </div>
                    </td>
                    <td className={`px-4 py-2 ${cor}`}>
                      {venc ? dataBR(venc) : "—"}
                      {!historico && venc && venc < hoje ? " ⚠" : ""}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {e.colaborador_nome ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {historico
                        ? `${e.status}${e.baixa_em ? " · " + dataBR(e.baixa_em) : ""}`
                        : ""}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/etiquetas/${e.id}`}
                        className="mr-3 text-orange-600 hover:underline"
                      >
                        Imprimir
                      </Link>
                      <EtiquetaBaixa id={e.id} status={e.status} />
                      <form action={excluirEtiqueta} className="ml-2 inline">
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600">
                          ×
                        </button>
                      </form>
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
