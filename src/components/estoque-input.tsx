"use client";

import { useState } from "react";

// Calcula uma expressão simples (+ - * /), aceitando vírgula decimal.
// Só permite números e operadores — nada de código.
export function calcular(raw: string): number {
  const s = (raw || "").replace(/,/g, ".").replace(/[^0-9.+\-*/() ]/g, "").trim();
  if (!s) return 0;
  try {
    const v = Function(`"use strict";return (${s})`)() as unknown;
    return typeof v === "number" && isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
  } catch {
    return 0;
  }
}

const TECLAS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "C", "0", ".", "+"];
const MAPA: Record<string, string> = { "÷": "/", "×": "*", "−": "-" };

// Campo de estoque com soma de vários locais e calculadora.
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
  const [calc, setCalc] = useState(false);
  const temConta = /[+\-*/]/.test(raw);
  const total = calcular(raw);

  const tecla = (t: string) => {
    if (t === "C") return setRaw("");
    setRaw((r) => r + (MAPA[t] ?? t));
  };

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
        <button
          type="button"
          onClick={() => setCalc((v) => !v)}
          disabled={disabled}
          title="Calculadora"
          className={`shrink-0 rounded-lg border px-3 py-2 text-lg disabled:opacity-60 ${
            calc
              ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          }`}
        >
          🧮
        </button>
      </div>

      {temConta && (
        <p className="mt-1 text-right text-xs text-zinc-500">
          = <b className="text-zinc-800 dark:text-zinc-200">{total}</b> no total
        </p>
      )}

      {calc && !disabled && (
        <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
          {TECLAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => tecla(t)}
              className={`rounded-lg py-3 text-lg font-medium ${
                t === "C"
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "÷×−+".includes(t)
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                    : "bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
