"use client";

import { useState } from "react";
import { BotaoAcao } from "@/components/enviar";
import { mudarCampanha } from "../actions";

type Acao = "lancar" | "pausar" | "retomar" | "cancelar";

// Botões conforme a situação: rascunho lança; agendada/enviando pausa; pausada retoma.
export function AcoesCampanha({ id, status }: { id: string; status: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const agir = (acao: Acao, pergunta?: string) => async () => {
    if (pergunta && !window.confirm(pergunta)) return;
    setErro(null);
    const r = await mudarCampanha(id, acao);
    if (!r.ok) setErro(r.mensagem);
  };
  const b = "rounded-controle border border-borda-forte px-3 py-2 text-sm font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "rascunho" && (
        <BotaoAcao aoClicar={agir("lancar", "Lançar a campanha? Ela começa a sair no próximo horário marcado.")} className="rounded-controle bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Lançar</BotaoAcao>
      )}
      {["agendada", "enviando"].includes(status) && <BotaoAcao aoClicar={agir("pausar")} className={b}>Pausar</BotaoAcao>}
      {status === "pausada" && <BotaoAcao aoClicar={agir("retomar")} className={b}>Retomar</BotaoAcao>}
      {!["concluida", "cancelada"].includes(status) && (
        <BotaoAcao aoClicar={agir("cancelar", "Cancelar a campanha? Quem ainda está na fila não recebe.")} className={`${b} text-red-600`}>Cancelar</BotaoAcao>
      )}
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </div>
  );
}
