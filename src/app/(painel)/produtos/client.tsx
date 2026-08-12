"use client";

import { useMemo, useState } from "react";
import type { Produto, Categoria } from "@/lib/types";
import { salvarProduto, excluirProduto } from "./actions";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const UNIDADES = [
  "un", "kg", "g", "L", "ml", "cx", "pct", "fardo", "dz", "saco", "bandeja",
];

const moeda = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProdutosClient({
  produtos,
  categorias,
  categoriaInicial = "",
}: {
  produtos: Produto[];
  categorias: Categoria[];
  categoriaInicial?: string;
}) {
  const [editando, setEditando] = useState<Produto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(categoriaInicial);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const okBusca = !b || p.nome.toLowerCase().includes(b);
      const okCat = !categoria || p.categorias?.nome === categoria;
      return okBusca && okCat;
    });
  }, [produtos, busca, categoria]);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Produtos
          </h1>
          <p className="mt-1 text-zinc-500">
            {filtrados.length} de {produtos.length}
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Adicionar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={`${inputCls} max-w-xs`}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.nome}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Un.</th>
                <th className="px-4 py-3 text-right">Ideal</th>
                <th className="px-4 py-3">Preço ref.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtrados.map((p) => (
                <tr
                  key={p.id}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {p.nome}
                    {p.marca && (
                      <span className="block text-xs font-normal text-zinc-400">
                        {p.marca}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {p.categorias?.nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {p.unidade}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                    {p.estoque_ideal > 0 ? (
                      p.estoque_ideal
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {moeda(p.preco_referencia)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditando(p);
                        setAberto(true);
                      }}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Editar
                    </button>
                    <form action={excluirProduto} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-600"
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

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {editando ? "Editar produto" : "Novo produto"}
            </h2>
            <form
              action={async (fd) => {
                await salvarProduto(fd);
                setAberto(false);
              }}
              className="space-y-3"
            >
              {editando && (
                <input type="hidden" name="id" value={editando.id} />
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Nome *
                </label>
                <input
                  name="nome"
                  required
                  defaultValue={editando?.nome ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Categoria
                </label>
                <select
                  name="categoria_id"
                  defaultValue={editando?.categoria_id ?? ""}
                  className={inputCls}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Unidade
                  </label>
                  <select
                    name="unidade"
                    defaultValue={editando?.unidade ?? "un"}
                    className={inputCls}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Estoque ideal
                  </label>
                  <input
                    name="estoque_ideal"
                    inputMode="decimal"
                    defaultValue={editando?.estoque_ideal ?? 0}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="-mt-1 text-xs text-zinc-400">
                Estoque ideal = quanto você quer ter sempre. Na cotação, a
                sugestão de compra será: ideal − o que foi contado.
              </p>
              <input
                type="hidden"
                name="estoque_minimo"
                defaultValue={editando?.estoque_minimo ?? 0}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Validade após manipulação (dias)
                </label>
                <input
                  name="validade_dias"
                  inputMode="numeric"
                  placeholder="ex.: 3"
                  defaultValue={editando?.validade_dias ?? ""}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Usado nas etiquetas: valida = manipulação + dias.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Observações
                </label>
                <textarea
                  name="observacoes"
                  rows={2}
                  defaultValue={editando?.observacoes ?? ""}
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
