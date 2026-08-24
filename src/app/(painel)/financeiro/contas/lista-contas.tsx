"use client";

import { useMemo, useState } from "react";
import { dataBR } from "@/lib/format";
import { alternarPago } from "../actions";
import type { LinhaConta } from "./consulta";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function Linhas({
  itens,
  mostrarPago,
  hojeBR,
}: {
  itens: LinhaConta[];
  mostrarPago?: boolean;
  hojeBR: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((l) => (
            <tr key={l.id} className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-2">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {l.descricao ?? l.fornecedores?.nome ?? "Despesa"}
                </div>
                <div className="text-xs text-zinc-400">
                  {l.dre_categorias?.nome ?? ""}
                  {l.vencimento ? ` · vence ${dataBR(l.vencimento)}` : ""}
                  {l.banco ? ` · ${l.banco}` : ""}
                  {l.forma_pagamento ? ` · ${l.forma_pagamento}` : ""}
                  {mostrarPago && l.pago_em ? ` · pago ${dataBR(l.pago_em)}` : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                {moeda(Number(l.valor))}
              </td>
              <td className="px-4 py-2 text-right">
                <form action={alternarPago} className="inline-flex items-center gap-1.5">
                  <input type="hidden" name="ids" value={(l.ids ?? [l.id]).join(",")} />
                  <input type="hidden" name="pago" value={l.pago ? "false" : "true"} />
                  {!l.pago && (
                    <input
                      type="date"
                      name="data_pago"
                      defaultValue={hojeBR}
                      title="Data do pagamento (padrão: hoje)"
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-green-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    />
                  )}
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      l.pago
                        ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {l.pago ? "Reabrir" : "Pagar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListaContasView({
  linhas,
  aberto,
}: {
  linhas: LinhaConta[];
  aberto: boolean;
}) {
  const [busca, setBusca] = useState("");
  const hojeBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        norm(l.descricao ?? "").includes(q) ||
        norm(l.fornecedores?.nome ?? "").includes(q) ||
        norm(l.dre_categorias?.nome ?? "").includes(q),
    );
  }, [busca, linhas]);

  const baldes = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const em7 = new Date(new Date().getTime() + 7 * 864e5).toISOString().slice(0, 10);
    const b = [
      { nome: "Vencidas", cor: "text-red-600", itens: [] as LinhaConta[] },
      { nome: "Próximos 7 dias", cor: "text-amber-600", itens: [] as LinhaConta[] },
      { nome: "A vencer", cor: "text-zinc-500", itens: [] as LinhaConta[] },
      { nome: "Sem vencimento", cor: "text-zinc-400", itens: [] as LinhaConta[] },
    ];
    if (aberto)
      for (const l of filtradas) {
        if (!l.vencimento) b[3].itens.push(l);
        else if (l.vencimento < hoje) b[0].itens.push(l);
        else if (l.vencimento <= em7) b[1].itens.push(l);
        else b[2].itens.push(l);
      }
    return b;
  }, [filtradas, aberto]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar conta por descrição, fornecedor ou categoria..."
          className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="text-xs text-zinc-400 hover:text-orange-600"
          >
            limpar
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-400">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          {busca ? (
            <>
              Nenhuma conta encontrada para <b>{busca}</b>.
            </>
          ) : (
            "Nenhuma conta com esses filtros."
          )}
        </div>
      ) : aberto ? (
        <div className="space-y-6">
          {baldes
            .filter((b) => b.itens.length > 0)
            .map((b) => {
              const soma = b.itens.reduce((s, l) => s + Number(l.valor), 0);
              return (
                <div key={b.nome}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className={`text-sm font-semibold ${b.cor}`}>{b.nome}</h2>
                    <span className="text-sm font-medium text-zinc-500">{moeda(soma)}</span>
                  </div>
                  <Linhas itens={b.itens} hojeBR={hojeBR} />
                </div>
              );
            })}
        </div>
      ) : (
        <Linhas itens={filtradas} mostrarPago hojeBR={hojeBR} />
      )}
    </div>
  );
}
