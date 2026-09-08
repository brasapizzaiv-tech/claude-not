"use client";

import { useMemo, useState } from "react";

export type Agrupar = "produto" | "categoria" | "turno" | "forma" | "garcom" | "origem";
export type Linha = { nome: string; categoria: string; qtd: number; valor: number; pagos: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ROTULO: Record<Agrupar, string> = { produto: "Produto", categoria: "Categoria", turno: "Turno", forma: "Forma de pagamento", garcom: "Garçom", origem: "Origem" };

export function VendidosClient({ linhas, total, agrupar, periodo }: { linhas: Linha[]; total: number; agrupar: Agrupar; periodo: string }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"valor" | "qtd" | "nome">("valor");
  const [desc, setDesc] = useState(true);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const f = linhas.filter((l) => !q || l.nome.toLowerCase().includes(q) || l.categoria.toLowerCase().includes(q));
    const s = [...f].sort((a, b) => {
      const d = ordem === "nome" ? a.nome.localeCompare(b.nome) : ordem === "qtd" ? a.qtd - b.qtd : a.valor - b.valor;
      return desc ? -d : d;
    });
    return s;
  }, [linhas, busca, ordem, desc]);

  function exportar() {
    const cab = [ROTULO[agrupar], agrupar === "produto" ? "Categoria" : "", "Quantidade", "Valor total", "% do total", "Pago"].filter((_, i) => i !== 1 || agrupar === "produto");
    const rows = lista.map((l) => {
      const r = [l.nome, l.categoria, String(l.qtd).replace(".", ","), l.valor.toFixed(2).replace(".", ","), total > 0 ? ((l.valor / total) * 100).toFixed(1).replace(".", ",") + "%" : "", l.pagos.toFixed(2).replace(".", ",")];
      return (agrupar === "produto" ? r : r.filter((_, i) => i !== 1)).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });
    const csv = "﻿" + [cab.join(";"), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `produtos-vendidos-${periodo.replace(/ /g, "")}.csv`;
    a.click();
  }

  const th = (k: "valor" | "qtd" | "nome", label: string, cls = "") => (
    <th className={`cursor-pointer select-none px-3 py-2 ${cls}`} onClick={() => { if (ordem === k) setDesc(!desc); else { setOrdem(k); setDesc(k !== "nome"); } }}>
      {label} {ordem === k ? (desc ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${ROTULO[agrupar].toLowerCase()}…`} className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{lista.length} {lista.length === 1 ? "registro" : "registros"}</span>
          <button onClick={exportar} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200">⬇ Exportar (planilha)</button>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">Nada vendido nesse período com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                {th("nome", ROTULO[agrupar])}
                {agrupar === "produto" && <th className="px-3 py-2">Categoria</th>}
                {th("qtd", "Quantidade", "text-right")}
                {th("valor", "Valor total", "text-right")}
                <th className="px-3 py-2 text-right">% do total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((l) => {
                const pct = total > 0 ? (l.valor / total) * 100 : 0;
                return (
                  <tr key={l.nome} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{l.nome}</td>
                    {agrupar === "produto" && <td className="px-3 py-2 text-zinc-500">{l.categoria}</td>}
                    <td className="px-3 py-2 text-right">{l.qtd.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right font-medium">{brl(l.valor)}{l.pagos < l.valor - 0.005 && <span className="ml-1 text-[11px] text-amber-600" title="parte ainda em aberto">({brl(l.pagos)} pago)</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"><div className="h-full bg-orange-400" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        <span className="w-12 text-zinc-500">{pct.toFixed(1).replace(".", ",")}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-900">
              <tr>
                <td className="px-3 py-2" colSpan={agrupar === "produto" ? 2 : 1}>Total</td>
                <td className="px-3 py-2 text-right">{lista.reduce((s, l) => s + l.qtd, 0).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right">{brl(lista.reduce((s, l) => s + l.valor, 0))}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
