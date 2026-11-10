"use client";
import { Icone } from "@/components/icone";
import { avisar, perguntar } from "@/components/dialogo";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelarNfceEmitida, imprimirNfce } from "../fiscal-actions";
import { notasParaPlanilha } from "./csv-actions";

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
  comandas?: number[]; // todas as comandas da nota (quando pagas juntas)
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="cartao p-4">
      <p className="text-xs text-texto-suave">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${cor ?? "text-texto"}`}>{valor}</p>
    </div>
  );
}

function badge(status: string) {
  if (status === "autorizado") return "bg-emerald-100 text-ok-texto dark:bg-emerald-950 dark:text-emerald-300";
  if (status === "cancelado") return "bg-zinc-200 text-texto-suave dark:bg-zinc-800 ";
  if (status === "enviando" || status === "processando_autorizacao" || status === "cancelando") return "pilula-info";
  return "bg-red-100 text-urgente-texto dark:bg-red-950 dark:text-red-300";
}
// Situações que ainda não são finais (FIS-01/NFE-01/NFE-07): a rotina de
// conferência pergunta à Focus e atualiza sozinha.
const EM_ANDAMENTO: Record<string, string> = { enviando: "Enviando", processando_autorizacao: "Processando", cancelando: "Cancelando" };
const rotulo = (s: string) => (s === "autorizado" ? "Sucesso" : s === "cancelado" ? "Cancelada" : EM_ANDAMENTO[s] ?? "Erro");

export function NotasClient({
  linhas,
  stats,
  filtro,
  pagina,
  totalFiltro,
  porPagina,
}: {
  linhas: NotaLinha[];
  stats: { emitidas: number; valorTotal: number; canceladas: number; erro: number };
  /** Filtros da tela: moram no endereço e a busca é feita no banco (DES-008). */
  filtro: { q: string; status: string; modelo: string };
  pagina: number;
  totalFiltro: number;
  porPagina: number;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [baixando, setBaixando] = useState(false);
  const filtradas = linhas;
  const paginas = Math.max(1, Math.ceil(totalFiltro / porPagina));
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (filtro.q) q.set("q", filtro.q);
    if (filtro.status) q.set("status", filtro.status);
    if (filtro.modelo) q.set("modelo", filtro.modelo);
    if (p > 0) q.set("pagina", String(p));
    const s = q.toString();
    return `/salao/notas-fiscais${s ? `?${s}` : ""}`;
  };

  async function cancelar(id: string) {
    const j = await perguntar("Motivo do cancelamento da nota (mínimo 15 caracteres):", "", { detalhe: "A nota é cancelada na Receita e não dá pra desfazer.", perigo: true, okTexto: "Cancelar a nota", obrigatorio: true });
    if (j == null) return;
    if (j.trim().length < 15) { void avisar("A justificativa precisa ter pelo menos 15 caracteres."); return; }
    start(async () => {
      const r = await cancelarNfceEmitida(id, j.trim());
      if (!r.ok) void avisar("Não cancelou: " + (r.mensagem || "erro"));
      else if (r.aviso) void avisar(`Nota cancelada. ${r.aviso}`);
      router.refresh();
    });
  }

  async function baixarCsv() {
    if (baixando) return;
    setBaixando(true);
    let todas: NotaLinha[];
    try { todas = await notasParaPlanilha(filtro); }
    catch { setBaixando(false); void avisar("Sem conexão. Tente de novo."); return; }
    setBaixando(false);
    const linhasCsv = [
      ["Lançamento (comanda)", "Nota", "Série", "Tipo", "Valor", "Status", "Emissão", "Chave"],
      ...todas.map((l) => [
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

  const sel = "rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Emitidas" valor={String(stats.emitidas)} cor="text-ok-texto" />
        <Card titulo="Valor total emitido" valor={brl(stats.valorTotal)} />
        <Card titulo="Canceladas" valor={String(stats.canceladas)} />
        <Card titulo="Com erro" valor={String(stats.erro)} cor="text-urgente-texto" />
      </div>

      {/* Busca no banco: o formulário manda os filtros pro endereço. */}
      <form method="get" action="/salao/notas-fiscais" className="mt-4 flex flex-wrap items-center gap-2">
        <input aria-label="Buscar por comanda, nº da nota, chave..."
          name="q"
          defaultValue={filtro.q}
          placeholder="Buscar por comanda, nº da nota, chave... (Enter)"
          className={`${sel} min-w-56 flex-1`}
        />
        <select name="status" defaultValue={filtro.status} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={sel}>
          <option value="">Status: todos</option>
          <option value="autorizado">Sucesso</option>
          <option value="cancelado">Cancelada</option>
          <option value="erro">Erro</option>
        </select>
        <select name="modelo" defaultValue={filtro.modelo} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={sel}>
          <option value="">Modelo: todos</option>
          <option value="nfce">NFC-e</option>
          <option value="nfe">NF-e</option>
        </select>
        <button type="submit" className="btn-secundario text-sm">Buscar</button>
        <button type="button" onClick={baixarCsv} disabled={baixando} className="rounded-controle bg-texto px-3 py-1.5 text-sm font-medium text-fundo hover:opacity-90 disabled:opacity-60">
          <Icone nome="baixar" tamanho={14} className="mr-1.5" /> {baixando ? "Gerando…" : "XLS"}
        </button>
      </form>

      <div className="mt-3 overflow-x-auto rounded-cartao bg-painel-cartao" tabIndex={0} role="region" aria-label="Tabela (role para os lados se precisar)">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="rotulo text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Lançamento</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {filtradas.map((l) => (
              <tr key={l.id} className="">
                <td className="px-4 py-2">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">
                    {(l.comandas?.length ?? 0) > 1 ? `Comandas nº ${l.comandas!.join(", ")}` : l.comandaNumero != null ? `Comanda nº ${l.comandaNumero}` : "—"}
                  </div>
                  <div className="text-xs text-texto-fraco">{dataHora(l.criadoEm)}</div>
                </td>
                <td className="px-4 py-2 text-texto-suave">
                  {l.numero ? `Nº ${l.numero}${l.serie ? ` · Série ${l.serie}` : ""}` : <span className="text-texto-fraco">—</span>}
                </td>
                <td className="px-4 py-2 text-texto-suave">{l.modelo}</td>
                <td className="px-4 py-2 text-right font-medium text-texto">
                  {l.valor != null ? brl(l.valor) : "—"}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge(l.status)}`}>{rotulo(l.status)}</span>
                  {l.status !== "autorizado" && l.status !== "cancelado" && l.mensagem && (
                    <div className="mt-0.5 max-w-xs truncate text-mini text-urgente-texto" title={l.mensagem}>{l.mensagem}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {l.urlDanfe && l.status === "autorizado" && (
                    <button
                      onClick={() => { imprimirNfce(l.id).then((r) => void avisar(r.ok ? "Enviada pra impressora." : r.mensagem)).catch(() => void avisar("Sem conexão.")); }}
                      className="mr-1 inline-flex min-h-11 items-center px-2 text-ok-texto hover:underline"
                    >
                      Imprimir
                    </button>
                  )}
                  {l.urlDanfe && (
                    <a href={l.urlDanfe} target="_blank" rel="noopener noreferrer" className="mr-1 inline-flex min-h-11 items-center px-2 text-texto-marca hover:underline">PDF</a>
                  )}
                  {l.urlXml && (
                    <a href={l.urlXml} target="_blank" rel="noopener noreferrer" className="mr-1 inline-flex min-h-11 items-center px-2 text-texto-suave hover:underline">XML</a>
                  )}
                  {(l.status === "autorizado" || l.status === "cancelando") && (
                    <button onClick={() => cancelar(l.id)} disabled={proc} className="inline-flex min-h-11 items-center px-2 text-urgente-texto hover:underline disabled:opacity-50">
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-texto-fraco">Nenhuma nota.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-texto-suave">
        <span>
          {totalFiltro.toLocaleString("pt-BR")} nota(s){filtro.q || filtro.status || filtro.modelo ? " com esses filtros" : ""}
          {paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ""}
        </span>
        {pagina > 0 && <Link href={link(pagina - 1)} className="btn-secundario text-sm">Mais recentes</Link>}
        {pagina + 1 < paginas && <Link href={link(pagina + 1)} className="btn-secundario text-sm">Mais antigas</Link>}
      </div>
    </div>
  );
}
