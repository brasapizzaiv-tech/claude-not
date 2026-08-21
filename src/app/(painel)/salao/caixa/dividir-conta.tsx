"use client";

import { useState, useTransition } from "react";
import { pagarValores } from "../actions";
import type { Comanda } from "./receber";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(".", "").replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Linha = {
  key: string;
  tipo: "item" | "buffet";
  id: string | null;
  nome: string;
  restante: number; // quanto falta pagar desta linha (com serviço)
};

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
      .map((i) => ({
        key: i.id,
        tipo: "item" as const,
        id: i.id,
        nome: `${i.qtd}× ${i.nome}`,
        restante: r2(i.qtd * i.preco * fator - i.valorPago),
      }))
      .filter((l) => l.restante > 0.005),
    ...(comanda.buffet > 0 && r2(comanda.buffet * fator - comanda.buffetValorPago) > 0.005
      ? [{
          key: "buffet",
          tipo: "buffet" as const,
          id: null,
          nome: "Buffet",
          restante: r2(comanda.buffet * fator - comanda.buffetValorPago),
        }]
      : []),
  ];

  const [linhas, setLinhas] = useState<Linha[]>(iniciais);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pagarDe, setPagarDe] = useState<Record<string, string>>({}); // valor a pagar por linha
  const [formaSel, setFormaSel] = useState("");
  const [recebido, setRecebido] = useState("");
  const [proc, start] = useTransition();

  function toggle(l: Linha) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(l.key)) n.delete(l.key);
      else n.add(l.key);
      return n;
    });
    setPagarDe((p) => (p[l.key] ? p : { ...p, [l.key]: String(l.restante).replace(".", ",") }));
  }
  // "½" — paga metade do que falta desta linha (rachar item).
  function metade(l: Linha) {
    setSel((s) => new Set(s).add(l.key));
    setPagarDe((p) => ({ ...p, [l.key]: String(r2(l.restante / 2)).replace(".", ",") }));
  }

  const selLinhas = linhas.filter((l) => sel.has(l.key));
  const valorDe = (l: Linha) => Math.min(l.restante, num(pagarDe[l.key] ?? ""));
  const somaSel = r2(selLinhas.reduce((s, l) => s + valorDe(l), 0));
  const restanteTotal = r2(linhas.reduce((s, l) => s + l.restante, 0));
  const troco = formaSel === "Dinheiro" && recebido ? num(recebido) - somaSel : 0;
  const podeReceber =
    somaSel > 0.005 && !!formaSel && (formaSel !== "Dinheiro" || num(recebido) >= somaSel - 0.01);

  function receber() {
    if (!podeReceber) return;
    const itensPag = selLinhas
      .filter((l) => l.tipo === "item" && valorDe(l) > 0)
      .map((l) => ({ id: l.id!, valor: valorDe(l) }));
    const buffetSel = selLinhas.find((l) => l.tipo === "buffet");
    const buffetValor = buffetSel ? valorDe(buffetSel) : 0;
    start(async () => {
      await pagarValores(comanda.id, itensPag, buffetValor, [{ forma: formaSel, valor: somaSel }]);
      // Abate o que foi pago de cada linha; remove as quitadas.
      const novas = linhas
        .map((l) => (sel.has(l.key) ? { ...l, restante: r2(l.restante - valorDe(l)) } : l))
        .filter((l) => l.restante > 0.005);
      setLinhas(novas);
      setSel(new Set());
      setPagarDe({});
      setFormaSel("");
      setRecebido("");
      if (novas.length === 0) onClose();
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
          Marque os itens de cada pessoa e receba. Use <b>½</b> para rachar um item. O que sobrar
          fica em aberto.
        </p>

        {linhas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-emerald-600 dark:border-zinc-700">
            ✓ Tudo pago!
          </p>
        ) : (
          <>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              {linhas.map((l) => (
                <div
                  key={l.key}
                  className={`flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-800 ${
                    sel.has(l.key) ? "bg-orange-50 dark:bg-orange-950/20" : ""
                  }`}
                >
                  <input type="checkbox" checked={sel.has(l.key)} onChange={() => toggle(l)} />
                  <span className="flex-1 text-zinc-800 dark:text-zinc-200">{l.nome}</span>
                  {sel.has(l.key) ? (
                    <input
                      inputMode="decimal"
                      value={pagarDe[l.key] ?? ""}
                      onChange={(e) => setPagarDe((p) => ({ ...p, [l.key]: e.target.value }))}
                      className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  ) : (
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{brl(l.restante)}</span>
                  )}
                  <button
                    onClick={() => metade(l)}
                    title="Rachar: pagar metade desta linha"
                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    ½
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">falta {brl(restanteTotal)}</span>
              <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{brl(somaSel)}</span>
            </div>

            {somaSel > 0.005 && (
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
