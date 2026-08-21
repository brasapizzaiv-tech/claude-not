"use client";

import { useState } from "react";
import Link from "next/link";
import {
  salvarConfigPdv,
  salvarItem,
  excluirItem,
  toggleItem,
  adicionarCategoria,
  toggleCategoria,
  moverCategoria,
  excluirCategoria,
} from "../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Item = { id: string; nome: string; categoria: string | null; preco: number; ativo: boolean };
type Categoria = { id: string; nome: string; ordem: number; disponivel: boolean };

export function CardapioClient({
  config,
  itens,
  categorias,
  comAdicionais,
}: {
  config: Record<string, string>;
  itens: Item[];
  categorias: Categoria[];
  comAdicionais: string[];
}) {
  const [editando, setEditando] = useState<Item | null>(null);
  const setAdic = new Set(comAdicionais);

  const grupos = new Map<string, Item[]>();
  for (const i of itens) {
    const k = i.categoria || "Sem categoria";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  // categorias sem linha própria (ex.: itens sem categoria)
  const extras = [...grupos.keys()].filter(
    (k) => !categorias.some((c) => c.nome === k),
  );

  return (
    <div className="space-y-6">
      <ConfigForm config={config} />

      {/* Adicionar categoria */}
      <form action={adicionarCategoria} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Nova categoria</label>
          <input name="nome" required placeholder="Ex.: Bebidas" className={inputCls} />
        </div>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + Adicionar categoria
        </button>
      </form>

      {/* Editor de item (aparece ao clicar em Editar) */}
      {editando && (
        <form
          key={editando.id}
          action={async (fd) => {
            await salvarItem(fd);
            setEditando(null);
          }}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-950/20"
        >
          <input type="hidden" name="id" value={editando.id} />
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Item</label>
            <input name="nome" required defaultValue={editando.nome} className={`${inputCls} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
            <input
              name="categoria"
              list="cats"
              defaultValue={editando.categoria ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Preço</label>
            <input
              name="preco"
              inputMode="decimal"
              defaultValue={String(editando.preco).replace(".", ",")}
              className={`${inputCls} w-28`}
            />
          </div>
          <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setEditando(null)}
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
        </form>
      )}

      <datalist id="cats">
        {categorias.map((c) => (
          <option key={c.id} value={c.nome} />
        ))}
      </datalist>

      {/* Categorias em ordem */}
      <div className="space-y-4">
        {categorias.map((cat, idx) => (
          <CategoriaCard
            key={cat.id}
            cat={cat}
            itens={grupos.get(cat.nome) ?? []}
            primeira={idx === 0}
            ultima={idx === categorias.length - 1}
            onEditar={setEditando}
            comAdicionais={setAdic}
          />
        ))}

        {extras.map((nome) => (
          <div
            key={nome}
            className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
          >
            <p className="mb-2 text-xs font-semibold uppercase text-zinc-400">
              {nome} (sem categoria cadastrada)
            </p>
            <ItensTabela itens={grupos.get(nome) ?? []} onEditar={setEditando} comAdicionais={setAdic} />
          </div>
        ))}

        {categorias.length === 0 && extras.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
            Nenhuma categoria ainda. Crie uma acima.
          </div>
        )}
      </div>
    </div>
  );
}

function CategoriaCard({
  cat,
  itens,
  primeira,
  ultima,
  onEditar,
  comAdicionais,
}: {
  cat: Categoria;
  itens: Item[];
  primeira: boolean;
  ultima: boolean;
  onEditar: (i: Item) => void;
  comAdicionais: Set<string>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* ordenar */}
        <div className="flex flex-col">
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="cima" />
            <button
              disabled={primeira}
              className="text-zinc-400 hover:text-orange-600 disabled:opacity-30"
              aria-label="Subir"
            >
              ▲
            </button>
          </form>
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="baixo" />
            <button
              disabled={ultima}
              className="text-zinc-400 hover:text-orange-600 disabled:opacity-30"
              aria-label="Descer"
            >
              ▼
            </button>
          </form>
        </div>

        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{cat.nome}</h2>
        <span className="text-xs text-zinc-400">({itens.length})</span>

        <div className="ml-auto flex items-center gap-2">
          {/* disponível / indisponível */}
          <form action={toggleCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="disponivel" value={cat.disponivel ? "0" : "1"} />
            <button
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                cat.disponivel
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
              }`}
            >
              {cat.disponivel ? "✓ Disponível" : "✕ Indisponível"}
            </button>
          </form>
          {/* excluir categoria */}
          <form
            action={excluirCategoria}
            onSubmit={(e) => {
              if (!confirm(`Excluir a categoria "${cat.nome}"? Os produtos não são apagados.`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={cat.id} />
            <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600" aria-label="Excluir categoria">
              🗑
            </button>
          </form>
        </div>
      </div>

      <ItensTabela itens={itens} onEditar={onEditar} comAdicionais={comAdicionais} />

      {/* adicionar produto nesta categoria */}
      <form action={salvarItem} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoria" value={cat.nome} />
        <div className="min-w-40 flex-1">
          <input name="nome" required placeholder="Novo produto..." className={`${inputCls} w-full`} />
        </div>
        <input name="preco" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-24`} />
        <button className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
          + Produto
        </button>
      </form>
    </div>
  );
}

function ItensTabela({
  itens,
  onEditar,
  comAdicionais,
}: {
  itens: Item[];
  onEditar: (i: Item) => void;
  comAdicionais: Set<string>;
}) {
  if (itens.length === 0)
    return <p className="text-sm text-zinc-400">Nenhum produto nesta categoria.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((i) => (
            <tr
              key={i.id}
              className={`bg-white dark:bg-zinc-950 ${i.ativo ? "" : "opacity-50"}`}
            >
              <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                {i.nome}
                {!i.ativo && <span className="ml-2 text-[10px] uppercase text-red-500">oculto</span>}
              </td>
              <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                {moeda(Number(i.preco))}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <form action={toggleItem} className="inline">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="ativo" value={i.ativo ? "0" : "1"} />
                  <button className="mr-3 text-zinc-400 hover:text-orange-600" title={i.ativo ? "Ocultar" : "Mostrar"}>
                    {i.ativo ? "Ocultar" : "Mostrar"}
                  </button>
                </form>
                {comAdicionais.has(i.id) && (
                  <Link
                    href={`/salao/cardapio/adicionais/${i.id}`}
                    className="mr-3 text-emerald-600 hover:underline"
                  >
                    Adicionais
                  </Link>
                )}
                <button
                  onClick={() => onEditar(i)}
                  className="mr-3 text-orange-600 hover:underline"
                >
                  Editar
                </button>
                <form
                  action={excluirItem}
                  className="inline"
                  onSubmit={(e) => {
                    if (!confirm(`Remover "${i.nome}"?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={i.id} />
                  <button className="text-zinc-400 hover:text-red-600">Remover</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigForm({ config }: { config: Record<string, string> }) {
  const precoKg = Number(config.preco_kg || 0);
  return (
    <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        ⚙️ Configurações do buffet / serviço / cupom
      </summary>
      <form action={salvarConfigPdv} className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Nome do restaurante (no cupom)</label>
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
                Number(config.tara_padrao || 0) ? String(config.tara_padrao).replace(".", ",") : ""
              }
              placeholder="0,000"
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Preço por kg</label>
            <input
              name="preco_kg"
              inputMode="decimal"
              defaultValue={precoKg ? String(precoKg).replace(".", ",") : ""}
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Buffet livre (teto R$)</label>
            <input
              name="buffet_livre"
              inputMode="decimal"
              defaultValue={
                Number(config.buffet_livre || 0) ? String(config.buffet_livre).replace(".", ",") : ""
              }
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
            <p className="mt-1 text-[11px] text-zinc-400">acima disso, cobra fixo (0 = desligado)</p>
          </div>
        </div>

        {/* Preços por dia da semana (vazio = usa o geral acima) */}
        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Preços por dia da semana (deixe vazio para usar o preço geral acima)
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-zinc-400">
                  <th className="px-2 py-1 text-left">Dia</th>
                  <th className="px-2 py-1">Livre (teto R$)</th>
                  <th className="px-2 py-1">Por kg (R$)</th>
                </tr>
              </thead>
              <tbody>
                {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
                  (nome, d) => (
                    <tr key={d}>
                      <td className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300">{nome}</td>
                      <td className="px-2 py-0.5">
                        <input
                          name={`buffet_livre_${d}`}
                          inputMode="decimal"
                          defaultValue={
                            config[`buffet_livre_${d}`]
                              ? String(config[`buffet_livre_${d}`]).replace(".", ",")
                              : ""
                          }
                          placeholder="—"
                          className={`${inputCls} w-24`}
                        />
                      </td>
                      <td className="px-2 py-0.5">
                        <input
                          name={`preco_kg_${d}`}
                          inputMode="decimal"
                          defaultValue={
                            config[`preco_kg_${d}`]
                              ? String(config[`preco_kg_${d}`]).replace(".", ",")
                              : ""
                          }
                          placeholder="—"
                          className={`${inputCls} w-24`}
                        />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
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
          <p className="text-xs font-medium text-zinc-500">Dados no cupom (opcionais)</p>
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
    </details>
  );
}
