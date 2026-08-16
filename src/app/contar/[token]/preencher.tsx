"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { EstoqueInput, calcular } from "@/components/estoque-input";
import { salvarContagemPublica } from "./actions";

type ItemInicial = {
  produto_id: string;
  qtd_estoque: number;
  qtd_pedir: number;
};

export function PreencherClient({
  token,
  descricao,
  colaborador,
  finalizada,
  produtos,
  itens,
}: {
  token: string;
  descricao: string;
  colaborador: string;
  finalizada: boolean;
  produtos: Produto[];
  itens: ItemInicial[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [salvando, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const iniciais = useMemo(() => {
    const m = new Map<string, ItemInicial>();
    itens.forEach((i) => m.set(i.produto_id, i));
    return m;
  }, [itens]);

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

  function ler(nome: string) {
    const el = formRef.current?.elements.namedItem(nome) as
      | HTMLInputElement
      | undefined;
    return calcular(el?.value ?? "");
  }

  function salvar() {
    startSave(async () => {
      const payload = produtos.map((p) => ({
        produto_id: p.id,
        qtd_estoque: ler(`estoque_${p.id}`),
        qtd_pedir: 0,
      }));
      const r = await salvarContagemPublica(token, payload);
      if (r.ok) {
        setMsg(`Contagem enviada! (${r.gravados} itens) Obrigado, ${colaborador}.`);
      } else {
        setMsg(r.erro ?? "Não foi possível salvar.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-28 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {descricao}
        </h1>
        <p className="text-sm text-zinc-500">Contagem de {colaborador}</p>
      </header>

      <div className="mx-auto max-w-xl px-4">
        {msg && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {msg}
          </div>
        )}

        {finalizada ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Esta contagem já foi finalizada. Não é mais possível editar.
          </div>
        ) : produtos.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 p-6 text-center text-zinc-500 dark:border-zinc-800">
            Nenhum produto atribuído a você nesta contagem.
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-zinc-500">
              Preencha <b>quanto tem em estoque</b> de cada item.
            </p>
            <form ref={formRef} className="mt-4 space-y-6">
              {grupos.map(([cat, itensCat]) => (
                <Fragment key={cat}>
                  <div>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {cat} ({itensCat.length})
                    </h2>
                    <div className="space-y-2">
                      {itensCat.map((p) => {
                        const ini = iniciais.get(p.id);
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                          >
                            <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {p.nome}
                              <span className="ml-1 text-xs font-normal text-zinc-400">
                                ({p.unidade})
                              </span>
                            </div>
                            <label className="block text-sm text-zinc-500">
                              Em estoque
                              <span className="ml-1 text-xs text-zinc-400">
                                (em mais de um lugar? toque em “+ caixa”)
                              </span>
                              <div className="mt-1">
                                <EstoqueInput
                                  name={`estoque_${p.id}`}
                                  defaultValue={
                                    ini?.qtd_estoque ? String(ini.qtd_estoque) : ""
                                  }
                                />
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Fragment>
              ))}
            </form>
          </>
        )}
      </div>

      {!finalizada && produtos.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {salvando ? "Enviando..." : "Enviar contagem"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
