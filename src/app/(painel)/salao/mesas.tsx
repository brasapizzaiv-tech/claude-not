"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { criarComandaMesa } from "./actions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type ComandaMini = { id: string; numero: number; total: number };
export type Mesa = { nome: string; tipo: "balcao" | "mesa" | "balanca"; comandas: ComandaMini[] };

export function MesasGrid({ mesas }: { mesas: Mesa[] }) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"todas" | "livres" | "ocupadas">("todas");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mesas.filter((m) => {
      if (q && !m.nome.toLowerCase().includes(q)) return false;
      const ocupada = m.comandas.length > 0;
      if (situacao === "livres" && ocupada) return false;
      if (situacao === "ocupadas" && !ocupada) return false;
      return true;
    });
  }, [mesas, busca, situacao]);

  return (
    <div>
      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as typeof situacao)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="todas">Situação: todas</option>
          <option value="livres">Só livres</option>
          <option value="ocupadas">Só ocupadas</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por mesa..."
          className="min-w-56 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <Link
          href="/salao/caixa"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          💵 Caixa
        </Link>
        <Link
          href="/salao/cardapio"
          className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
        >
          Cardápio / Config
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filtradas.map((m) => (
          <MesaCard key={m.nome} mesa={m} />
        ))}
      </div>
      {filtradas.length === 0 && (
        <p className="mt-8 text-center text-sm text-zinc-400">Nenhuma mesa encontrada.</p>
      )}
    </div>
  );
}

function MesaCard({ mesa }: { mesa: Mesa }) {
  const ocupada = mesa.comandas.length > 0;
  const total = mesa.comandas.reduce((s, c) => s + c.total, 0);

  return (
    <div
      className={`flex flex-col rounded-xl border p-3 ${
        ocupada
          ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
          : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/5"
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="font-bold text-zinc-900 dark:text-zinc-100">{mesa.nome}</span>
        <span
          className={`text-[11px] font-medium uppercase ${
            ocupada ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {ocupada ? brl(total) : "Livre"}
        </span>
      </div>

      <div className="mb-2 min-h-[2.5rem] space-y-1">
        {mesa.comandas.length === 0 ? (
          <p className="text-xs text-zinc-400">Sem comandas</p>
        ) : (
          mesa.comandas.map((c) => (
            <Link
              key={c.id}
              href={`/salao/comandas/${c.id}`}
              className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1 text-xs hover:bg-white dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">#{c.numero}</span>
              <span className="text-zinc-500">{brl(c.total)}</span>
            </Link>
          ))
        )}
      </div>

      {mesa.tipo === "balanca" ? (
        <Link
          href="/salao/balanca"
          className="mt-auto rounded-lg bg-orange-500 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-orange-600"
        >
          ⚖️ Pesar
        </Link>
      ) : (
        <form action={criarComandaMesa} className="mt-auto">
          <input type="hidden" name="mesa" value={mesa.nome} />
          <button className="w-full rounded-lg bg-orange-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
            + Comanda
          </button>
        </form>
      )}
    </div>
  );
}
