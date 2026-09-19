"use client";

import { useLayoutEffect, useState } from "react";
import { salvarTema } from "@/app/(painel)/tema-actions";
import { COOKIE_TEMA, TEMAS, type Tema } from "@/lib/tema";
import { Icone } from "@/components/icone";

// Botãozinho no pé do menu pra escolher se o painel fica claro ou escuro.
// Ao escolher, a tela muda na hora e a preferência vai pro perfil da pessoa,
// então vale também no celular e em qualquer outro computador dela.

function resolvido(t: Tema): "claro" | "escuro" {
  if (t === "claro" || t === "escuro") return t;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

function aplicar(t: Tema) {
  document.documentElement.setAttribute("data-tema", resolvido(t));
}

function gravarCookie(t: Tema) {
  // Um ano. É esse cookie que o script do layout lê pra tela não piscar.
  document.cookie = `${COOKIE_TEMA}=${t}; path=/; max-age=31536000; SameSite=Lax`;
}

export function SeletorTema({ inicial, recolhido = false }: { inicial: Tema; recolhido?: boolean }) {
  const [tema, setTema] = useState<Tema>(inicial);
  const [aberto, setAberto] = useState(false);

  // Alinha o navegador com o que está salvo no perfil. É o que faz a escolha
  // aparecer certa quando a pessoa entra num aparelho novo, onde o cookie ainda
  // não existe. (Também repõe o atributo depois da remontagem do React em
  // desenvolvimento; em produção não muda nada.)
  useLayoutEffect(() => {
    gravarCookie(inicial);
    aplicar(inicial);
  }, [inicial]);

  // "Do aparelho": acompanha se a pessoa virar a chave do sistema operacional
  // com a tela já aberta.
  useLayoutEffect(() => {
    if (tema !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicar("sistema");
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [tema]);

  function escolher(t: Tema) {
    setTema(t);
    gravarCookie(t);
    aplicar(t);
    setAberto(false);
    void salvarTema(t);
  }

  const atual = TEMAS.find((t) => t.valor === tema) ?? TEMAS[2];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={`Aparência: ${atual.label}`}
        aria-label={`Aparência: ${atual.label}. Tocar pra mudar.`}
        aria-expanded={aberto}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <Icone nome={atual.icone} tamanho={18} />
      </button>

      {aberto && (
        <>
          {/* Toque fora fecha. */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className={`absolute bottom-10 z-50 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${
              recolhido ? "left-0" : "right-0"
            }`}
          >
            <p className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              Aparência
            </p>
            {TEMAS.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => escolher(t.valor)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  t.valor === tema ? "bg-orange-50 dark:bg-zinc-800" : ""
                }`}
              >
                <Icone nome={t.icone} tamanho={17} className="mt-0.5 text-zinc-500 dark:text-zinc-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.label}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{t.ajuda}</span>
                </span>
                {t.valor === tema && <Icone nome="ok" tamanho={16} className="mt-0.5 text-orange-600 dark:text-orange-400" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
