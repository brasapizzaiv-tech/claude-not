"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { calcFechamento, moedaNum } from "@/lib/caixa";
import { salvarFechamento, type EntradaFechamento } from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo =
  "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

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
        <span className="mb-1 block text-xs text-texto-suave">
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
    <div className="flex items-center justify-between rounded-controle bg-superficie-suave px-3 py-2">
      <span className="text-sm font-medium text-texto-suave">{label}</span>
      <span className={`text-sm font-bold ${cor || "text-texto"}`}>
        {moeda(valor)}
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <Link href="/financeiro/caixa" className="text-sm text-texto-suave hover:text-orange-600">
        ← Fechamentos de caixa
      </Link>
      <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">
        {inicial.id ? "Editar fechamento" : "Novo fechamento de caixa"}
      </h1>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-texto-suave">Data</span>
          <input
            type="date"
            value={f.data}
            onChange={(e) => set("data", e.target.value)}
            className={campo}
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs text-texto-suave">Observação</span>
          <input
            value={f.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            placeholder="opcional"
            className={`${campo} w-full`}
          />
        </label>
      </div>

      {/* Detalhes do caixa */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-texto-suave">
        Detalhes do caixa
      </h2>
      <div className="space-y-3 rounded-cartao border border-borda p-4">
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
      <h2 className="mt-6 mb-2 text-sm font-semibold text-texto-suave">
        Por forma de pagamento
      </h2>
      <div className="overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="bg-superficie-suave text-left text-xs text-texto-fraco">
            <tr>
              <th className="px-4 py-2">Forma</th>
              <th className="px-4 py-2 text-right">Pedidos</th>
              <th className="px-4 py-2 text-right">Valor (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {f.formas.map((x) => (
              <tr key={x.forma} className="">
                <td className="px-4 py-2 font-medium text-texto">
                  {x.forma}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    inputMode="numeric"
                    value={x.pedidos}
                    onChange={(e) => setForma(x.forma, "pedidos", e.target.value)}
                    placeholder="0"
                    className="w-20 rounded border border-borda-forte bg-painel-cartao px-2 py-1 text-right dark:text-zinc-100"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    inputMode="decimal"
                    value={x.valor}
                    onChange={(e) => setForma(x.forma, "valor", e.target.value)}
                    placeholder="0,00"
                    className="w-28 rounded border border-borda-forte bg-painel-cartao px-2 py-1 text-right dark:text-zinc-100"
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-superficie-suave">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 text-right font-semibold">{c.pedidos_total}</td>
              <td className="px-4 py-2 text-right font-semibold">{moeda(c.formas_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {Math.abs(difFormas) > 0.01 && (
        <p className="mt-2 rounded-controle bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          A soma das formas ({moeda(c.formas_total)}) está {moeda(Math.abs(difFormas))}{" "}
          {difFormas > 0 ? "acima" : "abaixo"} do Total pedidos ({moeda(c.total_pedidos)}).
          Confira os valores.
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => start(async () => { await salvarFechamento(f); })}
          disabled={proc || !f.data}
          className="rounded-controle bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {proc ? "Salvando..." : "Salvar fechamento"}
        </button>
        <Link href="/financeiro/caixa" className="text-sm text-texto-suave hover:text-texto-suave">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
