"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icone, type NomeIcone } from "@/components/icone";

// As perguntas e avisos do sistema.
//
// Antes eram as caixas cinzas do navegador (confirm, alert, prompt). Elas
// travam a tela inteira, não aceitam cor nenhuma, escrevem o endereço do site
// em cima, e no celular parecem defeito. Eram 96 no sistema.
//
// Estas aqui são do sistema: seguem o tema, a cor da empresa e os dois raios.
//
// Como usar, de qualquer lugar (não precisa de hook nem de contexto):
//     if (!(await confirmar("Apagar a área?"))) return;
//     void avisar("Nota emitida.");
//     const motivo = await perguntar("Motivo da exclusão:");
//
// O <Dialogos /> fica montado uma vez em cada moldura. Se por algum motivo não
// estiver montado, cai na caixa do navegador — melhor feio do que perder a
// pergunta.

type Pedido =
  | { tipo: "confirmar"; texto: string; detalhe?: string; perigo?: boolean; okTexto?: string }
  | { tipo: "avisar"; texto: string; detalhe?: string }
  | { tipo: "perguntar"; texto: string; detalhe?: string; valor?: string; obrigatorio?: boolean };

type Resolver = (v: string | boolean | null) => void;

// Ponte entre quem chama e o componente montado.
let abrirNaTela: ((p: Pedido, r: Resolver) => void) | null = null;

/** Pergunta de sim ou não. Devolve true se a pessoa confirmou. */
export function confirmar(
  texto: string,
  opcoes?: { detalhe?: string; perigo?: boolean; okTexto?: string },
): Promise<boolean> {
  if (!abrirNaTela) return Promise.resolve(window.confirm(texto));
  return new Promise((res) =>
    abrirNaTela!({ tipo: "confirmar", texto, ...opcoes }, (v) => res(v === true)),
  );
}

/** Aviso com um botão só. Normalmente chamado com `void` — não se espera. */
export function avisar(texto: string, detalhe?: string): Promise<void> {
  if (!abrirNaTela) { window.alert(texto); return Promise.resolve(); }
  return new Promise((res) => abrirNaTela!({ tipo: "avisar", texto, detalhe }, () => res()));
}

/** Pede um texto. Devolve null se a pessoa desistiu. */
export function perguntar(
  texto: string,
  valor = "",
  opcoes?: { detalhe?: string; obrigatorio?: boolean },
): Promise<string | null> {
  if (!abrirNaTela) return Promise.resolve(window.prompt(texto, valor));
  return new Promise((res) =>
    abrirNaTela!({ tipo: "perguntar", texto, valor, ...opcoes }, (v) =>
      res(typeof v === "string" ? v : null),
    ),
  );
}

export function Dialogos() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState("");
  const resolverRef = useRef<Resolver | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const fechar = useCallback((valor: string | boolean | null) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setPedido(null);
  }, []);

  // Registra a ponte enquanto este componente estiver na tela.
  useEffect(() => {
    abrirNaTela = (p, r) => {
      resolverRef.current = r;
      setTexto(p.tipo === "perguntar" ? (p.valor ?? "") : "");
      setPedido(p);
    };
    return () => { abrirNaTela = null; };
  }, []);

  // Esc desiste, Enter confirma. O foco entra no campo ou no botão principal.
  useEffect(() => {
    if (!pedido) return;
    const t = setTimeout(() => {
      if (pedido.tipo === "perguntar") campoRef.current?.select();
      else okRef.current?.focus();
    }, 0);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); fechar(pedido.tipo === "confirmar" ? false : null); }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => { clearTimeout(t); window.removeEventListener("keydown", aoTeclar); };
  }, [pedido, fechar]);

  if (!pedido) return null;

  const perigo = pedido.tipo === "confirmar" && pedido.perigo;
  const icone: NomeIcone = perigo ? "alerta" : pedido.tipo === "avisar" ? "aviso" : "duvida";
  const faltaTexto = pedido.tipo === "perguntar" && pedido.obrigatorio && !texto.trim();

  function confirmarAgora() {
    if (!pedido) return;
    if (pedido.tipo === "perguntar") {
      if (faltaTexto) return;
      fechar(texto);
    } else {
      fechar(true);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Fundo. Clicar fora desiste, igual a apertar Esc. */}
      <button
        aria-label="Fechar"
        onClick={() => fechar(pedido.tipo === "confirmar" ? false : null)}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={pedido.texto}
        className="relative w-full max-w-sm rounded-cartao bg-painel-cartao p-5"
      >
        <div className="flex items-start gap-3">
          <Icone
            nome={icone}
            tamanho={22}
            className={perigo ? "mt-0.5 text-erro" : "mt-0.5 text-texto-suave"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-texto">{pedido.texto}</p>
            {pedido.detalhe && <p className="mt-1 text-sm text-texto-suave">{pedido.detalhe}</p>}

            {pedido.tipo === "perguntar" && (
              <input
                ref={campoRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmarAgora(); } }}
                className="mt-3 min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria"
              />
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {pedido.tipo !== "avisar" && (
            <button
              onClick={() => fechar(pedido.tipo === "confirmar" ? false : null)}
              className="min-h-11 rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
            >
              Cancelar
            </button>
          )}
          <button
            ref={okRef}
            onClick={confirmarAgora}
            disabled={faltaTexto}
            className={`min-h-11 rounded-controle px-4 text-sm font-semibold transition disabled:opacity-40 ${
              perigo ? "bg-erro text-white hover:opacity-90" : "bg-texto text-fundo hover:opacity-90"
            }`}
          >
            {pedido.tipo === "avisar"
              ? "Entendi"
              : pedido.tipo === "confirmar"
                ? (pedido.okTexto ?? "Confirmar")
                : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
