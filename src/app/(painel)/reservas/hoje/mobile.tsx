"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { marcarChegou, atribuirMesa } from "../actions";

export type ResMobile = {
  id: string;
  nome: string;
  telefone: string | null;
  turno: string;
  pessoas: number;
  adultos: number | null;
  criancas: number | null;
  mesa: string | null;
  ocasiao: string | null;
  observacao: string | null;
  status: string;
  chegou_em: string | null;
};

const diaSemana = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });

function addDias(iso: string, n: number) {
  return new Date(new Date(iso + "T12:00:00").getTime() + n * 864e5).toISOString().slice(0, 10);
}

export function ReservasHoje({
  dia,
  hoje,
  reservas,
}: {
  dia: string;
  hoje: string;
  reservas: ResMobile[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [soFaltam, setSoFaltam] = useState(false);
  const [editMesa, setEditMesa] = useState<string | null>(null);

  const totalPessoas = reservas.reduce((s, r) => s + (r.pessoas || 0), 0);
  const chegaram = reservas.filter((r) => r.chegou_em).length;

  const lista = useMemo(() => {
    const l = soFaltam ? reservas.filter((r) => !r.chegou_em) : reservas;
    // Não chegaram primeiro; depois os que já chegaram.
    return [...l].sort((a, b) => Number(!!a.chegou_em) - Number(!!b.chegou_em) || a.turno.localeCompare(b.turno));
  }, [reservas, soFaltam]);

  const irDia = (d: string) => router.push(`/reservas/hoje?dia=${d}`);
  const acao = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="mx-auto max-w-md px-3 pb-16">
      {/* Cabeçalho fixo */}
      <div className="sticky top-0 z-10 -mx-3 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <h1 className="text-center text-lg font-bold text-zinc-900 dark:text-zinc-50">Reservas</h1>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => irDia(addDias(dia, -1))} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">◀</button>
          <div className="text-center">
            <div className="text-sm font-semibold capitalize text-zinc-800 dark:text-zinc-100">{diaSemana(dia)}</div>
            <div className="text-xs text-zinc-500">{dataBR(dia)}{dia === hoje ? " · hoje" : ""}</div>
          </div>
          <button onClick={() => irDia(addDias(dia, 1))} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">▶</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-zinc-100 py-1.5 dark:bg-zinc-900"><div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{reservas.length}</div><div className="text-[10px] uppercase text-zinc-400">reservas</div></div>
          <div className="rounded-lg bg-zinc-100 py-1.5 dark:bg-zinc-900"><div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{totalPessoas}</div><div className="text-[10px] uppercase text-zinc-400">pessoas</div></div>
          <div className="rounded-lg bg-emerald-100 py-1.5 dark:bg-emerald-950/40"><div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{chegaram}</div><div className="text-[10px] uppercase text-emerald-600/70">chegaram</div></div>
        </div>
        <label className="mt-2 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <input type="checkbox" checked={soFaltam} onChange={(e) => setSoFaltam(e.target.checked)} />
          Mostrar só quem ainda não chegou
        </label>
      </div>

      {/* Lista */}
      <div className="mt-3 space-y-2">
        {lista.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400 dark:border-zinc-700">Nenhuma reserva.</div>
        )}
        {lista.map((r) => {
          return (
            <div
              key={r.id}
              className={`rounded-2xl border p-3 ${
                r.chegou_em
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-zinc-900 dark:text-zinc-50">
                    {r.ocasiao && r.ocasiao !== "Só uma reserva" ? "🎂 " : ""}{r.nome}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {r.pessoas} {r.pessoas === 1 ? "pessoa" : "pessoas"}
                    {r.criancas ? ` (${r.adultos ?? r.pessoas} ad. + ${r.criancas} cri.)` : ""} · {r.turno}
                  </div>
                  {r.observacao && <div className="mt-0.5 text-xs text-amber-600">📝 {r.observacao}</div>}
                </div>
                <div className="shrink-0 text-right">
                  {r.chegou_em ? (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">✓ chegou</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">aguardando</span>
                  )}
                </div>
              </div>

              {/* Mesa */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-zinc-400">Mesa:</span>
                {editMesa === r.id ? (
                  <input
                    autoFocus
                    defaultValue={r.mesa ?? ""}
                    onBlur={(e) => { setEditMesa(null); if ((e.target.value || "") !== (r.mesa ?? "")) acao(() => atribuirMesa(r.id, e.target.value)); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder="ex.: 12"
                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                ) : (
                  <button onClick={() => setEditMesa(r.id)} className="rounded-lg border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                    {r.mesa ? `Mesa ${r.mesa}` : "definir"}
                  </button>
                )}
              </div>

              {/* Ação: só marcar que chegou */}
              <button
                onClick={() => acao(() => marcarChegou(r.id, !r.chegou_em))}
                disabled={proc}
                className={`mt-2 w-full rounded-xl py-3 text-base font-bold disabled:opacity-60 ${
                  r.chegou_em
                    ? "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {r.chegou_em ? "Desmarcar chegada" : "✓ Chegou"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
