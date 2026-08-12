import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { UploadOfx } from "./upload";
import { TransacaoAcoes } from "./acoes";
import { excluirTransacao } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function BancoPage() {
  const supabase = await createClient();

  const [{ data: transData }, { data: lancData }] = await Promise.all([
    supabase
      .from("transacoes_banco")
      .select("id, data, valor, descricao, lancamento_id, lancamentos(descricao)")
      .order("data", { ascending: false })
      .limit(500),
    supabase
      .from("lancamentos")
      .select("id, data, valor, descricao, dre_categorias(tipo, nome), fornecedores(nome)")
      .order("data", { ascending: false })
      .limit(1000),
  ]);

  type Trans = {
    id: string;
    data: string;
    valor: number;
    descricao: string | null;
    lancamento_id: string | null;
    lancamentos: { descricao?: string } | null;
  };
  type Lanc = {
    id: string;
    data: string;
    valor: number;
    descricao: string | null;
    dre_categorias: { tipo?: string; nome?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  const transacoes = (transData as unknown as Trans[]) ?? [];
  const lancs = (lancData as unknown as Lanc[]) ?? [];

  // Lançamentos já usados por alguma transação.
  const usados = new Set(
    transacoes.filter((t) => t.lancamento_id).map((t) => t.lancamento_id),
  );
  const diasEntre = (a: string, b: string) =>
    Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 864e5);

  // Sugere um lançamento para cada transação não conciliada (guloso, sem repetir).
  const rotulos = new Map<string, string>();
  const sugestoes = new Map<string, string>();
  for (const t of transacoes) {
    if (t.lancamento_id) continue;
    const querReceita = Number(t.valor) > 0;
    const alvo = Math.abs(Number(t.valor));
    const cand = lancs
      .filter(
        (l) =>
          !usados.has(l.id) &&
          Math.abs(Number(l.valor) - alvo) < 0.005 &&
          (l.dre_categorias?.tipo === "receita") === querReceita,
      )
      .sort((a, b) => diasEntre(a.data, t.data) - diasEntre(b.data, t.data))[0];
    if (cand) {
      sugestoes.set(t.id, cand.id);
      usados.add(cand.id);
      rotulos.set(
        t.id,
        `${cand.descricao ?? cand.fornecedores?.nome ?? cand.dre_categorias?.nome ?? "lançamento"} · ${dataBR(cand.data)}`,
      );
    }
  }

  const aConciliar = transacoes.filter((t) => !t.lancamento_id).length;
  const conciliadas = transacoes.length - aConciliar;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Conciliação bancária
          </h1>
          <p className="mt-1 text-zinc-500">
            Importe o extrato (OFX) e case as transações com os lançamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <UploadOfx />
        </div>
      </div>

      {transacoes.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">Conciliadas</p>
            <p className="mt-1 text-xl font-bold text-green-600">{conciliadas}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">A conciliar</p>
            <p className="mt-1 text-xl font-bold text-amber-600">{aConciliar}</p>
          </div>
        </div>
      )}

      {transacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma transação ainda. Clique em <b>Importar extrato (OFX)</b> e
          escolha o arquivo do seu banco.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição (banco)</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Lançamento</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {transacoes.map((t) => {
                const conciliado = !!t.lancamento_id;
                const entrada = Number(t.valor) > 0;
                return (
                  <tr key={t.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2 text-zinc-500">{dataBR(t.data)}</td>
                    <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      {t.descricao}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        entrada ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {moeda(Number(t.valor))}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {conciliado ? (
                        <span className="text-green-600">
                          ✓ {t.lancamentos?.descricao ?? "conciliado"}
                        </span>
                      ) : rotulos.get(t.id) ? (
                        <span className="text-zinc-500">
                          sugestão: {rotulos.get(t.id)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <TransacaoAcoes
                        transacaoId={t.id}
                        conciliado={conciliado}
                        sugestaoId={sugestoes.get(t.id) ?? null}
                      />
                      <form action={excluirTransacao} className="ml-3 inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-zinc-300 hover:text-red-600 dark:text-zinc-600">
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
