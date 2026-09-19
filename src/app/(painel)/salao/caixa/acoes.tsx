"use client";
import { Icone } from "@/components/icone";

// Entradas e saídas de dinheiro do caixa num botão só: suprimento (reforço de
// troco) e sangria (retirada) eram dois blocos abertos lado a lado e ocupavam
// meia tela. Agora é "Movimentar caixa" → escolhe entrada ou saída.
import { useState } from "react";
import { suprimento, sangria } from "../actions";

const inputCls =
  "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

export function CaixaAcoes({ caixaId }: { caixaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"suprimento" | "sangria">("suprimento");
  const entrada = tipo === "suprimento";

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave"
      >
        <Icone nome="dinheiro" tamanho={15} className="mr-1.5" /> Movimentar caixa
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-cartao bg-painel-cartao p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-texto">Movimentar caixa</h2>
              <button onClick={() => setAberto(false)} className="text-texto-fraco hover:text-texto-suave">✕</button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("suprimento")}
                className={`flex-1 rounded-cartao border-2 px-3 py-3 text-sm font-semibold ${entrada ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-borda-forte text-texto-suave "}`}
              >
                + Entrada
                <span className="block text-mini font-normal">suprimento / troco</span>
              </button>
              <button
                type="button"
                onClick={() => setTipo("sangria")}
                className={`flex-1 rounded-cartao border-2 px-3 py-3 text-sm font-semibold ${!entrada ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-borda-forte text-texto-suave "}`}
              >
                − Saída
                <span className="block text-mini font-normal">sangria / pagamento</span>
              </button>
            </div>

            {/* key: troca o formulário ao mudar o tipo, pra não levar o valor digitado junto */}
            <form key={tipo} action={entrada ? suprimento : sangria} onSubmit={() => setAberto(false)} className="space-y-3">
              <input type="hidden" name="caixa_id" value={caixaId} />
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Valor (R$)</label>
                <input name="valor" inputMode="decimal" placeholder="0,00" autoFocus className={`${inputCls} w-full text-lg`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Motivo</label>
                <input
                  name="descricao"
                  placeholder={entrada ? "Reforço de troco" : "Retirada / pagamento"}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAberto(false)} className="flex min-h-11 items-center rounded-controle border border-borda-forte px-4 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave">
                  Cancelar
                </button>
                <button
                  className="min-h-11 rounded-controle bg-texto px-5 text-sm font-semibold text-fundo transition hover:opacity-90"
                >
                  {entrada ? "Lançar entrada" : "Lançar saída"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
