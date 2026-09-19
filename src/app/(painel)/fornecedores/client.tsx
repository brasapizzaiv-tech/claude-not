"use client";

import { useState } from "react";
import type { Fornecedor } from "@/lib/types";
import { salvarFornecedor, excluirFornecedor } from "./actions";

const inputCls =
  "w-full rounded-controle border border-borda-forte bg-white px-3 py-2 text-sm text-texto focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

export function FornecedoresClient({
  fornecedores,
  categorias,
  categoriasProduto,
}: {
  fornecedores: Fornecedor[];
  categorias: { id: string; grupo: string; nome: string }[];
  categoriasProduto: { id: string; nome: string }[];
}) {
  const nomeCatProd = (id: string) => categoriasProduto.find((c) => c.id === id)?.nome ?? "";
  const nomeCat = (id: string | null | undefined) => {
    const c = categorias.find((x) => x.id === id);
    return c ? `${c.grupo} — ${c.nome}` : "";
  };
  const grupos = [...new Set(categorias.map((c) => c.grupo))];
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [aberto, setAberto] = useState(false);

  function abrirNovo() {
    setEditando(null);
    setAberto(true);
  }
  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    setAberto(true);
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Fornecedores
          </h1>
          <p className="mt-1 text-texto-suave">
            {fornecedores.length}{" "}
            {fornecedores.length === 1 ? "cadastrado" : "cadastrados"}
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
        >
          + Adicionar
        </button>
      </div>

      {fornecedores.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum fornecedor ainda. Clique em <b>+ Adicionar</b> para cadastrar o
          primeiro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {fornecedores.map((f) => (
                <tr
                  key={f.id}
                  className="transition hover:bg-superficie-suave"
                >
                  <td className="px-4 py-3 font-medium text-texto">
                    {f.nome}
                    {f.cnpj && (
                      <span className="block text-xs font-normal text-texto-fraco">
                        {f.cnpj}
                      </span>
                    )}
                    {(f.categoria_ids ?? []).length > 0 && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {(f.categoria_ids ?? []).map((c) => (
                          <span key={c} className="rounded-full bg-orange-100 px-2 py-0.5 text-mini font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                            {nomeCatProd(c) || "?"}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {f.contato ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {f.telefone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-texto-suave">
                    {f.whatsapp ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => abrirEdicao(f)}
                      className="mr-3 text-orange-600 hover:underline"
                    >
                      Editar
                    </button>
                    <form action={excluirFornecedor} className="inline">
                      <input type="hidden" name="id" value={f.id} />
                      <button
                        type="submit"
                        className="text-texto-fraco hover:text-red-600"
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
          <div className="w-full max-w-lg rounded-cartao bg-painel-cartao p-6">
            <h2 className="mb-4 text-lg font-semibold text-texto">
              {editando ? "Editar fornecedor" : "Novo fornecedor"}
            </h2>
            <form
              action={async (fd) => {
                await salvarFornecedor(fd);
                setAberto(false);
              }}
              className="space-y-3"
            >
              {editando && (
                <input type="hidden" name="id" value={editando.id} />
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Nome *
                </label>
                <input
                  name="nome"
                  required
                  defaultValue={editando?.nome ?? ""}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    CNPJ
                  </label>
                  <input
                    name="cnpj"
                    defaultValue={editando?.cnpj ?? ""}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    Contato
                  </label>
                  <input
                    name="contato"
                    defaultValue={editando?.contato ?? ""}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    Telefone
                  </label>
                  <input
                    name="telefone"
                    defaultValue={editando?.telefone ?? ""}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-texto-suave">
                    WhatsApp
                  </label>
                  <input
                    name="whatsapp"
                    defaultValue={editando?.whatsapp ?? ""}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  E-mail
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editando?.email ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-texto-suave">
                  Observações
                </label>
                <textarea
                  name="observacoes"
                  rows={2}
                  defaultValue={editando?.observacoes ?? ""}
                  className={inputCls}
                />
              </div>

              {/* Categorias de produto que ele fornece → cotação já sugere/envia pra ele */}
              <div className="rounded-cartao border border-orange-200 bg-orange-50/40 p-3 dark:border-orange-900 dark:bg-orange-950/10">
                <p className="mb-1 text-xs font-bold text-texto-fraco">O que este fornecedor vende (categorias de produto)</p>
                <p className="mb-2 text-mini text-texto-suave">
                  Ao salvar, ele fica vinculado a todos os produtos dessas categorias — a cotação já sugere ele e manda os itens. Produto novo na categoria entra sozinho.
                </p>
                {categoriasProduto.length === 0 ? (
                  <p className="text-xs text-texto-fraco">Nenhuma categoria de produto cadastrada.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {categoriasProduto.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-1 rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-sm">
                        <input type="checkbox" name="categoria_ids" value={c.id} defaultChecked={(editando?.categoria_ids ?? []).includes(c.id)} />
                        {c.nome}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Padrão das notas: já vem preenchido ao vincular/importar uma nota dele */}
              <div className="rounded-cartao border border-borda p-3">
                <p className="mb-2 text-xs font-bold text-texto-fraco">Padrão das notas deste fornecedor</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">Categoria da despesa (DRE)</label>
                    <select name="dre_categoria_id" defaultValue={editando?.dre_categoria_id ?? ""} className={inputCls}>
                      <option value="">— nenhuma (escolher em cada nota) —</option>
                      {grupos.map((g) => (
                        <optgroup key={g} label={g}>
                          {categorias.filter((c) => c.grupo === g).map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-texto-suave">Tipo de nota</label>
                    <select name="tipo_nota" defaultValue={editando?.tipo_nota ?? ""} className={inputCls}>
                      <option value="">— como vier —</option>
                      <option value="mercadoria">Mercadoria</option>
                      <option value="servico">Serviço</option>
                    </select>
                  </div>
                </div>
                <p className="mt-1 text-mini text-texto-fraco">Ex.: conta de luz → Serviço + Energia elétrica. Na nota, dá pra trocar se precisar.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-controle px-4 py-2 text-sm text-texto-suave hover:bg-superficie-suave dark:text-texto-fraco"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
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
