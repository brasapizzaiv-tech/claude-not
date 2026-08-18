"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { manifestarEBaixar } from "../sefaz-actions";

export function ManifestarNota({ notaId }: { notaId: string }) {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);

  function manifestar() {
    if (
      !window.confirm(
        "Isto registra a 'Ciência da Operação' desta nota na SEFAZ (ação fiscal oficial) e já baixa a nota completa. Continuar?",
      )
    )
      return;
    start(async () => {
      const r = await manifestarEBaixar(notaId);
      setDiag(r?.completa ? null : (r?.diag ?? null));
      if (r?.erro) setMsg(`❌ ${r.erro}`);
      else if (r?.completa)
        setMsg("✓ Nota completa baixada! Role para ver os itens e lançar.");
      else
        setMsg(
          `✓ Manifestada! A SEFAZ ainda está liberando a nota completa. Clique de novo em instantes.${r?.buscaErro ? ` (${r.buscaErro})` : ""}`,
        );
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Baixar nota completa
      </h2>
      <p className="mb-3 mt-1 text-sm text-zinc-500">
        Esta nota veio em resumo (sem itens). Manifestar a “Ciência da Operação”
        na SEFAZ libera o XML completo com todos os itens.
      </p>
      <button
        onClick={manifestar}
        disabled={processando}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {processando ? "Manifestando e baixando..." : "Manifestar e baixar completa"}
      </button>
      {msg && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{msg}</p>
      )}
      {diag && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-400">
            detalhe técnico (me mande isto para eu corrigir)
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-2 text-[10px] text-green-400">
            {diag}
          </pre>
        </details>
      )}
    </div>
  );
}
