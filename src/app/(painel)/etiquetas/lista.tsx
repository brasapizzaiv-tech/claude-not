"use client";

import { Icone } from "@/components/icone";

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
  "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

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
    !v ? "text-texto-fraco" : v < hoje ? "text-red-600 font-semibold" : v <= somarDias(hoje, 2) ? "text-amber-600 font-medium" : "text-green-600";

  const badgeTipo = (t: string | null) =>
    t && t !== "manipulacao" ? (
      <span className="ml-2 rounded bg-superficie-suave px-1.5 py-0.5 text-mini font-semibold text-texto-suave">
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
        <div className="flex overflow-hidden rounded-controle border border-borda-forte">
          {(["lista", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => mudarVisao(v)} className={`px-3 py-1.5 text-sm font-medium ${visao === v ? "bg-orange-500 text-white" : "text-texto-suave"}`}>
              {v === "lista" ? "☰ Lista" : "▦ Kanban"}
            </button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, produto, lote ou responsável" className={`${input} w-64`} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-texto-suave">{lista.length} / {rows.length}</span>
        <button onClick={exportar} disabled={lista.length === 0} className="ml-auto rounded-controle border border-borda-forte px-3 py-1.5 text-sm font-medium text-texto-suave hover:bg-superficie-suave disabled:opacity-40 dark:border-borda-forte">
          <Icone nome="baixar" tamanho={14} className="mr-1.5" /> Exportar CSV
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          {historico ? "Nenhuma etiqueta baixada." : "Nenhuma etiqueta aqui."}
        </div>
      ) : visao === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-5">
          {colunas.map((c) => {
            const its = lista.filter(c.f);
            return (
              <div key={c.key} className={`rounded-cartao border-t-4 bg-superficie-suave p-2 ${c.cor}`}>
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-texto-suave">
                  {c.titulo} <span className="rounded-full bg-white px-2 text-xs text-texto-suave dark:bg-zinc-800">{its.length}</span>
                </div>
                <div className="space-y-2">
                  {its.map((r) => (
                    <div key={r.id} className="rounded-cartao border border-borda bg-painel-cartao p-2.5 text-sm">
                      <div className="font-medium text-texto">{r.produto_nome}{badgeTipo(r.tipo)}</div>
                      <div className="text-xs text-texto-fraco">
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
                  {its.length === 0 && <p className="px-1 text-xs text-texto-fraco">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
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
            <tbody className="divide-y divide-borda">
              {lista.map((r) => (
                <tr key={r.id} className="">
                  <td className="px-3 py-2 font-mono text-texto-suave">#{r.numero}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-texto">{r.produto_nome}{badgeTipo(r.tipo)}</div>
                    <div className="text-xs text-texto-fraco">
                      {r.conservacao ?? ""}{r.conservacao && r.quantidade != null ? " · " : ""}{r.quantidade != null ? `${r.quantidade} ${r.unidade ?? ""}` : ""}
                      {r.lote ? ` · lote ${r.lote}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-texto-suave">{r.categoria_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-texto-suave">{r.colaborador_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-texto-suave">{fmtHora(r.manipulado_em)}</td>
                  <td className={`px-3 py-2 ${corValidade(r.validade)}`}>
                    {r.validade ? dataBR(r.validade) : "—"}{!historico && r.validade && r.validade < hoje && <Icone nome="alerta" tamanho={12} className="ml-1 text-red-600" titulo="Vencida" />}
                  </td>
                  <td className="px-3 py-2 text-xs text-texto-suave">{historico ? `${r.status}${r.baixa_em ? " · " + fmtHora(r.baixa_em) : ""}` : ""}</td>
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
