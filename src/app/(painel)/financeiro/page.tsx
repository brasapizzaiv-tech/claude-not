import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DreCategoria } from "@/lib/types";
import { criarLancamento, excluirLancamento } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}
function desloca(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAtual();
  const ini = `${mes}-01`;
  const fim = `${desloca(mes, 1)}-01`;

  const supabase = await createClient();
  const [{ data: catData }, { data: lancData }] = await Promise.all([
    supabase.from("dre_categorias").select("*").eq("ativo", true).order("ordem"),
    supabase
      .from("lancamentos")
      .select("id, data, descricao, valor, forma_pagamento, origem, dre_categorias(nome, tipo, grupo), fornecedores(nome)")
      .gte("data", ini)
      .lt("data", fim)
      .order("data", { ascending: false }),
  ]);

  const categorias = (catData as DreCategoria[]) ?? [];
  type Lanc = {
    id: string;
    data: string;
    descricao: string | null;
    valor: number;
    forma_pagamento: string | null;
    origem: string;
    dre_categorias: { nome?: string; tipo?: string; grupo?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  const lancamentos = (lancData as unknown as Lanc[]) ?? [];

  let receitas = 0;
  let saidas = 0;
  for (const l of lancamentos) {
    if (l.dre_categorias?.tipo === "receita") receitas += Number(l.valor);
    else if (l.dre_categorias?.tipo !== "nao_operacional")
      saidas += Number(l.valor);
  }
  const resultado = receitas - saidas;

  // Agrupa categorias por grupo para o select.
  const porGrupo = new Map<string, DreCategoria[]>();
  for (const c of categorias) {
    const arr = porGrupo.get(c.grupo) ?? [];
    arr.push(c);
    porGrupo.set(c.grupo, arr);
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Financeiro
          </h1>
          <p className="mt-1 text-zinc-500">
            Lançamentos de receitas e despesas. Pedidos conferidos entram
            sozinhos como CMV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro?mes=${desloca(mes, -1)}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            ‹
          </Link>
          <span className="min-w-40 text-center text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
            {rotuloMes(mes)}
          </span>
          <Link
            href={`/financeiro?mes=${desloca(mes, 1)}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            ›
          </Link>
          <Link
            href={`/financeiro/dre?mes=${mes}`}
            className="ml-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Ver DRE →
          </Link>
        </div>
      </div>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Receitas</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {moeda(receitas)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Despesas</p>
          <p className="mt-1 text-xl font-bold text-red-600">{moeda(saidas)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Resultado</p>
          <p
            className={`mt-1 text-xl font-bold ${
              resultado >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {moeda(resultado)}
          </p>
        </div>
      </div>

      {/* Novo lançamento */}
      <form
        action={criarLancamento}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Data</label>
          <input type="date" name="data" defaultValue={`${mes}-01`} className={inputCls} />
        </div>
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
          <select name="categoria_id" required className={`${inputCls} w-full`}>
            <option value="">Escolha...</option>
            {[...porGrupo.entries()].map(([grupo, cs]) => (
              <optgroup key={grupo} label={grupo}>
                {cs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Valor (R$)</label>
          <input name="valor" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-28`} />
        </div>
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Descrição</label>
          <input name="descricao" placeholder="opcional" className={`${inputCls} w-full`} />
        </div>
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Lançar
        </button>
      </form>

      {/* Lista */}
      {lancamentos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum lançamento neste mês.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lancamentos.map((l) => {
                const receita = l.dre_categorias?.tipo === "receita";
                return (
                  <tr key={l.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2 text-zinc-500">
                      {new Date(l.data).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      {l.dre_categorias?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {l.descricao ??
                        (l.fornecedores?.nome ? l.fornecedores.nome : "")}
                      {l.origem === "pedido" && (
                        <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                          auto
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        receita ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {receita ? "" : "- "}
                      {moeda(Number(l.valor))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.origem === "manual" && (
                        <form action={excluirLancamento} className="inline">
                          <input type="hidden" name="id" value={l.id} />
                          <button className="text-zinc-400 hover:text-red-600">
                            Remover
                          </button>
                        </form>
                      )}
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
