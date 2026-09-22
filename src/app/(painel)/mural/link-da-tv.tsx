"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { BotaoAcao } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";
import { trocarChaveDoMural } from "./actions";

// O LINK QUE ABRE O MURAL NUMA TV
//
// Fica no pé da tela, dobrado, porque não é o assunto do dia a dia: o Rafael
// abre isto uma vez, cola na TV e não volta mais. O endereço se monta no
// navegador porque só ele sabe o domínio de onde a pessoa está (o mesmo
// sistema atende por mais de um).
export function LinkDaTv({ chave, origem }: { chave: string | null; origem: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (!chave) return null;
  const url = `${origem}/tv/mural?chave=${chave}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      // Navegador sem permissão de área de transferência: o campo fica ali
      // pra pessoa selecionar e copiar na mão.
    }
  }

  return (
    <div className="px-5 pb-6">
      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="text-sm text-texto-suave hover:text-texto hover:underline"
        >
          Link para abrir numa TV, sem login
        </button>
      ) : (
        <div className="max-w-[80ch] rounded-cartao bg-painel-cartao p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-texto">Abrir numa TV, sem login</p>
            <button onClick={() => setAberto(false)} className="text-xs text-texto-fraco hover:underline">
              fechar
            </button>
          </div>
          <p className="mb-3 text-sm text-texto-suave">
            Cole este endereço no navegador da TV. Ele mostra o mesmo mural, em
            letra maior e sem pedir senha — quem tiver o link entra, então mande
            só pra quem precisa. Para aumentar ou diminuir a letra, acrescente{" "}
            <span className="font-numero">&amp;tamanho=1.5</span> no fim.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-controle border border-borda-forte bg-superficie-suave px-3 py-2 text-sm text-texto-suave dark:text-texto-fraco"
            />
            <button
              onClick={copiar}
              className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-medium text-texto-suave hover:bg-superficie-suave"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-controle bg-texto px-3 py-2 text-sm font-medium text-fundo hover:opacity-90"
            >
              Abrir
            </a>
          </div>
          {/* Trocar a chave é o único jeito de cortar um link que vazou. */}
          <BotaoAcao
            aoClicar={async () => {
              const ok = await confirmar(
                "Gerar um link novo? O link antigo para de funcionar na hora — quem já tiver colado numa TV precisa do novo.",
                { perigo: true },
              );
              if (!ok) return;
              await trocarChaveDoMural();
            }}
            className="mt-3 text-xs text-texto-fraco hover:text-texto hover:underline"
          >
            <Icone nome="atualizar" tamanho={12} /> gerar um link novo
          </BotaoAcao>
        </div>
      )}
    </div>
  );
}
