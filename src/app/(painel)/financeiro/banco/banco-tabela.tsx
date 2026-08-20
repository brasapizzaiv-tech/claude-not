"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { Combobox } from "@/components/combobox";
import {
  conciliar,
  conciliarVarias,
  desconciliar,
  gerarLancamentoDaTransacao,
  lancarNotaEConciliar,
  excluirTransacao,
} from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type TransRow = {
  id: string;
  data: string;
  valor: number;
  descricao: string | null;
  banco: string | null;
  lancamento_id: string | null;
  lancamentoLabel: string | null;
  sugestaoId: string | null;
  sugestaoLabel: string | null;
  notaSugeridaId: string | null;
  notaSugeridaLabel: string | null;
};
type Cat = { id: string; nome: string; tipo: string; grupo: string };
type LancOpt = { id: string; label: string; tipo: string };

export function BancoTabela({
  transacoes,
  categorias,
  lancamentos,
}: {
  transacoes: TransRow[];
  categorias: Cat[];
  lancamentos: LancOpt[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [filtro, setFiltro] = useState("Todos");
  const [painel, setPainel] = useState<string | null>(null);
  const [catSel, setCatSel] = useState("");
  const [obs, setObs] = useState("");
  const [lancSel, setLancSel] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const bancos = [...new Set(transacoes.map((t) => t.banco || "Sem banco"))].sort();
  const lista =
    filtro === "Todos"
      ? transacoes
      : transacoes.filter((t) => (t.banco || "Sem banco") === filtro);
  const aConciliar = lista.filter((t) => !t.lancamento_id).length;
  const conciliadas = lista.length - aConciliar;

  // Seleção múltipla: só transações não conciliadas que têm sugestão.
  const selecionaveis = lista.filter((t) => !t.lancamento_id && t.sugestaoId);
  const todosSel =
    selecionaveis.length > 0 && selecionaveis.every((t) => sel.has(t.id));
  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSel((s) => {
      const n = new Set(s);
      if (todosSel) selecionaveis.forEach((t) => n.delete(t.id));
      else selecionaveis.forEach((t) => n.add(t.id));
      return n;
    });
  }
  function conciliarSelecionadas() {
    const pares = selecionaveis
      .filter((t) => sel.has(t.id))
      .map((t) => ({ transacaoId: t.id, lancamentoId: t.sugestaoId! }));
    if (pares.length === 0) return;
    start(async () => {
      await conciliarVarias(pares);
      setSel(new Set());
      router.refresh();
    });
  }

  function abrir(id: string) {
    setPainel(painel === id ? null : id);
    setCatSel("");
    setObs("");
    setLancSel("");
  }
  function run(fn: () => Promise<unknown>) {
    start(async () => {
      await fn();
      setPainel(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Filtro por banco */}
      {bancos.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["Todos", ...bancos].map((b) => (
            <button
              key={b}
              onClick={() => setFiltro(b)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filtro === b
                  ? "bg-orange-500 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {sel.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 dark:border-green-900 dark:bg-green-950/30">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {sel.size} selecionada(s)
          </span>
          <button
            onClick={conciliarSelecionadas}
            disabled={proc}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {proc ? "Conciliando..." : "Conciliar selecionadas"}
          </button>
          <button
            onClick={() => setSel(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            limpar
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Conciliadas</p>
          <p className="mt-1 text-xl font-bold text-green-600">{conciliadas}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">A conciliar</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{aConciliar}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-8 px-3 py-3">
                {selecionaveis.length > 0 && (
                  <input
                    type="checkbox"
                    checked={todosSel}
                    onChange={toggleTodos}
                    title="Selecionar todas com sugestão"
                  />
                )}
              </th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição (banco)</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Lançamento</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lista.map((t) => {
              const conciliado = !!t.lancamento_id;
              const entrada = Number(t.valor) > 0;
              const aberto = painel === t.id;
              const cats = categorias.filter((c) =>
                entrada ? c.tipo === "receita" : c.tipo !== "receita",
              );
              const lancs = lancamentos.filter((l) =>
                entrada ? l.tipo === "receita" : l.tipo !== "receita",
              );
              return (
                <Fragment key={t.id}>
                  <tr className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2">
                      {!conciliado && t.sugestaoId && (
                        <input
                          type="checkbox"
                          checked={sel.has(t.id)}
                          onChange={() => toggleSel(t.id)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{dataBR(t.data)}</td>
                    <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      {t.banco && (
                        <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800">
                          {t.banco}
                        </span>
                      )}
                      {t.descricao}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        entrada ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {moeda(Number(t.valor))}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {conciliado ? (
                        <span className="text-green-600">
                          ✓ {t.lancamentoLabel ?? "conciliado"}
                        </span>
                      ) : t.sugestaoLabel ? (
                        <span className="text-zinc-500">sugestão: {t.sugestaoLabel}</span>
                      ) : t.notaSugeridaLabel ? (
                        <span className="text-orange-600 dark:text-orange-400">
                          nota pendente: {t.notaSugeridaLabel}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {conciliado ? (
                        <button
                          disabled={proc}
                          onClick={() => run(() => desconciliar(t.id))}
                          className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-60"
                        >
                          Desfazer
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          {t.sugestaoId && (
                            <button
                              disabled={proc}
                              onClick={() => run(() => conciliar(t.id, t.sugestaoId!))}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              Conciliar
                            </button>
                          )}
                          {!t.sugestaoId && t.notaSugeridaId && (
                            <button
                              disabled={proc}
                              onClick={() =>
                                run(() => lancarNotaEConciliar(t.id, t.notaSugeridaId!))
                              }
                              title={t.notaSugeridaLabel ?? ""}
                              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                            >
                              Lançar nota e conciliar
                            </button>
                          )}
                          <button
                            onClick={() => abrir(t.id)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                              aberto
                                ? "border-orange-500 text-orange-600"
                                : "border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            }`}
                          >
                            Lançar ▾
                          </button>
                        </div>
                      )}
                      <button
                        disabled={proc}
                        onClick={() => run(() => {
                          const fd = new FormData();
                          fd.set("id", t.id);
                          return excluirTransacao(fd);
                        })}
                        className="ml-2 text-xs text-zinc-300 hover:text-red-600 disabled:opacity-60 dark:text-zinc-600"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {aberto && !conciliado && (
                    <tr className="bg-orange-50/40 dark:bg-orange-950/10">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {/* Gerar novo */}
                          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                            <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                              Criar lançamento novo ({entrada ? "receita" : "despesa"})
                            </p>
                            <Combobox
                              options={cats.map((c) => ({
                                value: c.id,
                                label: `${c.grupo} — ${c.nome}`,
                              }))}
                              value={catSel}
                              onChange={setCatSel}
                              placeholder="Buscar categoria..."
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <input
                              value={obs}
                              onChange={(e) => setObs(e.target.value)}
                              placeholder={`Observação (opcional) — padrão: ${t.descricao ?? "descrição do banco"}`}
                              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <button
                              disabled={proc || !catSel}
                              onClick={() =>
                                run(() =>
                                  gerarLancamentoDaTransacao(t.id, catSel, obs),
                                )
                              }
                              className="mt-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                            >
                              Gerar {moeda(Math.abs(Number(t.valor)))} e conciliar
                            </button>
                          </div>
                          {/* Procurar existente */}
                          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                            <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                              Vincular a um lançamento existente
                            </p>
                            <Combobox
                              options={lancs.map((l) => ({ value: l.id, label: l.label }))}
                              value={lancSel}
                              onChange={setLancSel}
                              placeholder="Buscar lançamento..."
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <button
                              disabled={proc || !lancSel}
                              onClick={() => run(() => conciliar(t.id, lancSel))}
                              className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
                            >
                              Vincular
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
