"use client";

import { useState, useTransition } from "react";
import { conferirPedidoColab } from "./actions";
import { dataBR } from "@/lib/format";

export type ItemPed = {
  id: string;
  nome: string;
  unidade: string;
  qtd: number;
  qtd_conf: number | null;
};
export type PedidoColab = {
  id: string;
  fornecedor: string | null;
  data: string;
  prazo_entrega: string | null;
  status: string;
  conf_em: string | null;
  conf_por: string | null;
  itens: ItemPed[];
};

export function PedidosColab({ token, pedidos }: { token: string; pedidos: PedidoColab[] }) {
  if (pedidos.length === 0) return null;
  const naoConferidos = pedidos.filter((p) => !p.conf_em).length;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-center gap-2">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          📦 Pedidos para conferir
        </span>
        {naoConferidos > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            {naoConferidos}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {pedidos.map((p) => (
          <PedidoCard key={p.id} token={token} pedido={p} />
        ))}
      </div>
    </div>
  );
}

function PedidoCard({ token, pedido }: { token: string; pedido: PedidoColab }) {
  const [aberto, setAberto] = useState(false);
  const [qtds, setQtds] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pedido.itens.map((i) => [i.id, String(i.qtd_conf ?? i.qtd)]),
    ),
  );
  const [salvando, start] = useTransition();
  const [feito, setFeito] = useState(!!pedido.conf_em);

  function confirmar() {
    start(async () => {
      const r = await conferirPedidoColab(
        token,
        pedido.id,
        pedido.itens.map((i) => ({ id: i.id, qtd: qtds[i.id] ?? "" })),
      );
      if (r.ok) setFeito(true);
    });
  }

  return (
    <div
      className={`rounded-2xl border p-3 ${
        feito
          ? "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {pedido.fornecedor || "Fornecedor"}
          </span>
          <span className="ml-2 text-xs text-zinc-400">{dataBR(pedido.data)}</span>
          {pedido.prazo_entrega && (
            <span className="mt-0.5 block text-xs font-medium text-orange-600 dark:text-orange-400">
              🚚 entrega prevista: {dataBR(pedido.prazo_entrega)}
            </span>
          )}
        </span>
        <span className="text-xs">
          {feito ? (
            <span className="font-medium text-green-600">✓ conferido</span>
          ) : (
            <span className="text-orange-600">{aberto ? "▲" : "conferir ▼"}</span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="mt-3 space-y-2">
          {pedido.itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                {i.nome}
                <span className="ml-1 text-xs text-zinc-400">
                  (pedido: {i.qtd} {i.unidade})
                </span>
              </span>
              <input
                inputMode="decimal"
                value={qtds[i.id] ?? ""}
                onChange={(e) =>
                  setQtds((s) => ({ ...s, [i.id]: e.target.value }))
                }
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          ))}
          <p className="text-[11px] text-zinc-400">
            Confirme quanto de cada item chegou. Isso é só um aviso pro
            responsável — a conferência final continua com ele.
          </p>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : feito ? "Atualizar conferência" : "Confirmar recebimento"}
          </button>
          {feito && pedido.conf_por && (
            <p className="text-center text-[11px] text-green-600">
              Conferido por {pedido.conf_por}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
