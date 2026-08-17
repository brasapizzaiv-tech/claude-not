"use client";

import { useMemo, useState } from "react";
import { toggleOpcaoComplemento, editarPrecoOpcao } from "../../../actions";

type Opcao = { id: string; nome: string; preco: number; ativo: boolean };
type Grupo = { id: string; nome: string; min: number; max: number; opcoes: Opcao[] };

export function AdicionaisClient({ itemId, grupos }: { itemId: string; grupos: Grupo[] }) {
  const [busca, setBusca] = useState("");
  const [soOcultos, setSoOcultos] = useState(false);

  const q = busca.trim().toLowerCase();
  const gruposFiltrados = useMemo(
    () =>
      grupos
        .map((g) => ({
          ...g,
          opcoes: g.opcoes.filter(
            (o) => (!q || o.nome.toLowerCase().includes(q)) && (!soOcultos || !o.ativo),
          ),
        }))
        .filter((g) => g.opcoes.length > 0),
    [grupos, q, soOcultos],
  );

  const totalAtivas = grupos.reduce((s, g) => s + g.opcoes.filter((o) => o.ativo).length, 0);
  const total = grupos.reduce((s, g) => s + g.opcoes.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar adicional..."
          className="min-w-56 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={soOcultos}
            onChange={(e) => setSoOcultos(e.target.checked)}
            className="h-4 w-4"
          />
          só ocultos
        </label>
        <span className="text-xs text-zinc-400">
          {totalAtivas} ativas de {total}
        </span>
      </div>

      {gruposFiltrados.map((g) => (
        <div key={g.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{g.nome}</h2>
            <span className="text-xs text-zinc-400">
              {g.min > 0 ? `escolha ${g.min}` : "opcional"}
              {g.max > 1 ? ` até ${g.max}` : ""}
            </span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {g.opcoes.map((o) => (
              <div
                key={o.id}
                className={`flex items-center gap-2 py-1.5 ${o.ativo ? "" : "opacity-60"}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                  {o.nome}
                  {!o.ativo && <span className="ml-2 text-[10px] uppercase text-red-500">oculto</span>}
                </span>
                <form action={editarPrecoOpcao} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="item_id" value={itemId} />
                  <span className="text-xs text-zinc-400">R$</span>
                  <input
                    name="preco"
                    inputMode="decimal"
                    defaultValue={o.preco ? String(o.preco).replace(".", ",") : "0"}
                    className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-right text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-orange-600">ok</button>
                </form>
                <form action={toggleOpcaoComplemento}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="item_id" value={itemId} />
                  <input type="hidden" name="ativo" value={o.ativo ? "0" : "1"} />
                  <button
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      o.ativo
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {o.ativo ? "Ativo" : "Ativar"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ))}
      {gruposFiltrados.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">Nada encontrado.</p>
      )}
    </div>
  );
}
