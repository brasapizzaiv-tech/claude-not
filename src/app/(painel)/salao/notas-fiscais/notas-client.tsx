"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarNfceEmitida } from "../fiscal-actions";

export type NotaLinha = {
  id: string;
  modelo: string;
  ambiente: string;
  status: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  urlDanfe: string | null;
  urlXml: string | null;
  valor: number | null;
  mensagem: string | null;
  criadoEm: string | null;
  comandaNumero: number | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${cor ?? "text-zinc-900 dark:text-zinc-50"}`}>{valor}</p>
    </div>
  );
}

function badge(status: string) {
  if (status === "autorizado") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  if (status === "cancelado") return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
}
const rotulo = (s: string) => (s === "autorizado" ? "Sucesso" : s === "cancelado" ? "Cancelada" : "Erro");

export function NotasClient({
  linhas,
  stats,
}: {
  linhas: NotaLinha[];
  stats: { emitidas: number; valorTotal: number; canceladas: number; erro: number };
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fModelo, setFModelo] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (fStatus && (fStatus === "erro" ? l.status === "autorizado" || l.status === "cancelado" : l.status !== fStatus)) return false;
      if (fModelo && l.modelo !== fModelo) return false;
      if (!q) return true;
      return (
        String(l.comandaNumero ?? "").includes(q) ||
        String(l.numero ?? "").includes(q) ||
        (l.chave ?? "").toLowerCase().includes(q) ||
        (l.mensagem ?? "").toLowerCase().includes(q)
      );
    });
  }, [linhas, busca, fStatus, fModelo]);

  function cancelar(id: string) {
    const j = window.prompt("Motivo do cancelamento (mínimo 15 caracteres):", "");
    if (j == null) return;
    if (j.trim().length < 15) { window.alert("A justificativa precisa ter pelo menos 15 caracteres."); return; }
    start(async () => {
      const r = await cancelarNfceEmitida(id, j.trim());
      if (!r.ok) window.alert("Não cancelou: " + (r.mensagem || "erro"));
      router.refresh();
    });
  }

  function baixarCsv() {
    const linhasCsv = [
      ["Lançamento (comanda)", "Nota", "Série", "Tipo", "Valor", "Status", "Emissão", "Chave"],
      ...filtradas.map((l) => [
        l.comandaNumero ?? "",
        l.numero ?? "",
        l.serie ?? "",
        l.modelo.toUpperCase(),
        l.valor ?? "",
        rotulo(l.status),
        dataHora(l.criadoEm),
        l.chave ?? "",
      ]),
    ];
    const csv = "﻿" + linhasCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "notas-fiscais.csv";
    a.click();
  }

  const sel = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Emitidas" valor={String(stats.emitidas)} cor="text-emerald-600" />
        <Card titulo="Valor total emitido" valor={brl(stats.valorTotal)} />
        <Card titulo="Canceladas" valor={String(stats.canceladas)} />
        <Card titulo="Com erro" valor={String(stats.erro)} cor="text-red-600" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar por comanda, nº da nota, chave..."
          className={`${sel} min-w-56 flex-1`}
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}>
          <option value="">Status: todos</option>
          <option value="autorizado">Sucesso</option>
          <option value="cancelado">Cancelada</option>
          <option value="erro">Erro</option>
        </select>
        <select value={fModelo} onChange={(e) => setFModelo(e.target.value)} className={sel}>
          <option value="">Modelo: todos</option>
          <option value="nfce">NFC-e</option>
          <option value="nfe">NF-e</option>
        </select>
        <button onClick={baixarCsv} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          ⬇ XLS
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Lançamento</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtradas.map((l) => (
              <tr key={l.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">
                    {l.comandaNumero != null ? `Comanda nº ${l.comandaNumero}` : "—"}
                  </div>
                  <div className="text-xs text-zinc-400">{dataHora(l.criadoEm)}</div>
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {l.numero ? `Nº ${l.numero}${l.serie ? ` · Série ${l.serie}` : ""}` : <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-2 uppercase text-zinc-500">{l.modelo}</td>
                <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                  {l.valor != null ? brl(l.valor) : "—"}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge(l.status)}`}>{rotulo(l.status)}</span>
                  {l.status !== "autorizado" && l.status !== "cancelado" && l.mensagem && (
                    <div className="mt-0.5 max-w-xs truncate text-[11px] text-red-500" title={l.mensagem}>{l.mensagem}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {l.urlDanfe && (
                    <a href={l.urlDanfe} target="_blank" rel="noopener noreferrer" className="mr-3 text-orange-600 hover:underline">DANFE</a>
                  )}
                  {l.urlXml && (
                    <a href={l.urlXml} target="_blank" rel="noopener noreferrer" className="mr-3 text-zinc-500 hover:underline">XML</a>
                  )}
                  {l.status === "autorizado" && (
                    <button onClick={() => cancelar(l.id)} disabled={proc} className="text-red-500 hover:underline disabled:opacity-50">
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Nenhuma nota.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {linhas.length >= 1000 && (
        <p className="mt-2 text-xs text-zinc-400">Mostrando as 1000 notas mais recentes.</p>
      )}
    </div>
  );
}
