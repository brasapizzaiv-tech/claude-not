"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dataBR } from "@/lib/format";
import { somarDias } from "@/lib/etiqueta-vencimentos";
import { tipoInfo } from "@/lib/etiqueta-tipos";
import { EtiquetaBaixa } from "./baixa";
import { excluirEtiqueta } from "./actions";

export type EtLinha = {
  id: string;
  numero: number;
  produto_nome: string;
  categoria_nome: string | null;
  colaborador_nome: string | null;
  validade: string | null;
  conservacao: string | null;
  quantidade: number | null;
  unidade: string | null;
  status: string;
  baixa_em: string | null;
  tipo: string | null;
  lote: string | null;
  manipulado_em: string;
};

const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function fmtHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ListaEtiquetas({ rows, hoje, historico }: { rows: EtLinha[]; hoje: string; historico: boolean }) {
  const [visao, setVisao] = useState<"lista" | "kanban">("lista");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    try {
      const v = localStorage.getItem("etq_visao");
      if (v === "kanban") setTimeout(() => setVisao("kanban"), 0);
    } catch {}
  }, []);
  const mudarVisao = (v: "lista" | "kanban") => {
    setVisao(v);
    try { localStorage.setItem("etq_visao", v); } catch {}
  };

  const cats = [...new Set(rows.map((r) => r.categoria_nome).filter((c): c is string => !!c))].sort();
  const q = busca.trim().toLowerCase();
  const lista = rows.filter(
    (r) =>
      (!cat || r.categoria_nome === cat) &&
      (!q ||
        String(r.numero).includes(q) ||
        r.produto_nome.toLowerCase().includes(q) ||
        (r.lote ?? "").toLowerCase().includes(q) ||
        (r.colaborador_nome ?? "").toLowerCase().includes(q)),
  );

  function exportar() {
    const cab = ["Nº", "Produto", "Categoria", "Tipo", "Conservação", "Qtd", "Unid", "Lote", "Responsável", "Manipulação", "Validade", "Status", "Baixa"];
    const linhas = lista.map((r) => [
      r.numero, r.produto_nome, r.categoria_nome ?? "", tipoInfo(r.tipo).titulo, r.conservacao ?? "", r.quantidade ?? "", r.unidade ?? "", r.lote ?? "",
      r.colaborador_nome ?? "", fmtHora(r.manipulado_em), r.validade ? dataBR(r.validade) : "", r.status, r.baixa_em ? fmtHora(r.baixa_em) : "",
    ]);
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `etiquetas-${hoje}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const corValidade = (v: string | null) =>
    !v ? "text-zinc-400" : v < hoje ? "text-red-600 font-semibold" : v <= somarDias(hoje, 2) ? "text-amber-600 font-medium" : "text-green-600";

  const badgeTipo = (t: string | null) =>
    t && t !== "manipulacao" ? (
      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {tipoInfo(t).icone} {tipoInfo(t).titulo}
      </span>
    ) : null;

  // Colunas do Kanban
  const colunas = historico
    ? [
        { key: "usada", titulo: "Usadas", cor: "border-emerald-400", f: (r: EtLinha) => r.status === "usada" },
        { key: "descartada", titulo: "Descartadas", cor: "border-zinc-400", f: (r: EtLinha) => r.status === "descartada" },
      ]
    : [
        { key: "vencidas", titulo: "Vencidas", cor: "border-red-600", f: (r: EtLinha) => !!r.validade && r.validade < hoje },
        { key: "hoje", titulo: "Hoje", cor: "border-red-400", f: (r: EtLinha) => r.validade === hoje },
        { key: "amanha", titulo: "Amanhã", cor: "border-amber-400", f: (r: EtLinha) => r.validade === somarDias(hoje, 1) },
        { key: "sete", titulo: "Em 7 dias", cor: "border-emerald-400", f: (r: EtLinha) => !!r.validade && r.validade > somarDias(hoje, 1) && r.validade <= somarDias(hoje, 7) },
        { key: "depois", titulo: "Depois", cor: "border-sky-400", f: (r: EtLinha) => !r.validade || r.validade > somarDias(hoje, 7) },
      ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {(["lista", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => mudarVisao(v)} className={`px-3 py-1.5 text-sm font-medium ${visao === v ? "bg-orange-500 text-white" : "text-zinc-600 dark:text-zinc-300"}`}>
              {v === "lista" ? "☰ Lista" : "▦ Kanban"}
            </button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Nº, produto, lote ou responsável" className={`${input} w-64`} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-zinc-500">{lista.length} / {rows.length}</span>
        <button onClick={exportar} disabled={lista.length === 0} className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
          ⬇ Exportar CSV
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          {historico ? "Nenhuma etiqueta baixada." : "Nenhuma etiqueta aqui."}
        </div>
      ) : visao === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-5">
          {colunas.map((c) => {
            const its = lista.filter(c.f);
            return (
              <div key={c.key} className={`rounded-2xl border-t-4 bg-zinc-50 p-2 dark:bg-zinc-900 ${c.cor}`}>
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  {c.titulo} <span className="rounded-full bg-white px-2 text-xs text-zinc-500 dark:bg-zinc-800">{its.length}</span>
                </div>
                <div className="space-y-2">
                  {its.map((r) => (
                    <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{r.produto_nome}{badgeTipo(r.tipo)}</div>
                      <div className="text-xs text-zinc-400">
                        #{r.numero}{r.categoria_nome ? ` · ${r.categoria_nome}` : ""}{r.conservacao ? ` · ${r.conservacao}` : ""}
                        {r.quantidade != null ? ` · ${r.quantidade} ${r.unidade ?? ""}` : ""}
                      </div>
                      <div className={`mt-1 text-xs ${corValidade(r.validade)}`}>Val. {r.validade ? dataBR(r.validade) : "—"} · {r.colaborador_nome ?? "—"}</div>
                      <div className="mt-2 flex items-center gap-1 text-xs">
                        <Link href={`/etiquetas/${r.id}`} className="mr-2 text-orange-600 hover:underline">Imprimir</Link>
                        <EtiquetaBaixa id={r.id} status={r.status} />
                      </div>
                    </div>
                  ))}
                  {its.length === 0 && <p className="px-1 text-xs text-zinc-400">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-3">Nº</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Responsável</th>
                <th className="px-3 py-3">Manipulação</th>
                <th className="px-3 py-3">Validade</th>
                <th className="px-3 py-3">{historico ? "Baixa" : ""}</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-mono text-zinc-500">#{r.numero}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{r.produto_nome}{badgeTipo(r.tipo)}</div>
                    <div className="text-xs text-zinc-400">
                      {r.conservacao ?? ""}{r.conservacao && r.quantidade != null ? " · " : ""}{r.quantidade != null ? `${r.quantidade} ${r.unidade ?? ""}` : ""}
                      {r.lote ? ` · lote ${r.lote}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{r.categoria_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.colaborador_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{fmtHora(r.manipulado_em)}</td>
                  <td className={`px-3 py-2 ${corValidade(r.validade)}`}>
                    {r.validade ? dataBR(r.validade) : "—"}{!historico && r.validade && r.validade < hoje ? " ⚠" : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{historico ? `${r.status}${r.baixa_em ? " · " + fmtHora(r.baixa_em) : ""}` : ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/etiquetas/${r.id}`} className="mr-3 text-orange-600 hover:underline">Imprimir</Link>
                    <EtiquetaBaixa id={r.id} status={r.status} />
                    <form action={excluirEtiqueta} className="ml-2 inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600">×</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
