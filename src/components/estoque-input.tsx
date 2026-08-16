"use client";

import { useState } from "react";

// Soma valores separados por "+" (ex.: "12+8" = 20). Aceita vírgula decimal.
export function somarEstoque(raw: string): number {
  return (raw || "")
    .split("+")
    .reduce((s, x) => s + (Number(x.trim().replace(",", ".")) || 0), 0);
}

// Campo de estoque que aceita vários valores somados (um por local de estoque).
// O valor "cru" (ex.: "12+8") continua no input pelo `name`; mostra o total ao vivo.
export function EstoqueInput({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(defaultValue ?? "");
  const temSoma = raw.includes("+");
  const total = somarEstoque(raw);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          name={name}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          inputMode="decimal"
          disabled={disabled}
          placeholder="0"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-right text-base text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => setRaw((r) => (r.trim() ? r.trim() + "+" : r))}
          disabled={disabled}
          title="Somar outro estoque (outro local)"
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-lg font-bold text-orange-600 hover:bg-orange-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-orange-950"
        >
          +
        </button>
      </div>
      {temSoma && (
        <p className="mt-1 text-right text-xs text-zinc-500">
          = <b className="text-zinc-800 dark:text-zinc-200">{total}</b> no total
        </p>
      )}
    </div>
  );
}
