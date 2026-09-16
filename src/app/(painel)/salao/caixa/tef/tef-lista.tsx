"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tefAdm, tefCancelar, tefDisponivel, type TefStatus } from "@/lib/tef-client";
import { registrarCancelamentoTef, reimprimirTef } from "../../actions";

export type TefLinha = {
  id: string;
  tipo: string | null;
  valor: number;
  parcelas: number;
  rede: string | null;
  bandeira: string | null;
  nsu: string | null;
  autorizacao: string | null;
  status: string;
  mensagem: string | null;
  pan_mascarado: string | null;
  terminal: string | null;
  criado_em: string;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
// Data da venda no formato que o gerenciador pede no cancelamento (DDMMAAAA).
const dataTef = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}${g("month")}${g("year")}`;
};
const STATUS: Record<string, { rotulo: string; cls: string }> = {
  confirmada: { rotulo: "aprovada", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  aprovada: { rotulo: "aprovada (sem confirmar)", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  cancelada: { rotulo: "cancelada", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  desfeita: { rotulo: "desfeita", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" },
  negada: { rotulo: "negada", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" },
  erro: { rotulo: "erro", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" },
};

export function TefLista({ linhas }: { linhas: TefLinha[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [agente, setAgente] = useState<TefStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const ver = async () => { const s = await tefDisponivel(); if (vivo) setAgente(s); };
    ver();
    const t = setInterval(ver, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  function reimprimir(l: TefLinha) {
    setMsg(null);
    start(async () => {
      const r = await reimprimirTef(l.id);
      setMsg(r.ok ? `✓ Via do cliente (NSU ${l.nsu ?? "-"}) mandada pra impressora.` : r.mensagem);
    });
  }

  function cancelar(l: TefLinha) {
    if (!agente) { setMsg("O Agente TEF não está rodando neste PC — o cancelamento precisa do pinpad."); return; }
    if (!l.nsu) { setMsg("Essa transação não tem NSU, não dá pra cancelar pelo TEF."); return; }
    if (!confirm(`Cancelar a venda de ${brl(l.valor)} no cartão (NSU ${l.nsu})?\n\nO pinpad vai pedir o cartão do cliente de novo. O valor sai do caixa e a via do cancelamento é impressa.`)) return;
    setMsg("Aguardando o pinpad… peça o cartão ao cliente.");
    setOcupadoId(l.id);
    start(async () => {
      try {
        const r = await tefCancelar({ nsu: l.nsu!, valor: Number(l.valor), data: dataTef(l.criado_em) });
        if (!r.ok) { setMsg(r.erro ?? "O agente não respondeu."); return; }
        if (!r.aprovada) { setMsg(`Cancelamento não aprovado: ${r.mensagem || "sem detalhe"}.`); return; }
        const g = await registrarCancelamentoTef(l.id, {
          nsu: r.nsu ?? null, autorizacao: r.autorizacao ?? null, rede: r.rede ?? null, bandeira: r.bandeira ?? null,
          viaCliente: r.viaCliente ?? [], viaLoja: r.viaLoja ?? [], idAgente: r.idAgente ?? null, terminal: r.terminal ?? null,
        });
        setMsg(g.ok ? `✓ Venda de ${brl(l.valor)} cancelada. Via do cancelamento mandada pra impressora.` : g.mensagem);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao falar com o agente.");
      } finally {
        setOcupadoId(null);
      }
    });
  }

  function adm() {
    if (!agente) { setMsg("O Agente TEF não está rodando neste PC."); return; }
    setMsg("Abrindo o menu administrativo do gerenciador… olhe a janela da Elgin.");
    start(async () => {
      try {
        const r = await tefAdm();
        setMsg(r.ok ? `Menu administrativo: ${r.mensagem || "encerrado"}.` : (r.erro ?? "O agente não respondeu."));
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao falar com o agente.");
      }
    });
  }

  const btn = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${agente ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
          {agente ? `Agente TEF ${agente.versao} · ${agente.terminal}${agente.gerenciador ? " · gerenciador OK" : " · gerenciador não encontrado"}` : "Agente TEF não encontrado neste PC"}
        </span>
        <button onClick={adm} disabled={proc || !agente} className={btn}>⚙️ Menu administrativo (Elgin)</button>
      </div>
      {msg && <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{msg}</p>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Cartão</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">NSU / Aut.</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {linhas.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-400">Nenhum cartão passado no pinpad nos últimos 7 dias.</td></tr>
            )}
            {linhas.map((l) => {
              const st = STATUS[l.status] ?? { rotulo: l.status, cls: "bg-zinc-100 text-zinc-500" };
              const podeCancelar = l.status === "confirmada" && !!l.nsu;
              const podeImprimir = l.status === "confirmada" || l.status === "cancelada";
              return (
                <tr key={l.id} className="text-zinc-800 dark:text-zinc-100">
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{quando(l.criado_em)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.bandeira ?? "—"} <span className="text-xs text-zinc-400">{l.tipo}{l.parcelas > 1 ? ` ${l.parcelas}x` : ""}</span></div>
                    <div className="text-xs text-zinc-400">{l.rede ?? ""}{l.pan_mascarado ? ` · ${l.pan_mascarado}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{brl(l.valor)}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{l.nsu ?? "—"}{l.autorizacao ? ` / ${l.autorizacao}` : ""}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.rotulo}</span>
                    {l.mensagem && <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-zinc-400" title={l.mensagem}>{l.mensagem}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {podeImprimir && <button onClick={() => reimprimir(l)} disabled={proc} className={btn}>🖨️ Reimprimir</button>}
                      {podeCancelar && (
                        <button onClick={() => cancelar(l)} disabled={proc || !agente} className="rounded-lg border border-red-400 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950">
                          {ocupadoId === l.id ? "No pinpad…" : "✖ Cancelar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
