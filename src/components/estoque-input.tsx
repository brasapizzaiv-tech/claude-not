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

const boxCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-right text-base text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

// Campo de estoque com CAIXAS separadas (um por local/lugar) que somam,
// mais uma calculadora. O total vai num input escondido (name) para salvar.
// Pode ser CONTROLADO de fora (caixas + onCaixasChange): assim o valor vive no
// pai e NÃO se perde quando o campo sai da tela (ex.: filtro de busca).
export function EstoqueInput({
  name,
  defaultValue,
  disabled,
  caixas: caixasProp,
  onCaixasChange,
}: {
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  caixas?: string[];
  onCaixasChange?: (caixas: string[]) => void;
}) {
  const [caixasInterno, setCaixasInterno] = useState<string[]>([defaultValue ?? ""]);
  const controlado = caixasProp !== undefined;
  const caixas = controlado ? (caixasProp.length ? caixasProp : [""]) : caixasInterno;
  const setCaixas = (fn: (cs: string[]) => string[]) => {
    if (controlado) onCaixasChange?.(fn(caixas));
    else setCaixasInterno(fn);
  };
  const [calc, setCalc] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const total = Math.round(caixas.reduce((s, b) => s + calcular(b), 0) * 1000) / 1000;

  const setCaixa = (i: number, v: string) =>
    setCaixas((cs) => cs.map((c, idx) => (idx === i ? v : c)));
  const addCaixa = () => setCaixas((cs) => [...cs, ""]);
  const remCaixa = (i: number) =>
    setCaixas((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));
  const tecla = (t: string) => {
    if (t === "C") return setCaixa(ativo, "");
    setCaixas((cs) => cs.map((c, idx) => (idx === ativo ? c + (MAPA[t] ?? t) : c)));
  };

  return (
    <div>
      {/* total (salvo) */}
      <input type="hidden" name={name} value={String(total)} readOnly />

      <div className="space-y-2">
        {caixas.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={c}
              onChange={(e) => setCaixa(i, e.target.value)}
              onFocus={() => setAtivo(i)}
              inputMode="decimal"
              disabled={disabled}
              placeholder={caixas.length > 1 ? `lugar ${i + 1}` : "0"}
              className={boxCls}
            />
            {caixas.length > 1 && !disabled && (
              <button
                type="button"
                onClick={() => remCaixa(i)}
                title="Remover caixa"
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-zinc-400 hover:text-red-600 dark:border-zinc-700"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={addCaixa}
          disabled={disabled}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-orange-950"
        >
          + caixa
        </button>
        <button
          type="button"
          onClick={() => setCalc((v) => !v)}
          disabled={disabled}
          title="Calculadora"
          className={`rounded-lg border px-3 py-1.5 text-base disabled:opacity-60 ${
            calc
              ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          }`}
        >
          🧮
        </button>
        {caixas.length > 1 && (
          <span className="ml-auto text-sm text-zinc-500">
            Total: <b className="text-zinc-800 dark:text-zinc-200">{total}</b>
          </span>
        )}
      </div>

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
