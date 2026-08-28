"use client";

import { useState, useTransition } from "react";
import { emitirNfceComanda } from "../fiscal-actions";

// Aparece depois de receber no caixa: emite a NFC-e de cada comanda paga e abre
// o DANFE pra impressão. CPF na nota é opcional (por comanda).
export function EmitirNotaCaixa({ comandas }: { comandas: { id: string; numero: number }[] }) {
  const [proc, start] = useTransition();
  const [cpf, setCpf] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, { ok: boolean; msg: string; url?: string | null }>>({});

  function emitir(id: string) {
    start(async () => {
      const r = await emitirNfceComanda(id, cpf[id] || "");
      setRes((s) => ({
        ...s,
        [id]: { ok: r.ok, msg: r.ok ? `✓ NFC-e ${r.numero ?? ""} autorizada` : r.mensagem || "não autorizou", url: r.urlDanfe },
      }));
      if (r.ok && r.urlDanfe) {
        try { window.open(r.urlDanfe, "_blank"); } catch {}
      }
    });
  }

  if (comandas.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">🧾 Emitir NFC-e</p>
      <div className="space-y-2">
        {comandas.map((c) => {
          const r = res[c.id];
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">Comanda nº {c.numero}</span>
              {!r?.ok && (
                <input
                  value={cpf[c.id] ?? ""}
                  onChange={(e) => setCpf((s) => ({ ...s, [c.id]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="CPF na nota? (opcional)"
                  className="w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              )}
              {r?.ok ? (
                <span className="text-sm font-medium text-emerald-600">{r.msg}</span>
              ) : (
                <button
                  onClick={() => emitir(c.id)}
                  disabled={proc}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
                >
                  {proc ? "..." : "Emitir"}
                </button>
              )}
              {r && !r.ok && <span className="text-sm text-red-600">{r.msg}</span>}
              {r?.ok && r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-600 underline">
                  DANFE
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
