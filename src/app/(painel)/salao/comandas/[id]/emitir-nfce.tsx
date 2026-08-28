"use client";

import { useState, useTransition } from "react";
import { emitirNfceComanda } from "../../fiscal-actions";

type Res = Awaited<ReturnType<typeof emitirNfceComanda>>;

export function EmitirNfce({
  comandaId,
  emitida,
}: {
  comandaId: string;
  emitida: { status: string | null; numero: string | null; url_danfe: string | null } | null;
}) {
  const [proc, start] = useTransition();
  const [res, setRes] = useState<Res | null>(null);
  const [cpf, setCpf] = useState("");

  const autorizada =
    (emitida && emitida.status === "autorizado") || (res && res.ok);
  const danfe = res?.urlDanfe || emitida?.url_danfe || null;
  const numero = res?.numero || emitida?.numero || null;

  function emitir() {
    setRes(null);
    start(async () => setRes(await emitirNfceComanda(comandaId, cpf)));
  }

  return (
    <div className="nao-imprimir mt-3">
      {autorizada ? (
        <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-semibold">✓ NFC-e autorizada{numero ? ` · nº ${numero}` : ""}</p>
          {danfe && (
            <a href={danfe} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium underline">
              Abrir / imprimir DANFE
            </a>
          )}
        </div>
      ) : (
        <>
          <input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            inputMode="numeric"
            placeholder="CPF na nota? (opcional)"
            className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            onClick={emitir}
            disabled={proc}
            className="w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
          >
            {proc ? "Emitindo NFC-e..." : "🧾 Emitir NFC-e"}
          </button>
          {res && !res.ok && (
            <div className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">✗ Não autorizou {res.status ? `(${res.status})` : ""}</p>
              {res.mensagem && <p className="mt-1">{res.mensagem}</p>}
              {res.erros && <p className="mt-1 break-all text-xs opacity-80">{res.erros}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
