"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { lancarNota, estornarNota, cancelarNota } from "./actions";

export function NotaAcoes({
  notaId,
  situacao,
}: {
  notaId: string;
  situacao: string;
}) {
  const router = useRouter();
  const [processando, start] = useTransition();

  const lancar = () =>
    start(async () => {
      await lancarNota(notaId);
      router.refresh();
    });
  const estornar = () =>
    start(async () => {
      await estornarNota(notaId);
      router.refresh();
    });
  const cancelar = () =>
    start(async () => {
      if (!window.confirm("Marcar esta nota como cancelada? Sai do financeiro."))
        return;
      await cancelarNota(notaId);
      router.refresh();
    });

  return (
    <div className="flex items-center justify-end gap-2">
      {situacao === "pendente" && (
        <>
          <button
            onClick={lancar}
            disabled={processando}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Lançar
          </button>
          <button
            onClick={cancelar}
            disabled={processando}
            className="text-xs text-zinc-400 hover:text-red-600"
          >
            Cancelar
          </button>
        </>
      )}
      {situacao === "lancada" && (
        <button
          onClick={estornar}
          disabled={processando}
          className="text-xs text-zinc-400 hover:text-amber-600"
        >
          Estornar
        </button>
      )}
      {situacao === "cancelada" && (
        <span className="text-xs text-zinc-400">cancelada</span>
      )}
    </div>
  );
}
