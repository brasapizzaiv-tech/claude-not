"use client";

import { Enviar } from "@/components/enviar";
import { confirmar, enviarSeConfirmar } from "@/components/dialogo";
import { excluirFechamento } from "../actions";

// Excluir o fechamento apaga o registro de vez: pergunta antes (ACE-02).
export function ExcluirFechamento({ id, titulo }: { id: string; titulo: string }) {
  return (
    <form
      action={excluirFechamento}
      onSubmit={enviarSeConfirmar(() =>
        confirmar(`Excluir o fechamento ${titulo}?`, {
          detalhe: "O registro some de vez e não dá pra desfazer.",
          perigo: true,
          okTexto: "Excluir o fechamento",
        }),
      )}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar className="rounded-controle border border-borda-forte px-4 py-2 text-sm text-texto-suave hover:border-red-400 hover:text-red-600 dark:border-borda-forte">
        Excluir
      </Enviar>
    </form>
  );
}
