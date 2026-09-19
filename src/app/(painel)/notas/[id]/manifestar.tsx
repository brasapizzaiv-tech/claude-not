"use client";

import { useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { manifestarEBaixar } from "../sefaz-actions";

export function ManifestarNota({ notaId }: { notaId: string }) {
  const router = useRouter();
  const [processando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);

  async function manifestar() {
    if (
      !await confirmar(
        "Isto registra a 'Ciência da Operação' desta nota na SEFAZ (ação fiscal oficial) e tenta baixar a nota completa. Continuar?",
      )
    )
      return;
    start(async () => {
      const r = await manifestarEBaixar(notaId);
      setDiag(r?.completa ? null : (r?.diag ?? null));
      if (r?.erro) setMsg(r.erro);
      else if (r?.completa)
        setMsg("✓ Nota completa baixada! Role para ver os itens e lançar.");
      else
        setMsg(
          "✓ Manifestada! A SEFAZ libera o XML completo com um pequeno atraso — a busca automática vai completar esta nota em breve (sem precisar clicar de novo). Enquanto isso, dá pra lançar pelo valor total.",
        );
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-cartao border border-borda p-5">
      <h2 className="font-semibold text-texto">
        Baixar nota completa
      </h2>
      <p className="mb-3 mt-1 text-sm text-texto-suave">
        Esta nota veio em resumo (sem itens). Manifestar a “Ciência da Operação”
        na SEFAZ libera o XML completo com todos os itens.
      </p>
      <button
        onClick={manifestar}
        disabled={processando}
        className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
      >
        {processando ? "Manifestando e baixando..." : "Manifestar e baixar completa"}
      </button>
      {msg && (
        <p className="mt-3 text-sm text-texto-suave">{msg}</p>
      )}
      {diag && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-texto-fraco">
            detalhe técnico (me mande isto para eu corrigir)
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-controle bg-zinc-900 p-2 text-[10px] text-green-400">
            {diag}
          </pre>
        </details>
      )}
    </div>
  );
}
