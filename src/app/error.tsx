"use client";

import { useEffect } from "react";
import { pareceVersaoVelha, recarregarUmaVez } from "@/components/vigia-versao";

// Tela de erro do sistema inteiro. Antes não existia: um erro na tela virava a
// página branca padrão do Next, sem saída. Se o erro for de versão velha (a
// página ficou aberta e o sistema foi atualizado), recarrega sozinho; senão,
// explica e dá o botão.
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (pareceVersaoVelha(error)) recarregarUmaVez();
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-painel-fundo p-6">
      <div className="max-w-md rounded-cartao bg-painel-cartao p-6 text-center">
        <h1 className="text-lg font-bold text-texto">Algo deu errado nesta tela</h1>
        <p className="mt-2 text-sm text-texto-suave">
          Quase sempre é o sistema que foi atualizado enquanto a página estava aberta. Atualizar a página resolve.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-controle bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Atualizar a página
          </button>
          <button type="button" onClick={reset} className="rounded-controle border border-borda-forte px-4 py-2 text-sm text-texto">
            Tentar de novo
          </button>
        </div>
        {error.digest && <p className="mt-3 text-mini text-texto-fraco">código {error.digest}</p>}
      </div>
    </div>
  );
}
