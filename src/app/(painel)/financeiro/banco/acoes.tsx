"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { conciliar, desconciliar } from "./actions";

export function TransacaoAcoes({
  transacaoId,
  conciliado,
  sugestaoId,
}: {
  transacaoId: string;
  conciliado: boolean;
  sugestaoId: string | null;
}) {
  const router = useRouter();
  const [processando, start] = useTransition();

  if (conciliado) {
    return (
      <button
        disabled={processando}
        onClick={() =>
          start(async () => {
            await desconciliar(transacaoId);
            router.refresh();
          })
        }
        className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-60"
      >
        Desfazer
      </button>
    );
  }
  if (sugestaoId) {
    return (
      <button
        disabled={processando}
        onClick={() =>
          start(async () => {
            await conciliar(transacaoId, sugestaoId);
            router.refresh();
          })
        }
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        Conciliar
      </button>
    );
  }
  return <span className="text-xs text-zinc-400">sem par</span>;
}
