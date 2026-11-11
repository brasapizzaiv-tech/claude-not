"use client";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { confirmar, enviarSeConfirmar } from "@/components/dialogo";

import { excluirPedido } from "./actions";

export function ExcluirPedido({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={excluirPedido}
      onSubmit={enviarSeConfirmar(() =>
        confirmar(
          `Excluir o pedido de ${nome}? Isso remove o pedido e o lançamento dele no financeiro. Não dá pra desfazer.`,
          { perigo: true, okTexto: "Excluir o pedido" },
        ),
      )}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar
        title="Excluir pedido"
        className="text-zinc-300 hover:text-urgente-texto dark:text-zinc-600"
      >
        <Icone nome="lixeira" tamanho={15} titulo="Excluir pedido" />
      </Enviar>
    </form>
  );
}
