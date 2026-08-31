"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import type { Produto } from "@/lib/types";
import { EstoqueInput, calcular } from "@/components/estoque-input";
import { salvarContagemPublica, buscarProdutosContagem } from "./actions";

type ExtraProduto = { id: string; nome: string; unidade: string; categoria: string };

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
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // Itens que o contador ADICIONOU (não estavam na lista dele, mas existem no estoque).
  const [extras, setExtras] = useState<ExtraProduto[]>([]);
  const [addAberto, setAddAberto] = useState(false);
  const [addBusca, setAddBusca] = useState("");
  const [addResultados, setAddResultados] = useState<ExtraProduto[]>([]);
  const [addBuscando, setAddBuscando] = useState(false);

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
        const draft = JSON.parse(raw) as { v?: Record<string, string[]>; x?: ExtraProduto[] } | Record<string, string[]>;
        if (draft && typeof draft === "object") {
          const novo = draft as { v?: Record<string, string[]>; x?: ExtraProduto[] };
          if (novo.v && typeof novo.v === "object" && !Array.isArray(novo.v)) {
            const v = novo.v;
            setValores((atual) => ({ ...atual, ...v }));
            if (Array.isArray(novo.x)) setExtras(novo.x);
          } else {
            const antigo = draft as Record<string, string[]>;
            setValores((atual) => ({ ...atual, ...antigo }));
          }
          setMsg("📝 Recuperei o que você já tinha digitado neste aparelho.");
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(id);
  }, [chaveRascunho]);

  function gravarRascunho(v: Record<string, string[]>, x: ExtraProduto[]) {
    try { localStorage.setItem(chaveRascunho, JSON.stringify({ v, x })); } catch { /* sem storage */ }
  }
  function setCaixas(produtoId: string, caixas: string[]) {
    setValores((v) => {
      const novo = { ...v, [produtoId]: caixas };
      gravarRascunho(novo, extras);
      return novo;
    });
  }

  const totalDe = (produtoId: string) =>
    Math.round((valores[produtoId] ?? []).reduce((s, b) => s + calcular(b), 0) * 1000) / 1000;

  // Preenchido = o contador respondeu algo (0 também vale!).
  const foiPreenchido = (produtoId: string) =>
    (valores[produtoId] ?? []).some((b) => b.trim() !== "");

  const todosItens = useMemo(
    () => [
      ...produtos.map((p) => ({ id: p.id, nome: p.nome })),
      ...extras.map((x) => ({ id: x.id, nome: x.nome })),
    ],
    [produtos, extras],
  );
  const preenchidos = todosItens.filter((p) => foiPreenchido(p.id)).length;

  // ---- adicionar item fora da lista ----
  async function buscarAdd() {
    if (addBusca.trim().length < 2) return;
    setAddBuscando(true);
    const r = await buscarProdutosContagem(token, addBusca);
    setAddBuscando(false);
    const jaTem = new Set([...produtos.map((p) => p.id), ...extras.map((x) => x.id)]);
    setAddResultados(r.filter((p) => !jaTem.has(p.id)));
  }
  function adicionarExtra(p: ExtraProduto) {
    setExtras((x) => {
      const novo = [...x, p];
      gravarRascunho(valores, novo);
      return novo;
    });
    setAddResultados((r) => r.filter((i) => i.id !== p.id));
    setAddBusca(""); setAddResultados([]); setAddAberto(false);
  }
  function removerExtra(id: string) {
    setExtras((x) => {
      const novo = x.filter((i) => i.id !== id);
      gravarRascunho(valores, novo);
      return novo;
    });
  }

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
    // TODO item precisa de resposta — não tem nenhum? Digite 0.
    const faltando = todosItens.filter((p) => !foiPreenchido(p.id));
    if (faltando.length > 0) {
      setMsg(null);
      const nomes = faltando.slice(0, 6).map((f) => f.nome).join(", ");
      const resto = faltando.length > 6 ? ` e mais ${faltando.length - 6}` : "";
      setErroEnvio(
        `Faltam ${faltando.length} itens: ${nomes}${resto}. Preencha todos — se não tiver nenhum, digite 0.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErroEnvio(null);
    startSave(async () => {
      const payload = todosItens
        .filter((p) => foiPreenchido(p.id))
        .map((p) => ({
          produto_id: p.id,
          qtd_estoque: totalDe(p.id),
          qtd_pedir: 0,
          preenchido: "true",
        }));
      const r = await salvarContagemPublica(token, payload);
      if (r.ok) {
        try { localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ }
        setMsg(`✅ Contagem enviada! ${r.gravados} de ${todosItens.length} itens gravados. Obrigado, ${colaborador}.`);
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
        {erroEnvio && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            ⚠️ {erroEnvio}
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
                        const feito = foiPreenchido(p.id);
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

              {/* Itens que o contador adicionou por conta */}
              {extras.length > 0 && (
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-500">
                    ➕ Adicionados por você ({extras.length})
                  </h2>
                  <div className="space-y-2">
                    {extras.map((p) => {
                      const feito = foiPreenchido(p.id);
                      return (
                        <div key={p.id} className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${feito ? "border-emerald-300 dark:border-emerald-800" : "border-orange-200 dark:border-orange-900"}`}>
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {feito && <span className="mr-1 text-emerald-600">✓</span>}
                              {p.nome}
                              <span className="ml-1 text-xs font-normal text-zinc-400">({p.unidade})</span>
                            </div>
                            <button onClick={() => removerExtra(p.id)} className="text-xs text-zinc-400 hover:text-red-600">remover</button>
                          </div>
                          <label className="block text-sm text-zinc-500">
                            Em estoque
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
              )}

              {/* Adicionar item fora da lista */}
              <div className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
                {!addAberto ? (
                  <button onClick={() => setAddAberto(true)} className="w-full text-sm font-semibold text-orange-600">
                    ➕ Tem um item no estoque que não está na lista? Adicionar
                  </button>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        value={addBusca}
                        onChange={(e) => setAddBusca(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") buscarAdd(); }}
                        placeholder="Nome do item (ex.: vinagre)"
                        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button onClick={buscarAdd} disabled={addBuscando || addBusca.trim().length < 2} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {addBuscando ? "..." : "Buscar"}
                      </button>
                      <button onClick={() => { setAddAberto(false); setAddBusca(""); setAddResultados([]); }} className="text-zinc-400">✕</button>
                    </div>
                    {addResultados.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {addResultados.map((p) => (
                          <button key={p.id} onClick={() => adicionarExtra(p)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-orange-50 dark:border-zinc-700 dark:hover:bg-orange-950">
                            <span>{p.nome} <span className="text-xs text-zinc-400">({p.unidade})</span></span>
                            <span className="text-xs text-zinc-400">{p.categoria}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {!finalizada && produtos.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <div className="mb-1.5 text-center text-xs text-zinc-500">
              {preenchidos} de {todosItens.length} itens preenchidos · não tem nenhum? digite <b>0</b>
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
