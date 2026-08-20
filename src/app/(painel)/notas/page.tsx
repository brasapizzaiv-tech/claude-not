import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { UploadNota } from "./upload";
import { NotaAcoes } from "./nota-acoes";
import { BuscarNotas } from "./buscar-notas";
import { ManifestarLote } from "./manifestar-lote";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function NotasPage() {
  const supabase = await createClient();
  const [{ data }, { data: cfg }] = await Promise.all([
    supabase
      .from("notas_fiscais")
      .select(
        "id, numero, emit_nome, valor, data_emissao, vencimento, situacao, manifestado_em",
      )
      .order("data_emissao", { ascending: false })
      .limit(300),
    supabase.from("config_sefaz").select("bloqueado_ate").limit(1).maybeSingle(),
  ]);
  const bloqueadoAte = (cfg as { bloqueado_ate?: string | null } | null)?.bloqueado_ate ?? null;

  type Nota = {
    id: string;
    numero: string | null;
    emit_nome: string | null;
    valor: number;
    data_emissao: string | null;
    vencimento: string | null;
    situacao: string;
    manifestado_em: string | null;
  };
  const notas = (data as Nota[]) ?? [];

  // Checa itens das notas manifestadas ou pendentes (poucas) para saber quais
  // ainda estão em resumo (sem itens).
  const alvos = notas
    .filter((n) => n.manifestado_em || n.situacao === "pendente")
    .map((n) => n.id);
  const comItens = new Set<string>();
  if (alvos.length > 0) {
    const { data: itens } = await supabase
      .from("nota_itens")
      .select("nota_id")
      .in("nota_id", alvos);
    for (const i of (itens as { nota_id: string }[]) ?? [])
      comItens.add(i.nota_id);
  }
  const aguardando = (n: Nota) => !!n.manifestado_em && !comItens.has(n.id);
  // Notas em resumo (pendentes, sem itens) para manifestar em lote.
  const resumoParaManifestar = notas
    .filter((n) => n.situacao === "pendente" && !comItens.has(n.id))
    .map((n) => ({
      id: n.id,
      emit_nome: n.emit_nome,
      numero: n.numero,
      data_emissao: n.data_emissao,
    }));

  const badge: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    lancada: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    cancelada: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800",
  };
  const rotulo: Record<string, string> = {
    pendente: "pendente",
    lancada: "lançada",
    cancelada: "cancelada",
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
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
        <div className="flex items-center gap-2">
          <Link
            href="/notas/sefaz"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            SEFAZ automático
          </Link>
          <UploadNota />
        </div>
      </div>

      <div className="mb-6">
        <BuscarNotas bloqueadoAte={bloqueadoAte} />
      </div>

      <ManifestarLote notas={resumoParaManifestar} />

      {notas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma nota ainda. Clique em <b>+ Importar XML</b> e escolha os
          arquivos <b>.xml</b> das notas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
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
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          badge[n.situacao] ?? badge.pendente
                        }`}
                      >
                        {rotulo[n.situacao] ?? n.situacao}
                      </span>
                      {aguardando(n) && (
                        <span
                          className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          title="Manifestada — a busca automática vai trazer os itens em alguns minutos."
                        >
                          ⏳ aguardando itens
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <NotaAcoes notaId={n.id} situacao={n.situacao} />
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
