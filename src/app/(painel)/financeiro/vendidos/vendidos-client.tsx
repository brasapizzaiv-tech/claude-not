"use client";
import { Icone } from "@/components/icone";

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
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${ROTULO[agrupar].toLowerCase()}…`} className="w-64 rounded-controle border border-borda-forte bg-painel-cartao px-3 py-1.5 text-sm" />
        <div className="flex items-center gap-3 text-sm text-texto-suave">
          <span>{lista.length} {lista.length === 1 ? "registro" : "registros"}</span>
          <button onClick={exportar} className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"><Icone nome="baixar" tamanho={14} className="mr-1.5" /> Exportar (planilha)</button>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-cartao bg-painel-cartao p-8 text-center text-sm text-texto-suave">Nada vendido nesse período com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                {th("nome", ROTULO[agrupar])}
                {agrupar === "produto" && <th className="px-3 py-2">Categoria</th>}
                {th("qtd", "Quantidade", "text-right")}
                {th("valor", "Valor total", "text-right")}
                <th className="px-3 py-2 text-right">% do total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map((l) => {
                const pct = total > 0 ? (l.valor / total) * 100 : 0;
                return (
                  <tr key={l.nome} className="">
                    <td className="px-3 py-2 font-medium text-texto">{l.nome}</td>
                    {agrupar === "produto" && <td className="px-3 py-2 text-texto-suave">{l.categoria}</td>}
                    <td className="px-3 py-2 text-right">{l.qtd.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right font-medium">{brl(l.valor)}{l.pagos < l.valor - 0.005 && <span className="ml-1 text-[11px] text-amber-600" title="parte ainda em aberto">({brl(l.pagos)} pago)</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded bg-superficie-suave"><div className="h-full bg-orange-400" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        <span className="w-12 text-texto-suave">{pct.toFixed(1).replace(".", ",")}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-superficie-suave text-sm font-semibold">
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
