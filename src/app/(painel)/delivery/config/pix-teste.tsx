"use client";

import { useState, useTransition } from "react";
import { testarPixDelivery } from "../actions";

type Res = Awaited<ReturnType<typeof testarPixDelivery>>;

export function PixTeste({ banco, ambiente, configurado, faltando }: { banco: string; ambiente: string; configurado: boolean; faltando: string[] }) {
  const [res, setRes] = useState<Res | null>(null);
  const [pend, start] = useTransition();
  const nomeBanco = banco === "sicoob" ? "Sicoob" : "Sicredi";
  return (
    <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${configurado ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
      {configurado ? (
        <p>✓ Pix online ({nomeBanco}, {ambiente === "producao" ? "produção" : "sandbox"}) configurado — o app do cliente oferece &quot;Pix agora&quot;.</p>
      ) : (
        <p>
          ⓘ Pix online ({nomeBanco}) ainda não está ativo. Faltam na Vercel: <b>{faltando.join(", ") || "—"}</b>. Depois de salvar, faça Redeploy.
        </p>
      )}
      {configurado && (
        <div className="mt-2">
          <button
            type="button"
            disabled={pend}
            onClick={() => start(async () => setRes(await testarPixDelivery()))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pend ? "Testando…" : "Testar Pix (cobrança de R$ 0,01)"}
          </button>
          {res && (
            <div className={`mt-2 rounded-lg p-2 text-xs ${res.ok ? "bg-emerald-600/10" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              {res.ok ? (
                <>
                  <p>✅ Funcionou em {res.ms} ms. Cobrança criada (expira em 1 min, não precisa pagar). Ambiente: <b>{res.ambiente === "producao" ? "PRODUÇÃO" : "SANDBOX (teste — não recebe dinheiro de verdade)"}</b>.</p>
                  <p className="mt-1 break-all text-[10px] text-zinc-500">location: {res.location}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">{res.copiaECola}</p>
                </>
              ) : (
                <p>❌ Falhou em {res.ms} ms: {res.erro}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
