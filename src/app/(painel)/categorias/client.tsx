"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DreCategoria } from "@/lib/types";
import {
  salvarCategoria,
  excluirCategoria,
  mapearCategoriaDre,
} from "./actions";

export type CategoriaComContagem = {
  id: string;
  nome: string;
  qtdProdutos: number;
  dreCategoriaId: string | null;
};

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CategoriasClient({
  categorias,
  dreCategorias,
}: {
  categorias: CategoriaComContagem[];
  dreCategorias: DreCategoria[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<CategoriaComContagem | null>(null);
  const [aberto, setAberto] = useState(false);

  const porGrupo = useMemo(() => {
    const m = new Map<string, DreCategoria[]>();
    for (const d of dreCategorias) {
      const arr = m.get(d.grupo) ?? [];
      arr.push(d);
      m.set(d.grupo, arr);
    }
    return m;
  }, [dreCategorias]);

  async function mapear(categoriaId: string, dreId: string) {
    await mapearCategoriaDre(categoriaId, dreId || null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Categorias
          </h1>
          <p className="mt-1 text-zinc-500">
            {categorias.length} seções de produtos
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

      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Conta no DRE (compras)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categorias.map((c) => (
              <tr
                key={c.id}
                className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {c.nome}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/produtos?categoria=${encodeURIComponent(c.nome)}`}
                    className="text-orange-600 hover:underline"
                  >
                    {c.qtdProdutos} produto{c.qtdProdutos === 1 ? "" : "s"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={c.dreCategoriaId ?? ""}
                    onChange={(e) => mapear(c.id, e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">— não lançar —</option>
                    {[...porGrupo.entries()].map(([grupo, ds]) => (
                      <optgroup key={grupo} label={grupo}>
                        {ds.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nome}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setEditando(c);
                      setAberto(true);
                    }}
                    className="mr-3 text-orange-600 hover:underline"
                  >
                    Editar
                  </button>
                  <form
                    action={excluirCategoria}
                    className="inline"
                    onSubmit={(e) => {
                      if (
                        c.qtdProdutos > 0 &&
                        !confirm(
                          `"${c.nome}" tem ${c.qtdProdutos} produto(s). Eles ficarão sem categoria. Remover mesmo assim?`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={c.id} />
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

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {editando ? "Editar categoria" : "Nova categoria"}
            </h2>
            <form
              action={async (fd) => {
                await salvarCategoria(fd);
                setAberto(false);
              }}
              className="space-y-3"
            >
              {editando && <input type="hidden" name="id" value={editando.id} />}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Nome *
                </label>
                <input
                  name="nome"
                  required
                  autoFocus
                  defaultValue={editando?.nome ?? ""}
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
