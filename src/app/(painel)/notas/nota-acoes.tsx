"use client";

import { useTransition } from "react";
import { confirmar } from "@/components/dialogo";
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
      if (!await confirmar("Marcar esta nota como cancelada? Sai do financeiro."))
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
            className="flex min-h-11 items-center whitespace-nowrap rounded-controle bg-texto px-3 text-xs font-medium text-fundo transition hover:opacity-90"
          >
            Revisar e lançar
          </Link>
          <button
            onClick={cancelar}
            disabled={processando}
            className="text-xs text-texto-fraco transition hover:text-erro"
          >
            Cancelar
          </button>
        </>
      )}
      {situacao === "lancada" && (
        <button
          onClick={estornar}
          disabled={processando}
          className="text-xs text-texto-fraco transition hover:text-alerta"
        >
          Estornar
        </button>
      )}
      {situacao === "cancelada" && (
        <span className="text-xs text-texto-fraco">cancelada</span>
      )}
    </div>
  );
}
