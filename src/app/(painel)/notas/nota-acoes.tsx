"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estornarNota, cancelarNota } from "./actions";

export function NotaAcoes({
  notaId,
  situacao,
}: {
  notaId: string;
  situacao: string;
}) {
  const router = useRouter();
  const [processando, start] = useTransition();

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
          <Link
            href={`/notas/${notaId}`}
            className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            Revisar e lançar →
          </Link>
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
