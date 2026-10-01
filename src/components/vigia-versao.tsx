"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// POR QUE ISTO EXISTE
//
// O sistema é publicado várias vezes por dia. Uma tela que ficou aberta desde
// antes da publicação continua rodando a versão velha, e quando a pessoa clica
// em algo que fala com o servidor, o servidor não reconhece mais aquela ação
// ("Failed to find Server Action… older or newer deployment") ou o navegador
// não acha mais um pedaço do código antigo (ChunkLoadError). O clique morre em
// silêncio e só recarregar a página resolve — foi a queixa do Rafael em
// 28/09/2026: "clico e não faz nada, tenho que atualizar a página".
//
// Duas defesas:
//  1. Se um erro desses acontecer, recarrega a página sozinho (uma vez a cada
//     30 s, pra nunca entrar em loop).
//  2. Pergunta ao servidor qual versão está no ar (a cada 5 min e sempre que a
//     aba volta a ficar visível). Mudou? Mostra uma faixa pedindo pra atualizar,
//     antes de o clique falhar — e, na PRÓXIMA navegação (trocar de tela),
//     recarrega de verdade, sozinho: entre uma tela e outra não tem carrinho
//     nem formulário no meio, é a hora segura.
//
// Lição de 01/10/2026 (almoço): a faixa ficava embaixo, em cima do botão
// "Lançar" do app do garçom; e o erro de versão no "Lançar" caía num catch que
// dizia "sem conexão", então ninguém recarregava. A faixa agora fica em cima e
// o app do garçom trata o erro de versão (garcom-pedido.tsx).
//
// As TVs ficam de fora: elas já se recarregam sozinhas e não têm quem clique.

const PADROES = [
  /Failed to find Server Action/i,
  /older or newer deployment/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Unexpected token '<'/i, // HTML da versão nova no lugar de um JS antigo
];

export function pareceVersaoVelha(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : typeof e === "string" ? e : "";
  return PADROES.some((p) => p.test(m));
}

// Recarrega, mas nunca duas vezes em meio minuto: um erro que persistir depois
// de recarregar não é de versão, e recarregar em loop seria pior.
export function recarregarUmaVez() {
  try {
    const k = "vigia_recarregou_em";
    const t = Number(sessionStorage.getItem(k) || 0);
    if (Date.now() - t < 30_000) return;
    sessionStorage.setItem(k, String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  window.location.reload();
}

export function VigiaVersao() {
  const [nova, setNova] = useState(false);
  const pathname = usePathname();
  // Em que tela a versão nova foi notada: quando a pessoa sair dela, recarrega.
  const telaAoNotar = useRef<string | null>(null);

  useEffect(() => {
    if (!nova || telaAoNotar.current === null || pathname === telaAoNotar.current) return;
    window.location.reload();
  }, [nova, pathname]);

  useEffect(() => {
    if (window.location.pathname.startsWith("/tv")) return;
    let inicial: string | null = null;
    let vivo = true;
    const ver = async () => {
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        const j = (await r.json()) as { versao?: string };
        if (!vivo || !j?.versao) return;
        if (inicial === null) inicial = j.versao;
        else if (j.versao !== inicial) { telaAoNotar.current = window.location.pathname; setNova(true); }
      } catch { /* sem rede agora: tenta na próxima */ }
    };
    ver();
    const t = setInterval(ver, 5 * 60 * 1000);
    const aoVoltar = () => { if (document.visibilityState === "visible") ver(); };
    const aoErro = (ev: ErrorEvent) => { if (pareceVersaoVelha(ev.error ?? ev.message)) recarregarUmaVez(); };
    const aoRejeitar = (ev: PromiseRejectionEvent) => { if (pareceVersaoVelha(ev.reason)) recarregarUmaVez(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, []);

  if (!nova) return null;
  return (
    <div
      role="status"
      // Em cima, não embaixo: embaixo é onde os apps de celular têm o botão
      // principal (Lançar, Entreguei…), e a faixa ficava por cima dele.
      className="fixed inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg print:hidden"
    >
      <span>O sistema foi atualizado. Pra continuar sem erro:</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-orange-500 px-3 py-1 font-semibold text-white hover:bg-orange-600"
      >
        Atualizar a página
      </button>
    </div>
  );
}
