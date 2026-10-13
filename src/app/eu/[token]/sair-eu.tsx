"use client";

import { usePathname } from "next/navigation";
import { SairDoAparelho } from "@/components/sair-do-aparelho";
import { sairDoAparelhoColab } from "./actions";

// Em todas as telas do app da equipe (inclusive "Link inválido" e a do PIN):
// o token vem do endereço, então a moldura não precisa saber dele.
export function SairEu() {
  const token = (usePathname() ?? "").split("/")[2] ?? "";
  return (
    <div className="mt-6 text-center">
      <SairDoAparelho aoSair={token ? () => sairDoAparelhoColab(token) : undefined} />
    </div>
  );
}
