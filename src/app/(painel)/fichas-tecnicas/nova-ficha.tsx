"use client";

import { useActionState } from "react";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { criarFicha } from "./actions";

// Cria a ficha e já abre ela (o redirect é no servidor). Erro (nome repetido) aparece embaixo.
export function NovaFicha() {
  const [estado, enviar] = useActionState(async (_: string | null, fd: FormData) => {
    const r = await criarFicha(fd);
    return r && !r.ok ? r.erro : null;
  }, null);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input name="nome" required minLength={2} placeholder="Nome da nova ficha" aria-label="Nome da nova ficha" className="campo w-60" />
        <Enviar className="btn-principal px-5"><Icone nome="novo" tamanho={16} /> Nova ficha</Enviar>
      </div>
      {estado && <p role="alert" className="text-sm text-urgente-texto">{estado}</p>}
    </form>
  );
}
