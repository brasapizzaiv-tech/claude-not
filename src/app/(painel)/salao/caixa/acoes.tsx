"use client";

import { suprimento, sangria } from "../actions";

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CaixaAcoes({ caixaId }: { caixaId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <details className="group">
        <summary className="cursor-pointer list-none rounded-lg border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950">
          + Suprimento
        </summary>
        <form action={suprimento} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <input type="hidden" name="caixa_id" value={caixaId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Valor (R$)</label>
            <input name="valor" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-28`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Motivo</label>
            <input name="descricao" placeholder="Reforço de troco" className={`${inputCls} w-48`} />
          </div>
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Lançar
          </button>
        </form>
      </details>

      <details className="group">
        <summary className="cursor-pointer list-none rounded-lg border border-red-500 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          − Sangria
        </summary>
        <form action={sangria} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <input type="hidden" name="caixa_id" value={caixaId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Valor (R$)</label>
            <input name="valor" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-28`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Motivo</label>
            <input name="descricao" placeholder="Retirada / pagamento" className={`${inputCls} w-48`} />
          </div>
          <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Lançar
          </button>
        </form>
      </details>
    </div>
  );
}
