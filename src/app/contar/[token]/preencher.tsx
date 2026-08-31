"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
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
  const [salvando, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // TODOS os valores vivem AQUI (não nos campos da tela). Assim, filtrar a
  // busca ou rolar a página nunca apaga o que já foi digitado.
  const [valores, setValores] = useState<Record<string, string[]>>(() => {
    const v: Record<string, string[]> = {};
    for (const i of itens) if (i.qtd_estoque) v[i.produto_id] = [String(i.qtd_estoque)];
    return v;
  });

  const chaveRascunho = `contagem_rascunho_${token}`;

  // Restaura o rascunho salvo no aparelho (proteção contra recarregar a página).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem(chaveRascunho);
        if (!raw) return;
        const draft = JSON.parse(raw) as Record<string, string[]>;
        if (draft && typeof draft === "object") {
          setValores((atual) => ({ ...atual, ...draft }));
          setMsg("📝 Recuperei o que você já tinha digitado neste aparelho.");
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(id);
  }, [chaveRascunho]);

  function setCaixas(produtoId: string, caixas: string[]) {
    setValores((v) => {
      const novo = { ...v, [produtoId]: caixas };
      try { localStorage.setItem(chaveRascunho, JSON.stringify(novo)); } catch { /* sem storage */ }
      return novo;
    });
  }

  const totalDe = (produtoId: string) =>
    Math.round((valores[produtoId] ?? []).reduce((s, b) => s + calcular(b), 0) * 1000) / 1000;

  const preenchidos = produtos.filter((p) => totalDe(p.id) > 0).length;

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

  // Busca ignorando acentos ("jager" acha "Jägermeister").
  const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const gruposFiltrados = useMemo(() => {
    const b = semAcento(busca.trim());
    if (!b) return grupos;
    return grupos
      .map(([cat, itens]) => [
        cat,
        itens.filter((p) => semAcento(p.nome).includes(b)),
      ] as [string, Produto[]])
      .filter(([, itens]) => itens.length > 0);
  }, [grupos, busca]);

  function salvar() {
    // Confirma se ficou muita coisa sem preencher (proteção extra).
    if (preenchidos < produtos.length) {
      const faltam = produtos.length - preenchidos;
      const ok = confirm(
        `Você preencheu ${preenchidos} de ${produtos.length} itens (${faltam} em branco).\n\nItens em branco NÃO entram na contagem. Enviar mesmo assim?`,
      );
      if (!ok) return;
    }
    startSave(async () => {
      const payload = produtos.map((p) => ({
        produto_id: p.id,
        qtd_estoque: totalDe(p.id),
        qtd_pedir: 0,
      }));
      const r = await salvarContagemPublica(token, payload);
      if (r.ok) {
        try { localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ }
        setMsg(`✅ Contagem enviada! ${r.gravados} de ${produtos.length} itens gravados. Obrigado, ${colaborador}.`);
      } else {
        setMsg(r.erro ?? "Não foi possível salvar. Tente de novo — o que você digitou está guardado neste aparelho.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32 dark:bg-zinc-950">
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
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔎 Buscar item..."
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {gruposFiltrados.length === 0 && (
              <p className="mt-4 text-center text-sm text-zinc-400">
                Nenhum item com “{busca}”.
              </p>
            )}
            <div className="mt-4 space-y-6">
              {gruposFiltrados.map(([cat, itensCat]) => (
                <Fragment key={cat}>
                  <div>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {cat} ({itensCat.length})
                    </h2>
                    <div className="space-y-2">
                      {itensCat.map((p) => {
                        const feito = totalDe(p.id) > 0;
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${feito ? "border-emerald-300 dark:border-emerald-800" : "border-zinc-200 dark:border-zinc-800"}`}
                          >
                            <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {feito && <span className="mr-1 text-emerald-600">✓</span>}
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
                                  caixas={valores[p.id] ?? [""]}
                                  onCaixasChange={(cs) => setCaixas(p.id, cs)}
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
            </div>
          </>
        )}
      </div>

      {!finalizada && produtos.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <div className="mb-1.5 text-center text-xs text-zinc-500">
              {preenchidos} de {produtos.length} itens preenchidos
              {busca && " · a busca só filtra a tela, nada se perde"}
            </div>
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {salvando ? "Enviando..." : `Enviar contagem (${preenchidos})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
