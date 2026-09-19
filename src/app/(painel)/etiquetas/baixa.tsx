"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { darBaixaEtiqueta, reativarEtiqueta } from "./actions";

export function EtiquetaBaixa({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [p, start] = useTransition();

  const baixa = (s: "usada" | "descartada") =>
    start(async () => {
      await darBaixaEtiqueta(id, s);
      router.refresh();
    });
  const reativar = () =>
    start(async () => {
      await reativarEtiqueta(id);
      router.refresh();
    });

  if (status === "ativa") {
    return (
      <>
        <button
          onClick={() => baixa("usada")}
          disabled={p}
          className="mr-2 rounded-controle bg-texto px-3 py-1.5 text-xs font-medium text-fundo hover:opacity-90 disabled:opacity-60"
        >
          Dar baixa
        </button>
        <button
          onClick={() => baixa("descartada")}
          disabled={p}
          className="mr-2 text-xs text-texto-fraco hover:text-red-600"
        >
          Descartar
        </button>
      </>
    );
  }
  return (
    <button
      onClick={reativar}
      disabled={p}
      className="mr-2 text-xs text-texto-fraco hover:text-orange-600 disabled:opacity-60"
    >
      Reativar
    </button>
  );
}
