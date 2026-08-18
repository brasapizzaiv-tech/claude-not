"use client";

import { excluirPedido } from "./actions";

export function ExcluirPedido({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={excluirPedido}
      onSubmit={(e) => {
        if (
          !confirm(
            `Apagar o pedido de ${nome}? Isso remove o pedido e o lançamento dele no financeiro. Não dá pra desfazer.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title="Apagar pedido"
        className="text-zinc-300 hover:text-red-600 dark:text-zinc-600"
      >
        🗑
      </button>
    </form>
  );
}
