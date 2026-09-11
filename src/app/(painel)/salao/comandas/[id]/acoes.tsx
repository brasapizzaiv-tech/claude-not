"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirComanda, virarLivreComanda } from "../../actions";

export function AcoesComanda({ comandaId, livre, temBuffet }: { comandaId: string; livre?: boolean; temBuffet?: boolean }) {
  const [p, start] = useTransition();
  const router = useRouter();

  // Cliente pesou e depois resolveu comer à vontade: o valor do peso vira o
  // do buffet livre do dia. Nada é apagado — a nota sai com o valor certo.
  const virarLivre = () => {
    if (!window.confirm("Trocar o valor do peso pelo BUFFET LIVRE do dia?")) return;
    start(async () => {
      const r = await virarLivreComanda(comandaId);
      if (!r.ok) { window.alert(r.mensagem); return; }
      router.refresh();
    });
  };

  const excluir = () => {
    const motivo = window.prompt("Motivo da exclusão da comanda (obrigatório):", "");
    if (motivo == null) return;
    if (motivo.trim().length < 3) {
      window.alert("Informe o motivo (pelo menos 3 caracteres).");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("id", comandaId);
      fd.set("motivo", motivo.trim());
      // Quando exclui, a ação redireciona pro salão e nunca volta aqui; se
      // voltar, é porque recusou — e o motivo precisa aparecer.
      const r = await excluirComanda(fd);
      if (r && !r.ok) window.alert(r.mensagem);
    });
  };

  return (
    <div className="nao-imprimir mt-4 flex flex-wrap gap-2">
      {temBuffet && !livre && (
        <button
          onClick={virarLivre}
          disabled={p}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          🍽️ Virar buffet livre
        </button>
      )}
      <button
        onClick={excluir}
        disabled={p}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:hover:bg-red-950/40"
      >
        {p ? "Aguarde..." : "🗑️ Excluir comanda"}
      </button>
    </div>
  );
}
