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
      className={`rounded-controle px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        vincular
          ? "bg-orange-500 text-white hover:bg-orange-600"
          : "border border-borda-forte text-texto-suave hover:bg-superficie-suave   "
      }`}
    >
      {vincular ? "Vincular" : "Desvincular"}
    </button>
  );
}
