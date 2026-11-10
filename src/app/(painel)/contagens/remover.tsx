"use client";

import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { excluirContagem } from "./actions";

// "Remover" só aparece na contagem em rascunho e pergunta antes (EST-02).
export function RemoverContagem({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  return (
    <BotaoAcao
      className="text-texto-fraco hover:text-urgente-texto"
      aoClicar={async () => {
        if (!(await confirmar(`Remover a contagem "${nome}"?`, {
          detalhe: "Ela some de vez, com os itens contados e os links enviados.",
          perigo: true,
          okTexto: "Remover a contagem",
        })))
          return;
        const r = await excluirContagem(id);
        if (!r.ok) { void avisar(r.mensagem); return; }
        router.refresh();
      }}
    >
      Remover
    </BotaoAcao>
  );
}
