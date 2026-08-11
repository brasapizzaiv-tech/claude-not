"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Contagem, Produto } from "@/lib/types";
import {
  salvarContagemItens,
  finalizarContagem,
  reabrirContagem,
} from "../actions";

type ItemInicial = {
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
};

const numInput =
  "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-right text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ContarClient({
  contagem,
  produtos,
  itens,
}: {
  contagem: Contagem;
  produtos: Produto[];
  itens: ItemInicial[];
}) {
  const finalizada = contagem.status === "finalizada";
  const formRef = useRef<HTMLFormElement>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [salvando, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const iniciais = useMemo(() => {
    const m = new Map<string, ItemInicial>();
    itens.forEach((i) => m.set(i.produto_id, i));
    return m;
  }, [itens]);

  const categorias = useMemo(
    () =>
      [
        ...new Set(produtos.map((p) => p.categorias?.nome).filter(Boolean)),
      ].sort() as string[],
    [produtos],
  );

  // Produtos agrupados por categoria (para exibir em seções).
  const grupos = useMemo(() => {
    const m = new Map<string, Produto[]>();
    for (const p of produtos) {
      const cat = p.categorias?.nome ?? "Sem categoria";
      const arr = m.get(cat) ?? [];
      arr.push(p);
      m.set(cat, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [produtos]);

  function visivel(p: Produto) {
    const b = busca.trim().toLowerCase();
    const okB = !b || p.nome.toLowerCase().includes(b);
    const okC = !categoria || p.categorias?.nome === categoria;
    return okB && okC;
  }

  function ler(nome: string) {
    const el = formRef.current?.elements.namedItem(nome) as
      | HTMLInputElement
      | undefined;
    return Number((el?.value ?? "").replace(",", ".")) || 0;
  }

  function sugerirPedidos() {
    const form = formRef.current;
    if (!form) return;
    for (const p of produtos) {
      if (p.estoque_minimo > 0) {
        const est = ler(`estoque_${p.id}`);
        const pedir = Math.max(0, p.estoque_minimo - est);
        const el = form.elements.namedItem(
          `pedir_${p.id}`,
        ) as HTMLInputElement | null;
        if (el) el.value = pedir ? String(pedir) : "";
      }
    }
    setMsg("Sugestões preenchidas (onde há estoque mínimo). Revise e salve.");
    setTimeout(() => setMsg(null), 4000);
  }

  function montarItens() {
    return produtos.map((p) => ({
      produto_id: p.id,
      qtd_estoque: ler(`estoque_${p.id}`),
      qtd_pedir: ler(`pedir_${p.id}`),
    }));
  }

  function salvar() {
    startSave(async () => {
      const r = await salvarContagemItens(contagem.id, montarItens());
      setMsg(`Salvo! (${r?.gravados ?? 0} itens com valor lançado)`);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  function finalizar() {
    startSave(async () => {
      await salvarContagemItens(contagem.id, montarItens());
      const fd = new FormData();
      fd.set("id", contagem.id);
      await finalizarContagem(fd);
    });
  }

  function reabrir() {
    startSave(async () => {
      const fd = new FormData();
      fd.set("id", contagem.id);
      await reabrirContagem(fd);
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        href="/contagens"
        className="text-sm text-zinc-500 hover:text-orange-600"
      >
        ← Voltar para contagens
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {contagem.descricao}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {new Date(contagem.data).toLocaleDateString("pt-BR")} ·{" "}
            {finalizada ? "Finalizada" : "Rascunho"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {finalizada ? (
            <button
              onClick={reabrir}
              disabled={salvando}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reabrir
            </button>
          ) : (
            <>
              <Link
                href={`/contagens/${contagem.id}/atribuir`}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Dividir por categoria
              </Link>
              <button
                onClick={sugerirPedidos}
                disabled={salvando}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Sugerir pedidos
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button
                onClick={finalizar}
                disabled={salvando}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
              >
                Finalizar
              </button>
            </>
          )}
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
                <th className="px-4 py-3 text-right">Estoque mín.</th>
                <th className="px-4 py-3 text-right">Em estoque</th>
                <th className="px-4 py-3 text-right">Pedir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.map(([cat, itensCat]) => {
                const algumVisivel = itensCat.some(visivel);
                return (
                  <Fragment key={cat}>
                    <tr className={algumVisivel ? "" : "hidden"}>
                      <td
                        colSpan={5}
                        className="bg-zinc-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900"
                      >
                        {cat}
                        <span className="ml-2 font-normal text-zinc-400">
                          ({itensCat.length})
                        </span>
                      </td>
                    </tr>
                    {itensCat.map((p) => {
                      const ini = iniciais.get(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`bg-white dark:bg-zinc-950 ${
                            visivel(p) ? "" : "hidden"
                          }`}
                        >
                          <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                            {p.nome}
                          </td>
                          <td className="px-4 py-2 text-zinc-500">
                            {p.unidade}
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-400">
                            {p.estoque_minimo > 0 ? p.estoque_minimo : "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`estoque_${p.id}`}
                              inputMode="decimal"
                              disabled={finalizada}
                              defaultValue={
                                ini?.qtd_estoque ? ini.qtd_estoque : ""
                              }
                              className={numInput}
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              name={`pedir_${p.id}`}
                              inputMode="decimal"
                              disabled={finalizada}
                              defaultValue={ini?.qtd_pedir ? ini.qtd_pedir : ""}
                              className={`${numInput} font-semibold text-orange-600`}
                            />
                          </td>
                        </tr>
                      );
                    })}
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
