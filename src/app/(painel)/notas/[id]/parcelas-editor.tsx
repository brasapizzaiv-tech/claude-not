"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarParcelasNota } from "../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

type Linha = { vencimento: string; valor: string };

// Soma m meses a uma data ISO (YYYY-MM-DD), mantendo o dia.
function addMeses(iso: string, m: number) {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + m, d));
  return dt.toISOString().slice(0, 10);
}

const campo =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ParcelasEditor({
  notaId,
  valorNota,
  vencimentoBase,
  parcelas,
  lancada,
}: {
  notaId: string;
  valorNota: number;
  vencimentoBase: string | null;
  parcelas: { numero: string | null; vencimento: string | null; valor: number }[];
  lancada: boolean;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>(
    parcelas.length > 1
      ? parcelas.map((p) => ({
          vencimento: p.vencimento ?? "",
          valor: String(p.valor),
        }))
      : [{ vencimento: vencimentoBase ?? "", valor: "" }],
  );
  const [nGerar, setNGerar] = useState("2");
  const [msg, setMsg] = useState<string | null>(null);

  const total = linhas.reduce((s, l) => s + num(l.valor), 0);
  const dif = Math.round((total - valorNota) * 100) / 100;

  function set(i: number, campo: keyof Linha, v: string) {
    setLinhas((s) => s.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));
  }
  function addLinha() {
    const base = linhas[linhas.length - 1]?.vencimento || vencimentoBase || "";
    setLinhas((s) => [...s, { vencimento: base ? addMeses(base, 1) : "", valor: "" }]);
  }
  function removeLinha(i: number) {
    setLinhas((s) => s.filter((_, idx) => idx !== i));
  }
  // Gera N parcelas iguais (a última absorve o centavo) a partir do 1º venc.
  function gerar() {
    const n = Math.max(2, Math.min(36, Math.round(num(nGerar))));
    const base = linhas[0]?.vencimento || vencimentoBase || new Date().toISOString().slice(0, 10);
    const parcela = Math.round((valorNota / n) * 100) / 100;
    const novas: Linha[] = [];
    let acum = 0;
    for (let i = 0; i < n; i++) {
      const ultima = i === n - 1;
      const v = ultima ? Math.round((valorNota - acum) * 100) / 100 : parcela;
      acum += v;
      novas.push({ vencimento: addMeses(base, i), valor: String(v) });
    }
    setLinhas(novas);
  }
  function salvar() {
    setMsg(null);
    start(async () => {
      const r = await salvarParcelasNota(
        notaId,
        linhas.map((l) => ({ vencimento: l.vencimento || null, valor: num(l.valor) })),
      );
      setMsg(
        r.total > 0
          ? `✓ Parcelamento salvo em ${r.total}x. Agora lance a nota (o parcelado já vem marcado).`
          : "✓ Salvo sem parcelamento (menos de 2 parcelas) — a nota fica como conta única.",
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 dark:border-violet-900">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          💳 Parcelamento manual
          {parcelas.length > 1 && (
            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              {parcelas.length}x salvo
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-400">{aberto ? "fechar ▲" : "abrir ▼"}</span>
      </button>

      {aberto && (
        <div className="border-t border-violet-100 p-4 dark:border-violet-900/60">
          {lancada && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Esta nota já está <b>lançada</b>. Para o parcelamento valer, salve as
              parcelas aqui, depois <b>estorne</b> e <b>lance de novo</b> (o
              parcelado já vem marcado).
            </p>
          )}

          {/* Gerador rápido */}
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/50">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Dividir em</label>
              <input
                inputMode="numeric"
                value={nGerar}
                onChange={(e) => setNGerar(e.target.value)}
                className={`${campo} w-16 text-center`}
              />
            </div>
            <span className="pb-2 text-xs text-zinc-500">
              vezes de {moeda(valorNota)}, começando no 1º vencimento (mensal)
            </span>
            <button
              onClick={gerar}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
            >
              Gerar
            </button>
          </div>

          {/* Linhas editáveis */}
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-xs text-zinc-400">{i + 1}º</span>
                <input
                  type="date"
                  value={l.vencimento}
                  onChange={(e) => set(i, "vencimento", e.target.value)}
                  className={campo}
                />
                <input
                  inputMode="decimal"
                  value={l.valor}
                  placeholder="0,00"
                  onChange={(e) => set(i, "valor", e.target.value)}
                  className={`${campo} w-28 text-right`}
                />
                <button
                  onClick={() => removeLinha(i)}
                  className="text-xs text-zinc-300 hover:text-red-600 dark:text-zinc-600"
                  title="Remover parcela"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addLinha}
            className="mt-2 text-xs font-medium text-violet-600 hover:underline"
          >
            + adicionar parcela
          </button>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <span className={`text-xs ${Math.abs(dif) < 0.01 ? "text-zinc-500" : "text-red-600"}`}>
              Soma das parcelas: <b>{moeda(total)}</b>
              {Math.abs(dif) >= 0.01 && (
                <> — {dif > 0 ? "acima" : "abaixo"} do total da nota em {moeda(Math.abs(dif))}</>
              )}
            </span>
            <button
              onClick={salvar}
              disabled={proc}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {proc ? "Salvando..." : "Salvar parcelamento"}
            </button>
          </div>
          {msg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
        </div>
      )}
    </div>
  );
}
