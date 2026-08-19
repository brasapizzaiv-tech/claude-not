"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { calcFechamento, moedaNum } from "@/lib/caixa";
import { salvarFechamento, type EntradaFechamento } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type MoneyKey =
  | "venda_bruta"
  | "acrescimos"
  | "cancelados"
  | "descontos"
  | "fretes"
  | "fundo_caixa"
  | "recebimentos"
  | "creditos"
  | "pagamentos"
  | "fiado"
  | "quebra";

export function FechamentoForm({ inicial }: { inicial: EntradaFechamento }) {
  const [f, setF] = useState<EntradaFechamento>(inicial);
  const [proc, start] = useTransition();

  const set = (k: MoneyKey | "data" | "observacao", v: string) =>
    setF((s) => ({ ...s, [k]: v }));
  const setForma = (forma: string, k: "pedidos" | "valor", v: string) =>
    setF((s) => ({
      ...s,
      formas: s.formas.map((x) => (x.forma === forma ? { ...x, [k]: v } : x)),
    }));

  const d = {
    venda_bruta: moedaNum(f.venda_bruta),
    acrescimos: moedaNum(f.acrescimos),
    cancelados: moedaNum(f.cancelados),
    descontos: moedaNum(f.descontos),
    fretes: moedaNum(f.fretes),
    fundo_caixa: moedaNum(f.fundo_caixa),
    recebimentos: moedaNum(f.recebimentos),
    creditos: moedaNum(f.creditos),
    pagamentos: moedaNum(f.pagamentos),
    fiado: moedaNum(f.fiado),
    quebra: moedaNum(f.quebra),
    formas: f.formas.map((x) => ({
      forma: x.forma,
      pedidos: Math.round(moedaNum(x.pedidos)),
      valor: moedaNum(x.valor),
    })),
  };
  const c = calcFechamento(d);
  const difFormas = c.formas_total - c.total_pedidos;

  function money(label: string, k: MoneyKey, sinal?: "+" | "−") {
    return (
      <label className="block">
        <span className="mb-1 block text-xs text-zinc-500">
          {sinal && <span className="mr-1 font-bold">{sinal}</span>}
          {label}
        </span>
        <input
          inputMode="decimal"
          value={f[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder="0,00"
          className={`${campo} w-full text-right`}
        />
      </label>
    );
  }

  const linhaCalc = (label: string, valor: number, cor = "") => (
    <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <span className={`text-sm font-bold ${cor || "text-zinc-900 dark:text-zinc-50"}`}>
        {moeda(valor)}
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <Link href="/financeiro/caixa" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Fechamentos de caixa
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {inicial.id ? "Editar fechamento" : "Novo fechamento de caixa"}
      </h1>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Data</span>
          <input
            type="date"
            value={f.data}
            onChange={(e) => set("data", e.target.value)}
            className={campo}
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs text-zinc-500">Observação</span>
          <input
            value={f.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            placeholder="opcional"
            className={`${campo} w-full`}
          />
        </label>
      </div>

      {/* Detalhes do caixa */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Detalhes do caixa
      </h2>
      <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {money("Venda bruta", "venda_bruta", "+")}
          {money("Acréscimos", "acrescimos", "+")}
          {money("Cancelados", "cancelados", "−")}
          {money("Descontos", "descontos", "−")}
        </div>
        {linhaCalc("= Venda líquida", c.venda_liquida)}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {money("Fretes", "fretes", "+")}
        </div>
        {linhaCalc("= Total pedidos", c.total_pedidos, "text-orange-600")}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {money("Fundo de caixa", "fundo_caixa", "+")}
          {money("Recebimentos", "recebimentos", "+")}
          {money("Créditos", "creditos", "+")}
          {money("Pagamentos", "pagamentos", "−")}
          {money("Fiado", "fiado", "−")}
          {money("Quebra", "quebra", "−")}
        </div>
        {linhaCalc(
          "= Saldo final",
          c.saldo_final,
          c.saldo_final >= 0 ? "text-green-600" : "text-red-600",
        )}
      </div>

      {/* Formas de pagamento */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Por forma de pagamento
      </h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2">Forma</th>
              <th className="px-4 py-2 text-right">Pedidos</th>
              <th className="px-4 py-2 text-right">Valor (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {f.formas.map((x) => (
              <tr key={x.forma} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                  {x.forma}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    inputMode="numeric"
                    value={x.pedidos}
                    onChange={(e) => setForma(x.forma, "pedidos", e.target.value)}
                    placeholder="0"
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    inputMode="decimal"
                    value={x.valor}
                    onChange={(e) => setForma(x.forma, "valor", e.target.value)}
                    placeholder="0,00"
                    className="w-28 rounded border border-zinc-300 bg-white px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-zinc-50 dark:bg-zinc-900">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 text-right font-semibold">{c.pedidos_total}</td>
              <td className="px-4 py-2 text-right font-semibold">{moeda(c.formas_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {Math.abs(difFormas) > 0.01 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          A soma das formas ({moeda(c.formas_total)}) está {moeda(Math.abs(difFormas))}{" "}
          {difFormas > 0 ? "acima" : "abaixo"} do Total pedidos ({moeda(c.total_pedidos)}).
          Confira os valores.
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => start(async () => { await salvarFechamento(f); })}
          disabled={proc || !f.data}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {proc ? "Salvando..." : "Salvar fechamento"}
        </button>
        <Link href="/financeiro/caixa" className="text-sm text-zinc-500 hover:text-zinc-700">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
