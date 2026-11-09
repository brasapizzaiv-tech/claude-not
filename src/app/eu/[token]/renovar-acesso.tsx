"use client";

import { useEffect } from "react";
import { renovarAcessoColab } from "./actions";

// Celular que ainda guarda o PIN no cookie (de antes de 09/11/2026): troca, em
// silêncio, pela chave de acesso (migration 0279). Não aparece nada na tela.
export function RenovarAcesso({ token }: { token: string }) {
  useEffect(() => {
    renovarAcessoColab(token).catch(() => { /* tenta de novo na próxima vez */ });
  }, [token]);
  return null;
}
