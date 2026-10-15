"use client";

import { usePathname } from "next/navigation";
import { SairDoAparelho } from "@/components/sair-do-aparelho";
import { removerPushColab, sairDoAparelhoColab } from "./actions";
import { CHAVE_PUSH } from "./avisos-celular";

// Em todas as telas do app da equipe (inclusive "Link inválido" e a do PIN):
// o token vem do endereço, então a moldura não precisa saber dele.
// Esquece o PIN e, se este celular recebia avisos dessa pessoa, para de receber.
async function sair(token: string) {
  let push: string | null = null;
  try { push = localStorage.getItem(CHAVE_PUSH); localStorage.removeItem(CHAVE_PUSH); } catch { /* sem storage */ }
  if (push) await removerPushColab(token, push);
  return sairDoAparelhoColab(token);
}

export function SairEu() {
  const token = (usePathname() ?? "").split("/")[2] ?? "";
  return (
    <div className="mt-6 text-center">
      <SairDoAparelho aoSair={token ? () => sair(token) : undefined} />
    </div>
  );
}
