"use client";

import { createContext, useContext } from "react";

// O nome da empresa pras telas do painel que rodam no navegador (mensagem do
// pedido no WhatsApp, convite da cotação). Vem do cadastro, pelo layout do
// painel — nada de "Brasa" escrito no código.
type NomeEmpresa = { nome: string; curto: string };

const Ctx = createContext<NomeEmpresa>({ nome: "", curto: "" });

export function NomeEmpresaProvider({ nome, curto, children }: NomeEmpresa & { children: React.ReactNode }) {
  return <Ctx.Provider value={{ nome, curto }}>{children}</Ctx.Provider>;
}

/** `nome` = completo do cadastro; `curto` = o que aparece nas telas. */
export function useNomeEmpresa(): NomeEmpresa {
  return useContext(Ctx);
}
