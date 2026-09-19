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

  const inputCls = "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria";

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
      <div className="mb-6 rounded-cartao border border-borda p-4">
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
            <label className="mb-1 block text-xs text-texto-suave">Mostrar até (opcional)</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
          </div>
          <button onClick={salvar} disabled={proc || texto.trim().length < 2} className="rounded-controle bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? "..." : editando ? "Salvar" : "Colocar na TV"}
          </button>
          {editando && (
            <button onClick={() => { setEditando(null); setTexto(""); setAte(""); }} className="rounded-controle px-3 py-2 text-sm text-texto-suave underline">cancelar</button>
          )}
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>

      <div className="divide-y divide-zinc-100 rounded-cartao border border-borda dark:divide-zinc-800">
        {inicial.length === 0 && <p className="p-6 text-center text-sm text-texto-fraco">Nenhum recado. A TV mostra só o relógio.</p>}
        {inicial.map((r) => {
          const vencido = !!r.ate && r.ate < new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          return (
            <div key={r.id} className={`flex flex-wrap items-center gap-3 p-3 ${!r.ativo || vencido ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-texto">{r.texto}</p>
                <p className="text-xs text-texto-suave">
                  {r.ativo ? (vencido ? `venceu em ${brT(r.ate!)}` : r.ate ? `até ${brT(r.ate)}` : "sem prazo") : "desligado"}
                </p>
              </div>
              <button onClick={() => rodar(() => alternarRecadoTv(r.id, !r.ativo))} disabled={proc} className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-semibold">
                {r.ativo ? "Desligar" : "Ligar"}
              </button>
              <button onClick={() => editar(r)} disabled={proc} className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-semibold">Editar</button>
              <button onClick={() => { if (confirm("Apagar este recado?")) rodar(() => excluirRecadoTv(r.id)); }} disabled={proc} className="rounded-controle px-3 py-1.5 text-xs font-semibold text-red-600">Apagar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
