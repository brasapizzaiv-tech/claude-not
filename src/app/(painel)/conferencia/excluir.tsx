"use client";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";

import { excluirPedido } from "./actions";

export function ExcluirPedido({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={excluirPedido}
      onSubmit={async (e) => {
        if (
          !await confirmar(
            `Apagar o pedido de ${nome}? Isso remove o pedido e o lançamento dele no financeiro. Não dá pra desfazer.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar
        title="Apagar pedido"
        className="text-zinc-300 hover:text-red-600 dark:text-zinc-600"
      >
        <Icone nome="lixeira" tamanho={15} titulo="Excluir" />
      </Enviar>
    </form>
  );
}
