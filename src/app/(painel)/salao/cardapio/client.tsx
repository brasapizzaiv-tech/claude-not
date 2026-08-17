"use client";

import { useState } from "react";
import { salvarConfigPdv, salvarItem, excluirItem } from "../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Item = { id: string; nome: string; categoria: string | null; preco: number };

export function CardapioClient({
  config,
  itens,
}: {
  config: Record<string, string>;
  itens: Item[];
}) {
  const [editando, setEditando] = useState<Item | null>(null);
  const precoKg = Number(config.preco_kg || 0);

  const categorias = [
    ...new Set(itens.map((i) => i.categoria).filter(Boolean)),
  ] as string[];

  const grupos = new Map<string, Item[]>();
  for (const i of itens) {
    const k = i.categoria || "Sem categoria";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }

  return (
    <div className="space-y-6">
      {/* Configurações do buffet/serviço */}
      <form
        action={salvarConfigPdv}
        className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Configurações do buffet
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-zinc-500">
              Nome do restaurante (no cupom)
            </label>
            <input
              name="nome_restaurante"
              defaultValue={config.nome_restaurante ?? ""}
              placeholder="Ex.: Brasa Restaurante"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Qtd. de mesas</label>
            <input
              name="qtd_mesas"
              inputMode="numeric"
              defaultValue={config.qtd_mesas ?? "40"}
              placeholder="40"
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tara padrão (kg)</label>
            <input
              name="tara_padrao"
              inputMode="decimal"
              defaultValue={
                Number(config.tara_padrao || 0)
                  ? String(config.tara_padrao).replace(".", ",")
                  : ""
              }
              placeholder="0,000"
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Preço por kg
            </label>
            <input
              name="preco_kg"
              inputMode="decimal"
              defaultValue={precoKg ? String(precoKg).replace(".", ",") : ""}
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Buffet livre (teto R$)
            </label>
            <input
              name="buffet_livre"
              inputMode="decimal"
              defaultValue={
                Number(config.buffet_livre || 0)
                  ? String(config.buffet_livre).replace(".", ",")
                  : ""
              }
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              acima disso, cobra fixo (0 = desligado)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Serviço (%)</label>
            <input
              name="servico_percent"
              inputMode="decimal"
              defaultValue={config.servico_percent ?? "10"}
              className={`${inputCls} w-20`}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              name="servico_so_noite"
              defaultChecked={config.servico_so_noite === "1"}
              className="h-4 w-4"
            />
            só à noite, a partir de
          </label>
          <div>
            <input
              type="time"
              name="servico_inicio"
              defaultValue={config.servico_inicio || "18:00"}
              className={inputCls}
            />
          </div>
        </div>
        <div className="space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500">
            Dados no cupom (opcionais)
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              name="cupom_endereco"
              defaultValue={config.cupom_endereco ?? ""}
              placeholder="Endereço"
              className={`${inputCls} min-w-56 flex-1`}
            />
            <input
              name="cupom_telefone"
              defaultValue={config.cupom_telefone ?? ""}
              placeholder="Telefone / WhatsApp"
              className={inputCls}
            />
          </div>
          <input
            name="cupom_msg"
            defaultValue={config.cupom_msg ?? ""}
            placeholder="Mensagem (ex.: Obrigado pela preferência!)"
            className={`${inputCls} w-full`}
          />
        </div>
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Salvar configurações
        </button>
      </form>

      {/* Novo/editar item */}
      <form
        key={editando?.id ?? "novo"}
        action={async (fd) => {
          await salvarItem(fd);
          setEditando(null);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        {editando && <input type="hidden" name="id" value={editando.id} />}
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Item</label>
          <input
            name="nome"
            required
            defaultValue={editando?.nome ?? ""}
            placeholder="Ex.: Pizza Calabresa"
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
          <input
            name="categoria"
            list="cats"
            defaultValue={editando?.categoria ?? ""}
            placeholder="Pizzas, Bebidas..."
            className={inputCls}
          />
          <datalist id="cats">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Preço</label>
          <input
            name="preco"
            inputMode="decimal"
            defaultValue={editando ? String(editando.preco).replace(".", ",") : ""}
            placeholder="0,00"
            className={`${inputCls} w-28`}
          />
        </div>
        <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          {editando ? "Salvar" : "+ Adicionar"}
        </button>
        {editando && (
          <button
            type="button"
            onClick={() => setEditando(null)}
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
        )}
      </form>

      {/* Lista */}
      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum item no cardápio ainda. Adicione acima.
        </div>
      ) : (
        <div className="space-y-4">
          {[...grupos.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([cat, its]) => (
              <div key={cat}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {cat} ({its.length})
                </h2>
                <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {its.map((i) => (
                        <tr key={i.id} className="bg-white dark:bg-zinc-950">
                          <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                            {i.nome}
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {moeda(Number(i.preco))}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => setEditando(i)}
                              className="mr-3 text-orange-600 hover:underline"
                            >
                              Editar
                            </button>
                            <form action={excluirItem} className="inline">
                              <input type="hidden" name="id" value={i.id} />
                              <button className="text-zinc-400 hover:text-red-600">
                                Remover
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
