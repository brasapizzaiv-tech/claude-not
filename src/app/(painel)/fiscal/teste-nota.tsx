"use client";

import { useState, useTransition } from "react";
import { emitirNotaTeste } from "./actions";

type Res = Awaited<ReturnType<typeof emitirNotaTeste>>;

export function TesteNota() {
  const [proc, start] = useTransition();
  const [res, setRes] = useState<Res | null>(null);

  function testar() {
    setRes(null);
    start(async () => {
      const r = await emitirNotaTeste();
      setRes(r);
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Testar emissão (homologação)</h2>
      <p className="mb-3 text-[11px] text-zinc-400">
        Emite uma <b>NFC-e de teste</b> (sem valor fiscal) para conferir se o token, o
        certificado (no Focus) e o CSC estão certos. Salve a configuração antes.
      </p>
      <button
        type="button"
        onClick={testar}
        disabled={proc}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
      >
        {proc ? "Emitindo..." : "Emitir nota de teste"}
      </button>

      {res && (
        <div
          className={`mt-3 rounded-xl p-3 text-sm ${
            res.ok
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {res.ok ? (
            <>
              <p className="font-semibold">✓ Autorizada! (status: {res.status})</p>
              {res.numero && <p>Número: {res.numero}</p>}
              {res.chave && <p className="break-all text-xs">Chave: {res.chave}</p>}
              {res.urlDanfe && (
                <a href={res.urlDanfe} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium underline">
                  Abrir DANFE (PDF)
                </a>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold">✗ Não autorizou {res.status ? `(${res.status})` : ""}</p>
              {res.mensagem && <p className="mt-1">{res.mensagem}</p>}
              {res.erros && <p className="mt-1 break-all text-xs opacity-80">{res.erros}</p>}
              <p className="mt-1 text-xs opacity-70">HTTP {res.statusHttp}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
