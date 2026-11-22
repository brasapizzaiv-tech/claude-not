"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";

// Botão que copia a chave Pix do colaborador (0323) pra colar no app do banco
// na hora de pagar. Mostra o tipo e a chave no "title" pra conferir antes.
export function CopiarPix({ tipo, chave, className = "" }: { tipo?: string | null; chave?: string | null; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const valor = (chave ?? "").trim();
  if (!valor) return null;
  const rotulo = tipo ? `Pix (${tipo})` : "Pix";

  return (
    <button
      type="button"
      title={`${rotulo}: ${valor}`}
      onClick={() =>
        navigator.clipboard.writeText(valor).then(
          () => { setFalhou(false); setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
          () => setFalhou(true),
        )
      }
      className={`inline-flex min-h-11 items-center gap-1 rounded-controle px-2 text-mini font-semibold text-texto-marca hover:bg-destaque ${className}`}
    >
      <Icone nome={copiado ? "ok" : "copiar"} tamanho={13} />
      {copiado ? "Chave copiada" : falhou ? `Copie: ${valor}` : `Copiar ${rotulo}`}
    </button>
  );
}
