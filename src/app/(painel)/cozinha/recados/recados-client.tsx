"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarRecadoTv, excluirRecadoTv, salvarRecadoTv, type RecadoTvLinha } from "./actions";

const brT = (iso: string) => iso.split("-").reverse().join("/");

export function RecadosClient({ inicial }: { inicial: RecadoTvLinha[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [ate, setAte] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [proc, start] = useTransition();

  const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setErro(r.mensagem ?? "não deu certo"); return; }
      router.refresh();
    });
  }
  function salvar() {
    rodar(async () => {
      const r = await salvarRecadoTv({ id: editando ?? undefined, texto, ate: ate || null });
      if (r.ok) { setTexto(""); setAte(""); setEditando(null); }
      return r;
    });
  }
  function editar(r: RecadoTvLinha) {
    setEditando(r.id); setTexto(r.texto); setAte(r.ate ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-sm font-semibold">{editando ? "Editar recado" : "Novo recado"}</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Ex.: Sábado tem rodízio — separar as massas até as 17h"
          className={inputCls}
        />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Mostrar até (opcional)</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
          </div>
          <button onClick={salvar} disabled={proc || texto.trim().length < 2} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? "..." : editando ? "Salvar" : "Colocar na TV"}
          </button>
          {editando && (
            <button onClick={() => { setEditando(null); setTexto(""); setAte(""); }} className="rounded-lg px-3 py-2 text-sm text-zinc-500 underline">cancelar</button>
          )}
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>

      <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {inicial.length === 0 && <p className="p-6 text-center text-sm text-zinc-400">Nenhum recado. A TV mostra só o relógio.</p>}
        {inicial.map((r) => {
          const vencido = !!r.ate && r.ate < new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          return (
            <div key={r.id} className={`flex flex-wrap items-center gap-3 p-3 ${!r.ativo || vencido ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{r.texto}</p>
                <p className="text-xs text-zinc-500">
                  {r.ativo ? (vencido ? `venceu em ${brT(r.ate!)}` : r.ate ? `até ${brT(r.ate)}` : "sem prazo") : "desligado"}
                </p>
              </div>
              <button onClick={() => rodar(() => alternarRecadoTv(r.id, !r.ativo))} disabled={proc} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700">
                {r.ativo ? "Desligar" : "Ligar"}
              </button>
              <button onClick={() => editar(r)} disabled={proc} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700">Editar</button>
              <button onClick={() => { if (confirm("Apagar este recado?")) rodar(() => excluirRecadoTv(r.id)); }} disabled={proc} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600">Apagar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
