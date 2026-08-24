"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Cotacao } from "@/lib/types";
import { dataBR } from "@/lib/format";
import {
  salvarCotacaoItens,
  fecharCotacao,
  reabrirCotacao,
} from "../actions";

export type LinhaProduto = {
  id: string;
  nome: string;
  unidade: string;
  categoria: string;
  contado: number;
  ideal: number;
  sugestao: number;
  fardo: number; // unidades por fardo (0 = por unidade)
  qtd: number;
};

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const numInput =
  "w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CotacaoClient({
  cotacao,
  temContagem,
  linhas,
}: {
  cotacao: Cotacao;
  temContagem: boolean;
  linhas: LinhaProduto[];
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, startSave] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fechada = cotacao.status === "fechada";

  const categorias = useMemo(
    () => [...new Set(linhas.map((l) => l.categoria))].sort(),
    [linhas],
  );

  const porCategoria = useMemo(() => {
    const m = new Map<string, LinhaProduto[]>();
    for (const l of linhas) {
      const arr = m.get(l.categoria) ?? [];
      arr.push(l);
      m.set(l.categoria, arr);
    }
    return m;
  }, [linhas]);

  const visivel = (l: LinhaProduto) =>
    (!categoria || l.categoria === categoria) &&
    (!busca || l.nome.toLowerCase().includes(busca.toLowerCase()));

  const ler = (name: string) => {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | undefined;
    const v = Number((el?.value ?? "").replace(",", "."));
    return isNaN(v) ? 0 : v;
  };

  function montarItens() {
    return linhas.map((l) => ({ produto_id: l.id, qtd: ler(`qtd_${l.id}`) }));
  }

  function usarSugestao() {
    const form = formRef.current;
    if (!form) return;
    for (const l of linhas) {
      const el = form.elements.namedItem(`qtd_${l.id}`) as
        | HTMLInputElement
        | null;
      if (el) el.value = l.sugestao ? String(l.sugestao) : "";
    }
    setMsg("Quantidades preenchidas com a sugestão. Revise e salve.");
    setTimeout(() => setMsg(null), 4000);
  }

  function salvar() {
    startSave(async () => {
      const r = await salvarCotacaoItens(cotacao.id, montarItens());
      setMsg(`Salvo! (${r?.gravados ?? 0} itens para cotar)`);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  function alternarStatus() {
    startSave(async () => {
      const fd = new FormData();
      fd.set("id", cotacao.id);
      if (fechada) await reabrirCotacao(fd);
      else await fecharCotacao(fd);
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        href="/cotacoes"
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para cotações
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {cotacao.descricao}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dataBR(cotacao.data)} ·{" "}
            {fechada ? "Fechada" : "Aberta"} ·{" "}
            {temContagem
              ? "cotando só os itens da contagem (sugestão = ideal − contado)"
              : "sem contagem (sugestão = ideal)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!fechada && (
            <>
              <button
                onClick={usarSugestao}
                disabled={salvando}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Preencher com a sugestão
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </>
          )}
          <Link
            href={`/cotacoes/${cotacao.id}/fornecedores`}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Fornecedores →
          </Link>
          <Link
            href={`/cotacoes/${cotacao.id}/comparar`}
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Comparar preços →
          </Link>
          <button
            onClick={alternarStatus}
            disabled={salvando}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {fechada ? "Reabrir" : "Fechar"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${campo} max-w-xs`}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={`${campo} max-w-xs`}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <form ref={formRef}>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Un.</th>
                <th className="px-4 py-3 text-right">Contado</th>
                <th className="px-4 py-3 text-right">Ideal</th>
                <th className="px-4 py-3 text-right">Sugestão</th>
                <th className="px-4 py-3 text-right">A cotar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {[...porCategoria.entries()].map(([cat, itensCat]) => {
                const algumVisivel = itensCat.some(visivel);
                return (
                  <Fragment key={cat}>
                    <tr className={algumVisivel ? "" : "hidden"}>
                      <td
                        colSpan={6}
                        className="bg-zinc-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900"
                      >
                        {cat} ({itensCat.length})
                      </td>
                    </tr>
                    {itensCat.map((l) => (
                      <tr
                        key={l.id}
                        className={`bg-white dark:bg-zinc-950 ${
                          visivel(l) ? "" : "hidden"
                        }`}
                      >
                        <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                          {l.nome}
                        </td>
                        <td className="px-4 py-2 text-zinc-500">{l.unidade}</td>
                        <td className="px-4 py-2 text-right text-zinc-400">
                          {temContagem ? l.contado : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-400">
                          {l.ideal > 0 ? l.ideal : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-zinc-500">
                          {l.sugestao > 0 ? l.sugestao : "—"}
                          {l.fardo > 1 && l.sugestao > 0 && (
                            <span className="ml-1 block text-[10px] font-normal text-zinc-400">
                              {l.sugestao / l.fardo} fardo{l.sugestao / l.fardo === 1 ? "" : "s"} de {l.fardo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            name={`qtd_${l.id}`}
                            inputMode="decimal"
                            disabled={fechada}
                            defaultValue={l.qtd ? l.qtd : ""}
                            className={`${numInput} font-semibold text-orange-600`}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </form>
    </div>
  );
}
