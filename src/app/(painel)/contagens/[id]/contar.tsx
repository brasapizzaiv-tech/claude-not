"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Contagem, Produto } from "@/lib/types";
import { dataBR } from "@/lib/format";
import { calcular } from "@/components/estoque-input";
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
  "w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-right text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
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
  // Itens já contados (linha existente = contado, inclusive "contei 0").
  const [preenchidos, setPreenchidos] = useState<Set<string>>(
    () => new Set(itens.map((i) => i.produto_id)),
  );
  // Aviso "faltam itens" antes de salvar/finalizar.
  const [aviso, setAviso] = useState<{ faltam: string[]; acao: "salvar" | "finalizar" } | null>(null);

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
    return calcular(el?.value ?? "");
  }

  function montarItens() {
    return produtos.map((p) => ({
      produto_id: p.id,
      qtd_estoque: ler(`estoque_${p.id}`),
      qtd_pedir: 0,
      contado: preenchidos.has(p.id),
    }));
  }

  // Produtos ainda NÃO contados (nem valor, nem "contei 0").
  const faltantes = useMemo(
    () => produtos.filter((p) => !preenchidos.has(p.id)),
    [produtos, preenchidos],
  );

  // Marca o item como contado (ao digitar) ou não (campo esvaziado).
  function marcar(id: string, cheio: boolean) {
    setPreenchidos((s) => {
      if (cheio === s.has(id)) return s;
      const n = new Set(s);
      if (cheio) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  // Botão "0": preenche 0 e marca como contado (item que de fato zerou).
  function contarZero(id: string) {
    const el = formRef.current?.elements.namedItem(`estoque_${id}`) as HTMLInputElement | undefined;
    if (el) el.value = "0";
    marcar(id, true);
  }

  function gravar(entao?: () => Promise<void>) {
    startSave(async () => {
      const r = await salvarContagemItens(contagem.id, montarItens());
      if (entao) await entao();
      else {
        setMsg(`Salvo! (${r?.gravados ?? 0} itens contados)`);
        setTimeout(() => setMsg(null), 4000);
      }
    });
  }

  function salvar() {
    if (faltantes.length > 0) {
      setAviso({ faltam: faltantes.map((p) => p.nome), acao: "salvar" });
      return;
    }
    gravar();
  }

  function finalizar() {
    if (faltantes.length > 0) {
      setAviso({ faltam: faltantes.map((p) => p.nome), acao: "finalizar" });
      return;
    }
    gravar(async () => {
      const fd = new FormData();
      fd.set("id", contagem.id);
      await finalizarContagem(fd);
    });
  }

  // Confirmou no aviso: salva/finaliza mesmo com itens faltando.
  function confirmarAviso() {
    const acao = aviso?.acao;
    setAviso(null);
    if (acao === "finalizar") {
      gravar(async () => {
        const fd = new FormData();
        fd.set("id", contagem.id);
        await finalizarContagem(fd);
      });
    } else {
      gravar();
    }
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
            {dataBR(contagem.data)} ·{" "}
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
              <span className="text-sm text-zinc-500">
                {faltantes.length === 0 ? (
                  <span className="font-medium text-emerald-600">✓ Tudo contado</span>
                ) : (
                  <>
                    Faltam <b className="text-amber-600">{faltantes.length}</b> de {produtos.length}
                  </>
                )}
              </span>
              <Link
                href={`/contagens/${contagem.id}/atribuir`}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Dividir por categoria
              </Link>
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
                <th className="px-4 py-3 text-right">
                  Em estoque
                  <span className="ml-1 font-normal normal-case text-zinc-400">
                    (dá pra somar/calcular: 12+8, 3*12)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.map(([cat, itensCat]) => {
                const algumVisivel = itensCat.some(visivel);
                return (
                  <Fragment key={cat}>
                    <tr className={algumVisivel ? "" : "hidden"}>
                      <td
                        colSpan={3}
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
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {!preenchidos.has(p.id) && !finalizada && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                  falta
                                </span>
                              )}
                              {!finalizada && (
                                <button
                                  type="button"
                                  onClick={() => contarZero(p.id)}
                                  title="Contei e deu 0 (item zerado)"
                                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                >
                                  0
                                </button>
                              )}
                              <input
                                name={`estoque_${p.id}`}
                                inputMode="decimal"
                                disabled={finalizada}
                                defaultValue={ini ? String(ini.qtd_estoque) : ""}
                                onChange={(e) => marcar(p.id, e.target.value.trim() !== "")}
                                className={numInput}
                              />
                            </div>
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

      {aviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-950">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Faltam {aviso.faltam.length} {aviso.faltam.length === 1 ? "item" : "itens"} sem contar
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Esses produtos ficaram em branco. Se algum realmente zerou, use o botão{" "}
              <b>0</b> nele. Se não for contar, pode salvar assim mesmo.
            </p>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 p-2 text-sm dark:border-zinc-800">
              {aviso.faltam.map((n) => (
                <div key={n} className="px-1 py-0.5 text-zinc-700 dark:text-zinc-300">
                  • {n}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAviso(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Voltar e preencher
              </button>
              <button
                onClick={confirmarAviso}
                disabled={salvando}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  aviso.acao === "finalizar" ? "bg-orange-500 hover:bg-orange-600" : "bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700"
                }`}
              >
                {aviso.acao === "finalizar" ? "Finalizar assim mesmo" : "Salvar assim mesmo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
