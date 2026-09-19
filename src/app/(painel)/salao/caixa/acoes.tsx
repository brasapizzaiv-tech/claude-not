"use client";
import { Icone } from "@/components/icone";

// Entradas e saídas de dinheiro do caixa num botão só: suprimento (reforço de
// troco) e sangria (retirada) eram dois blocos abertos lado a lado e ocupavam
// meia tela. Agora é "Movimentar caixa" → escolhe entrada ou saída.
import { useState } from "react";
import { suprimento, sangria } from "../actions";

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CaixaAcoes({ caixaId }: { caixaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"suprimento" | "sangria">("suprimento");
  const entrada = tipo === "suprimento";

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <Icone nome="dinheiro" tamanho={15} className="mr-1.5" /> Movimentar caixa
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Movimentar caixa</h2>
              <button onClick={() => setAberto(false)} className="text-zinc-400 hover:text-zinc-700">✕</button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("suprimento")}
                className={`flex-1 rounded-xl border-2 px-3 py-3 text-sm font-semibold ${entrada ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
              >
                + Entrada
                <span className="block text-[11px] font-normal">suprimento / troco</span>
              </button>
              <button
                type="button"
                onClick={() => setTipo("sangria")}
                className={`flex-1 rounded-xl border-2 px-3 py-3 text-sm font-semibold ${!entrada ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
              >
                − Saída
                <span className="block text-[11px] font-normal">sangria / pagamento</span>
              </button>
            </div>

            {/* key: troca o formulário ao mudar o tipo, pra não levar o valor digitado junto */}
            <form key={tipo} action={entrada ? suprimento : sangria} onSubmit={() => setAberto(false)} className="space-y-3">
              <input type="hidden" name="caixa_id" value={caixaId} />
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Valor (R$)</label>
                <input name="valor" inputMode="decimal" placeholder="0,00" autoFocus className={`${inputCls} w-full text-lg`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Motivo</label>
                <input
                  name="descricao"
                  placeholder={entrada ? "Reforço de troco" : "Retirada / pagamento"}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
                  Cancelar
                </button>
                <button
                  className={`rounded-lg px-5 py-2 text-sm font-semibold text-white ${entrada ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
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
