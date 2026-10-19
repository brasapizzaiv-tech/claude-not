"use client";
import { Icone } from "@/components/icone";

import { useState } from "react";
import { ONDES, ONDE_ROTULO, type Onde } from "@/lib/contagem-parcelas";

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

// Uma CAIXA do campo: o número digitado, onde aquela parte está (congelado,
// resfriado, ambiente — ou sem dizer) e, se veio de uma etiqueta lida, qual.
export type Caixa = { v: string; onde: Onde | null; etiqueta?: { id: string; numero: number } | null };

// Aceita o formato antigo (só o texto) e o novo.
export function normalizarCaixas(cs?: (string | Caixa)[] | null): Caixa[] {
  if (!cs || cs.length === 0) return [{ v: "", onde: null }];
  return cs.map((c) => (typeof c === "string" ? { v: c, onde: null } : { v: c.v ?? "", onde: c.onde ?? null, etiqueta: c.etiqueta ?? null }));
}

// Resultado com vírgula, sem zeros sobrando (61 · 2,5 · 0,333).
const formatar = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

const TECLAS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "C", "0", ".", "+"];
const MAPA: Record<string, string> = { "÷": "/", "×": "*", "−": "-" };

const boxCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-right text-base text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

// Campo de estoque com CAIXAS separadas (um por local/lugar) que somam,
// mais uma calculadora. O total vai num input escondido (name) para salvar.
// Pode ser CONTROLADO de fora (caixas + onCaixasChange): assim o valor vive no
// pai e NÃO se perde quando o campo sai da tela (ex.: filtro de busca).
// Com `comLocal`, cada caixa ganha o "onde" (congelado/resfriado/ambiente).
export function EstoqueInput({
  name,
  defaultValue,
  disabled,
  caixas: caixasProp,
  onCaixasChange,
  comLocal,
}: {
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  caixas?: (string | Caixa)[];
  onCaixasChange?: (caixas: Caixa[]) => void;
  comLocal?: boolean;
}) {
  const [caixasInterno, setCaixasInterno] = useState<Caixa[]>([{ v: defaultValue ?? "", onde: null }]);
  const controlado = caixasProp !== undefined;
  const caixas = controlado ? normalizarCaixas(caixasProp) : caixasInterno;
  const setCaixas = (fn: (cs: Caixa[]) => Caixa[]) => {
    if (controlado) onCaixasChange?.(fn(caixas));
    else setCaixasInterno(fn);
  };
  const [calc, setCalc] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const total = Math.round(caixas.reduce((s, b) => s + calcular(b.v), 0) * 1000) / 1000;

  const setCaixa = (i: number, patch: Partial<Caixa>) =>
    setCaixas((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCaixa = () => setCaixas((cs) => [...cs, { v: "", onde: null }]);
  const remCaixa = (i: number) =>
    setCaixas((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));
  const tecla = (t: string) => {
    if (t === "C") return setCaixa(ativo, { v: "" });
    // "=": a conta vira o resultado (48+12+1 → 61), que é o que fica no campo.
    if (t === "=") {
      const atual = caixas[ativo]?.v ?? "";
      return setCaixa(ativo, { v: atual.trim() ? formatar(calcular(atual)) : "" });
    }
    if (t === "⌫") return setCaixas((cs) => cs.map((c, idx) => (idx === ativo ? { ...c, v: c.v.slice(0, -1) } : c)));
    setCaixas((cs) => cs.map((c, idx) => (idx === ativo ? { ...c, v: c.v + (MAPA[t] ?? t) } : c)));
  };
  // Tem conta no campo (não só um número)? Mostra o resultado embaixo.
  const temConta = (v: string) => /[0-9.,]\s*[-+*/]\s*[0-9.,(]/.test(v);
  function abrirCalc() {
    // Fecha o teclado do celular: com a calculadora aberta ele só atrapalha.
    if (!calc && typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
    setCalc((v) => !v);
  }

  return (
    <div>
      {/* total (salvo) */}
      <input type="hidden" name={name} value={String(total)} readOnly />

      <div className="space-y-2">
        {caixas.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            {/* Veio de uma etiqueta lida: mostra o número; o valor pode ser corrigido. */}
            {c.etiqueta && (
              <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-1 text-mini font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" title="Lido da etiqueta">
                nº {c.etiqueta.numero}
              </span>
            )}
            <input
              value={c.v}
              onChange={(e) => setCaixa(i, { v: e.target.value })}
              onFocus={() => setAtivo(i)}
              // Calculadora aberta: o teclado do celular não abre por cima dela.
              inputMode={calc ? "none" : "decimal"}
              readOnly={calc}
              onClick={() => setAtivo(i)}
              disabled={disabled}
              placeholder={caixas.length > 1 ? `lugar ${i + 1}` : "0"}
              className={boxCls}
            />
            {comLocal && (
              <select
                value={c.onde ?? ""}
                onChange={(e) => setCaixa(i, { onde: (e.target.value || null) as Onde | null })}
                disabled={disabled}
                title="Onde essa parte está"
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">onde?</option>
                {ONDES.map((o) => <option key={o} value={o}>{ONDE_ROTULO[o]}</option>)}
              </select>
            )}
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
          onClick={abrirCalc}
          disabled={disabled}
          title="Calculadora"
          className={`rounded-lg border px-3 py-1.5 text-base disabled:opacity-60 ${
            calc
              ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
              : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          }`}
        >
          <Icone nome="calculadora" tamanho={16} titulo="Somar" />
        </button>
        {caixas.length > 1 && (
          <span className="ml-auto text-sm text-zinc-500">
            Total: <b className="text-zinc-800 dark:text-zinc-200">{total}</b>
          </span>
        )}
      </div>

      {calc && caixas.some((c) => temConta(c.v)) && (
        <p className="mt-1 text-right text-sm text-zinc-500">
          = <b className="text-zinc-800 dark:text-zinc-200">{formatar(calcular(caixas[ativo]?.v ?? ""))}</b>
          <span className="ml-1 text-xs">(toque em = pra ficar só o resultado)</span>
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
          <button type="button" onClick={() => tecla("⌫")} aria-label="Apagar o último" className="rounded-lg bg-white py-3 text-lg font-medium text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">⌫</button>
          <button type="button" onClick={() => tecla("=")} className="col-span-3 rounded-lg bg-orange-500 py-3 text-lg font-bold text-marca-sobre-primaria">=</button>
        </div>
      )}
    </div>
  );
}
