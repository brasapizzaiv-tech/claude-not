"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { vincularPedido } from "../actions";

export function BotaoConciliar({
  notaId,
  pedidoId,
  vincular,
}: {
  notaId: string;
  pedidoId: string | null;
  vincular: boolean;
}) {
  const router = useRouter();
  const [processando, start] = useTransition();

  return (
    <button
      disabled={processando}
      onClick={() =>
        start(async () => {
          await vincularPedido(notaId, vincular ? pedidoId : null);
          router.refresh();
        })
      }
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        vincular
          ? "bg-orange-500 text-white hover:bg-orange-600"
          : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {vincular ? "Vincular" : "Desvincular"}
    </button>
  );
}
