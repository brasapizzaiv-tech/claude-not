"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarNotasSefaz } from "./sefaz-actions";

export function BuscarNotas({ bloqueadoAte }: { bloqueadoAte: string | null }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const bloqueado = bloqueadoAte ? new Date(bloqueadoAte) > new Date() : false;
  const hora = bloqueadoAte
    ? new Date(bloqueadoAte).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  function buscar() {
    start(async () => {
      const r = await buscarNotasSefaz();
      if (r.erro) setMsg(r.erro);
      else
        setMsg(
          `✓ ${r.importadas ?? 0} nota(s) completa(s) e ${r.resumos ?? 0} resumo(s) baixados.`,
        );
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            🔄 Buscar notas na SEFAZ
          </p>
          <p className="text-xs text-zinc-500">
            A SEFAZ libera 1 busca por hora.
            {bloqueado ? ` Próxima liberada às ${hora}.` : " Disponível agora."}
          </p>
        </div>
        <button
          onClick={buscar}
          disabled={p}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {p ? "Buscando..." : "Buscar notas"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
