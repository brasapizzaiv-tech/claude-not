"use client";

import { useMemo, useState, useTransition } from "react";
import type { Produto, Categoria } from "@/lib/types";
import {
  salvarProduto,
  excluirProduto,
  definirFornecedoresDoProduto,
  vincularSemFornecedorNaFeira,
} from "./actions";

type Fornecedor = { id: string; nome: string };

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
  fornecedores,
  vinculos,
}: {
  produtos: Produto[];
  categorias: Categoria[];
  categoriaInicial?: string;
  fornecedores: Fornecedor[];
  vinculos: { produto_id: string; fornecedor_id: string }[];
}) {
  const [editando, setEditando] = useState<Produto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(categoriaInicial);

  // Vínculos produto -> fornecedores (editável na tela).
  const [vinc, setVinc] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const v of vinculos) {
      if (!m.has(v.produto_id)) m.set(v.produto_id, new Set());
      m.get(v.produto_id)!.add(v.fornecedor_id);
    }
    return m;
  });
  const [fornDe, setFornDe] = useState<Produto | null>(null);
  const semForn = produtos.filter((p) => !(vinc.get(p.id)?.size)).length;

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

      {semForn > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <span>
            {semForn} produto(s) sem nenhum fornecedor — não aparecem pra ninguém na cotação.
          </span>
          <FeiraBotao />
        </div>
      )}

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
                <th className="px-4 py-3">Fornecedores</th>
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
                  <td className="px-4 py-3">
                    {(() => {
                      const n = vinc.get(p.id)?.size ?? 0;
                      return (
                        <button
                          onClick={() => setFornDe(p)}
                          className={`rounded-md px-2 py-1 text-xs font-medium ${
                            n === 0
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {n === 0 ? "sem fornecedor" : `${n} fornecedor${n > 1 ? "es" : ""}`}
                        </button>
                      );
                    })()}
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
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      name="validade_congelado"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_congelado ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-zinc-400">Congelado</p>
                  </div>
                  <div>
                    <input
                      name="validade_resfriado"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_resfriado ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-zinc-400">Resfriado</p>
                  </div>
                  <div>
                    <input
                      name="validade_ambiente"
                      inputMode="numeric"
                      placeholder="—"
                      defaultValue={editando?.validade_ambiente ?? ""}
                      className={inputCls}
                    />
                    <p className="mt-1 text-center text-xs text-zinc-400">Ambiente</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Dias de validade por conservação (usado nas etiquetas).
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 p-3 dark:border-violet-900">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    name="tem_st"
                    defaultChecked={editando?.tem_st ?? false}
                  />
                  Este produto tem ICMS-ST
                </label>
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-zinc-500">
                    % de ST padrão (opcional) — já vem preenchida pro fornecedor
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      name="st_pct_padrao"
                      inputMode="decimal"
                      placeholder="Ex.: 17"
                      defaultValue={editando?.st_pct_padrao ?? ""}
                      className={`${inputCls} w-28`}
                    />
                    <span className="text-sm text-zinc-400">%</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Marcado: na cotação aparece um campo pro fornecedor dizer se a ST
                  já está no preço e qual a %. O custo já sai correto.
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

      {fornDe && (
        <FornecedoresModal
          produto={fornDe}
          fornecedores={fornecedores}
          selecionados={vinc.get(fornDe.id) ?? new Set()}
          onFechar={() => setFornDe(null)}
          onSalvo={(ids) => {
            const pid = fornDe.id;
            setVinc((m) => {
              const n = new Map(m);
              n.set(pid, new Set(ids));
              return n;
            });
            setFornDe(null);
          }}
        />
      )}
    </div>
  );
}

function FeiraBotao() {
  const [p, start] = useTransition();
  const [feito, setFeito] = useState<number | null>(null);
  return (
    <button
      onClick={() =>
        start(async () => {
          const r = await vincularSemFornecedorNaFeira();
          setFeito(r?.total ?? 0);
          setTimeout(() => window.location.reload(), 800);
        })
      }
      disabled={p}
      className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
    >
      {p
        ? "Vinculando..."
        : feito != null
          ? `✓ ${feito} vinculado(s) à Feira`
          : "Jogar todos na Hortifrúti / Feira"}
    </button>
  );
}

function FornecedoresModal({
  produto,
  fornecedores,
  selecionados,
  onFechar,
  onSalvo,
}: {
  produto: Produto;
  fornecedores: Fornecedor[];
  selecionados: Set<string>;
  onFechar: () => void;
  onSalvo: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selecionados));
  const [busca, setBusca] = useState("");
  const [p, start] = useTransition();

  const filtrados = fornecedores.filter(
    (f) => !busca.trim() || f.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function salvar() {
    start(async () => {
      const ids = [...sel];
      await definirFornecedoresDoProduto(produto.id, ids);
      onSalvo(ids);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="border-b border-zinc-100 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase text-zinc-400">Fornecedores de</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{produto.nome}</p>
          <input
            placeholder="Buscar fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${inputCls} mt-3`}
          />
          <p className="mt-1 text-xs text-zinc-400">{sel.size} marcado(s)</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtrados.map((f) => {
            const on = sel.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  on
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${on ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 dark:border-zinc-600"}`}>
                  {on ? "✓" : ""}
                </span>
                {f.nome}
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-400">Nenhum fornecedor.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 p-4 dark:border-zinc-800">
          <button
            onClick={onFechar}
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={p}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {p ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
