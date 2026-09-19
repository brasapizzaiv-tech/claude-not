"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Icone } from "./icone";

// Os botões que esperam.
//
// Dois, porque há dois jeitos de chamar o servidor no sistema:
//   <Enviar>     dentro de um <form action={...}>
//   <BotaoAcao>  no clique, sem formulário
// Os dois se comportam igual por fora: apagam, travam e giram enquanto vão e
// voltam. O que muda é só de onde descobrem que estão esperando.
//
// ---------- Dentro de um formulário ----------
//
// O problema que ele resolve: 59 formulários do sistema mandavam direto pra
// ação do servidor e não mudavam NADA enquanto ela rodava. Quem clicava em
// "Salvar" numa internet ruim não tinha como saber se tinha pegado — e clicava
// de novo. Salvava duas vezes.
//
// Trocando `<button>` por `<Enviar>` dentro de um `<form action={...}>`, o
// botão passa a se apagar, travar e mostrar uma rodinha enquanto a ação vai e
// volta. Nada mais precisa mudar: o `useFormStatus` do React descobre sozinho
// o formulário em volta. É por isso que ele só funciona DENTRO do form — não
// adianta usar solto.
//
// A rodinha fica por cima em vez de empurrar o conteúdo: assim o botão não
// muda de tamanho no meio do clique, e uma seta de "subir categoria" continua
// do tamanho de uma seta.
export function Enviar({
  children,
  className = "",
  disabled,
  title,
  "aria-label": rotulo,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      aria-label={rotulo}
      aria-busy={pending || undefined}
      className={`relative disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span className={`inline-flex items-center gap-1.5 ${pending ? "invisible" : ""}`}>
        {children}
      </span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Icone nome="esperando" tamanho={16} className="animate-spin" titulo="Salvando" />
        </span>
      )}
    </button>
  );
}

// ---------- Fora de formulário ----------
//
// Mesmo comportamento, para o botão que chama o servidor no clique. Ele cuida
// da própria espera: não precisa de estado na tela que o usa.
//
// Clicar duas vezes seguidas não manda duas vezes — o segundo clique cai no
// botão já travado. Era esse o defeito em telas como a de convidar fornecedor,
// onde o convite saía repetido.
export function BotaoAcao({
  aoClicar,
  children,
  className = "",
  disabled,
  title,
  "aria-label": rotulo,
}: {
  /** O que fazer no clique. Pode demorar; o botão espera. */
  aoClicar: () => Promise<unknown> | unknown;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const [esperando, setEsperando] = useState(false);

  async function clicou() {
    if (esperando) return;
    setEsperando(true);
    try {
      await aoClicar();
    } finally {
      setEsperando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={clicou}
      disabled={esperando || disabled}
      title={title}
      aria-label={rotulo}
      aria-busy={esperando || undefined}
      className={`relative disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span className={`inline-flex items-center gap-1.5 ${esperando ? "invisible" : ""}`}>
        {children}
      </span>
      {esperando && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Icone nome="esperando" tamanho={16} className="animate-spin" titulo="Aguarde" />
        </span>
      )}
    </button>
  );
}
