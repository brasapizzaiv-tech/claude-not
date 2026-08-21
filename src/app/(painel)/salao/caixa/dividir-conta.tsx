"use client";

import { useState, useTransition } from "react";
import { pagarLinhas } from "../actions";
import type { Comanda } from "./receber";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(".", "").replace(",", ".")) || 0;

type Linha = { key: string; tipo: "item" | "buffet"; id: string | null; nome: string; valor: number };

export function DividirConta({
  comanda,
  formas,
  servPercent,
  onClose,
}: {
  comanda: Comanda;
  formas: string[];
  servPercent: number;
  onClose: () => void;
}) {
  const fator = 1 + servPercent / 100;
  const iniciais: Linha[] = [
    ...comanda.itens
      .filter((i) => !i.pago)
      .map((i) => ({
        key: i.id,
        tipo: "item" as const,
        id: i.id,
        nome: `${i.qtd}× ${i.nome}`,
        valor: Math.round(i.qtd * i.preco * fator * 100) / 100,
      })),
    ...(comanda.buffet > 0 && !comanda.buffetPago
      ? [{
          key: "buffet",
          tipo: "buffet" as const,
          id: null,
          nome: "Buffet",
          valor: Math.round(comanda.buffet * fator * 100) / 100,
        }]
      : []),
  ];

  const [linhas, setLinhas] = useState<Linha[]>(iniciais);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [formaSel, setFormaSel] = useState("");
  const [recebido, setRecebido] = useState("");
  const [proc, start] = useTransition();

  function toggle(key: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const selLinhas = linhas.filter((l) => sel.has(l.key));
  const somaSel = Math.round(selLinhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const restante = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const troco = formaSel === "Dinheiro" && recebido ? num(recebido) - somaSel : 0;
  const podeReceber = sel.size > 0 && !!formaSel && (formaSel !== "Dinheiro" || num(recebido) >= somaSel - 0.01);

  function receber() {
    if (!podeReceber) return;
    const itemIds = selLinhas.filter((l) => l.tipo === "item").map((l) => l.id!) as string[];
    const incluirBuffet = selLinhas.some((l) => l.tipo === "buffet");
    const chaves = new Set(selLinhas.map((l) => l.key));
    start(async () => {
      await pagarLinhas(comanda.id, itemIds, incluirBuffet, [{ forma: formaSel, valor: somaSel }]);
      const resto = linhas.filter((l) => !chaves.has(l.key));
      setLinhas(resto);
      setSel(new Set());
      setFormaSel("");
      setRecebido("");
      if (resto.length === 0) onClose();
    });
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            Dividir conta — Nº {comanda.numero}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Marque os itens de cada pessoa e receba. O que sobrar fica em aberto para pagar depois.
        </p>

        {linhas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-emerald-600 dark:border-zinc-700">
            ✓ Tudo pago!
          </p>
        ) : (
          <>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              {linhas.map((l) => (
                <label
                  key={l.key}
                  className={`flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-800 ${
                    sel.has(l.key) ? "bg-orange-50 dark:bg-orange-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  <input type="checkbox" checked={sel.has(l.key)} onChange={() => toggle(l.key)} />
                  <span className="flex-1 text-zinc-800 dark:text-zinc-200">{l.nome}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{brl(l.valor)}</span>
                </label>
              ))}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">
                Selecionado ({sel.size}) · falta {brl(restante)}
              </span>
              <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{brl(somaSel)}</span>
            </div>

            {sel.size > 0 && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {formas.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormaSel(f)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        formaSel === f
                          ? "bg-orange-500 text-white"
                          : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {formaSel === "Dinheiro" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">Recebido</span>
                    <input
                      inputMode="decimal"
                      value={recebido}
                      onChange={(e) => setRecebido(e.target.value)}
                      placeholder={brl(somaSel)}
                      className={`${inputCls} w-28 text-right`}
                    />
                  </div>
                )}
                {troco > 0.005 && (
                  <p className="text-right text-sm font-medium text-emerald-600">Troco: {brl(troco)}</p>
                )}
                <button
                  onClick={receber}
                  disabled={proc || !podeReceber}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {proc ? "Recebendo..." : `Receber ${brl(somaSel)}`}
                </button>
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-zinc-600">
          Fechar
        </button>
      </div>
    </div>
  );
}
