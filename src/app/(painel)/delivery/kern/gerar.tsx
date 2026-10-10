"use client";

import { useState } from "react";
import { BotaoAcao } from "@/components/enviar";
import type { ResultadoKern } from "@/lib/kern-delivery";
import { gerarKernAgora } from "./actions";

const ACAO: Record<ResultadoKern["acao"], string> = {
  criado: "pedido criado",
  atualizado: "quantidade atualizada",
  igual: "já estava certo",
  travado: "não mexi",
  sem_cliente: "sem cliente",
  erro: "erro",
};

export function GerarAgora() {
  const [r, setR] = useState<{ mensagem?: string; filiais: ResultadoKern[] } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <BotaoAcao
        aoClicar={async () => setR(await gerarKernAgora())}
        className="min-h-11 self-start rounded-controle border border-borda-forte px-4 text-sm font-semibold"
      >
        Gerar ou atualizar os pedidos de hoje
      </BotaoAcao>
      {r && (
        <div className="text-sm">
          {r.mensagem && <p className="text-texto-suave">{r.mensagem}</p>}
          <ul className="mt-1 space-y-0.5">
            {r.filiais.map((f) => (
              <li key={f.filial} className={f.acao === "erro" || f.acao === "sem_cliente" || f.acao === "travado" ? "text-amber-700 dark:text-amber-400" : "text-texto"}>
                {f.filial}: {f.qtd} marmitas, {ACAO[f.acao]}{f.detalhe ? ` (${f.detalhe})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
