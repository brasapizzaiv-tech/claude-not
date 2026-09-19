"use client";

import { useMemo, useState } from "react";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";
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
  "w-full rounded-controle border border-borda-forte bg-white px-3 py-2 text-sm text-texto focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

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

  // Qual linha está indo pro servidor. Guarda a categoria, e não um sim/não,
  // pra rodinha aparecer só na linha que a pessoa mexeu.
  const [salvando, setSalvando] = useState<string | null>(null);

  async function mapear(categoriaId: string, dreId: string) {
    setSalvando(categoriaId);
    try {
      await mapearCategoriaDre(categoriaId, dreId || null);
      router.refresh();
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Categorias
          </h1>
          <p className="mt-1 text-texto-suave">
            {categorias.length} seções de produtos
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
        >
          + Adicionar
        </button>
      </div>

      <div className="overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Conta no DRE (compras)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {categorias.map((c) => (
              <tr
                key={c.id}
                className="transition hover:bg-superficie-suave"
              >
                <td className="px-4 py-3 font-medium text-texto">
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
                  <span className="inline-flex items-center gap-2">
                  <select
                    value={c.dreCategoriaId ?? ""}
                    onChange={(e) => mapear(c.id, e.target.value)}
                    disabled={salvando === c.id}
                    className="rounded-controle border border-borda-forte bg-white px-2 py-1 text-sm text-texto focus:border-orange-500 disabled:opacity-60 dark:border-borda-forte dark:bg-zinc-950"
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
                  {salvando === c.id && (
                    <Icone nome="esperando" tamanho={14} className="animate-spin text-texto-fraco" titulo="Salvando" />
                  )}
                  </span>
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
                    onSubmit={async (e) => {
                      if (
                        c.qtdProdutos > 0 &&
                        !await confirmar(
                          `"${c.nome}" tem ${c.qtdProdutos} produto(s). Eles ficarão sem categoria. Remover mesmo assim?`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <Enviar
                      className="text-texto-fraco hover:text-red-600"
                    >
                      Remover
                    </Enviar>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-cartao bg-painel-cartao p-6">
            <h2 className="mb-4 text-lg font-semibold text-texto">
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
                <label className="mb-1 block text-sm font-medium text-texto-suave">
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
                  className="rounded-controle px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave dark:text-texto-fraco"
                >
                  Cancelar
                </button>
                <Enviar
                  className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
                >
                  Salvar
                </Enviar>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
