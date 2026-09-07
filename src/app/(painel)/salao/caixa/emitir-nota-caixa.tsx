"use client";

import { useState, useTransition } from "react";
import { emitirNfceComanda } from "../fiscal-actions";

// Aparece depois de receber no caixa: emite a NFC-e de cada comanda paga e abre
// o DANFE pra impressão. CPF na nota é opcional (por comanda).
export function EmitirNotaCaixa({ comandas, autoIds = [] }: { comandas: { id: string; numero: number }[]; autoIds?: string[] }) {
  const [proc, start] = useTransition();
  const [cpf, setCpf] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, { ok: boolean; msg: string; url?: string | null }>>({});
  // Nota automática (Pix/cartão): a pergunta "CPF ou CNPJ na nota?" fica em
  // destaque e o foco vai pro campo; Enter ou "Sem CPF" emite.
  const autoSet = new Set(autoIds);
  const primeiroAuto = autoIds[0];

  function emitir(id: string, docForcado?: string) {
    start(async () => {
      const r = await emitirNfceComanda(id, docForcado ?? (cpf[id] || ""));
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
      <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">🧾 {autoIds.length > 0 ? "CPF ou CNPJ na nota?" : "Emitir NFC-e"} {autoIds.length > 0 && <span className="ml-1 text-xs font-normal text-emerald-600">(nota automática: Pix/cartão)</span>}</p>
      <div className="space-y-2">
        {comandas.map((c) => {
          const r = res[c.id];
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">Comanda nº {c.numero}</span>
              {!r?.ok && (
                <input
                  autoFocus={c.id === primeiroAuto}
                  value={cpf[c.id] ?? ""}
                  onChange={(e) => setCpf((s) => ({ ...s, [c.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !proc) emitir(c.id); }}
                  inputMode="numeric"
                  placeholder="CPF ou CNPJ (opcional)"
                  className={`w-44 rounded-lg border bg-white px-2 py-1 text-sm dark:bg-zinc-950 ${autoSet.has(c.id) ? "border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-zinc-300 dark:border-zinc-700"}`}
                />
              )}
              {r?.ok ? (
                <span className="text-sm font-medium text-emerald-600">{r.msg}</span>
              ) : autoSet.has(c.id) ? (
                <>
                  <button
                    onClick={() => { setCpf((s) => ({ ...s, [c.id]: "" })); emitir(c.id, ""); }}
                    disabled={proc}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {proc ? "Emitindo…" : "Sem CPF"}
                  </button>
                  <button
                    onClick={() => emitir(c.id)}
                    disabled={proc || !(cpf[c.id] ?? "").trim()}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {proc ? "Emitindo…" : "Com CPF/CNPJ"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => emitir(c.id)}
                  disabled={proc}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
                >
                  {proc ? "Emitindo…" : "Emitir"}
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
