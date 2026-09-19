"use client";

import { useMemo, useState } from "react";
import { Enviar } from "@/components/enviar";
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
          className="min-w-56 flex-1 min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
        />
        <label className="flex items-center gap-2 text-sm text-texto-suave">
          <input
            type="checkbox"
            checked={soOcultos}
            onChange={(e) => setSoOcultos(e.target.checked)}
            className="h-4 w-4"
          />
          só ocultos
        </label>
        <span className="text-xs text-texto-fraco">
          {totalAtivas} ativas de {total}
        </span>
      </div>

      {gruposFiltrados.map((g) => (
        <div key={g.id} className="rounded-cartao border border-borda p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-texto">{g.nome}</h2>
            <span className="text-xs text-texto-fraco">
              {g.min > 0 ? `escolha ${g.min}` : "opcional"}
              {g.max > 1 ? ` até ${g.max}` : ""}
            </span>
          </div>
          <div className="divide-y divide-borda">
            {g.opcoes.map((o) => (
              <div
                key={o.id}
                className={`flex items-center gap-2 py-1.5 ${o.ativo ? "" : "opacity-60"}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-texto">
                  {o.nome}
                  {!o.ativo && <span className="ml-2 text-mini text-red-500">oculto</span>}
                </span>
                <form action={editarPrecoOpcao} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="item_id" value={itemId} />
                  <span className="text-xs text-texto-fraco">R$</span>
                  <input
                    name="preco"
                    inputMode="decimal"
                    defaultValue={o.preco ? String(o.preco).replace(".", ",") : "0"}
                    className="w-16 rounded border border-borda-forte bg-painel-cartao px-2 py-1 text-right text-xs dark:text-zinc-100"
                  />
                  <Enviar className="rounded px-2 py-1 text-xs text-texto-fraco hover:text-orange-600">ok</Enviar>
                </form>
                <form action={toggleOpcaoComplemento}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="item_id" value={itemId} />
                  <input type="hidden" name="ativo" value={o.ativo ? "0" : "1"} />
                  <Enviar
                    className={`rounded-controle px-2.5 py-1 text-xs font-semibold ${
                      o.ativo
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-superficie-suave text-texto-suave  dark:text-texto-fraco"
                    }`}
                  >
                    {o.ativo ? "Ativo" : "Ativar"}
                  </Enviar>
                </form>
              </div>
            ))}
          </div>
        </div>
      ))}
      {gruposFiltrados.length === 0 && (
        <p className="py-8 text-center text-sm text-texto-fraco">Nada encontrado.</p>
      )}
    </div>
  );
}
