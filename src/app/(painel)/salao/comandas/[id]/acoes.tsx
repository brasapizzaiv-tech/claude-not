"use client";

import { useTransition } from "react";
import { excluirComanda } from "../../actions";

export function AcoesComanda({ comandaId }: { comandaId: string }) {
  const [p, start] = useTransition();

  const excluir = () => {
    const motivo = window.prompt("Motivo da exclusão da comanda (obrigatório):", "");
    if (motivo == null) return;
    if (motivo.trim().length < 3) {
      window.alert("Informe o motivo (pelo menos 3 caracteres).");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("id", comandaId);
      fd.set("motivo", motivo.trim());
      await excluirComanda(fd);
    });
  };

  return (
    <div className="nao-imprimir mt-4">
      <button
        onClick={excluir}
        disabled={p}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:hover:bg-red-950/40"
      >
        {p ? "Excluindo..." : "🗑️ Excluir comanda"}
      </button>
    </div>
  );
}
