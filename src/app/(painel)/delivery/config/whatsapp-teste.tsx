"use client";

import { useState, useTransition } from "react";
import { testarWhatsappDelivery } from "../actions";

// Testa a API oficial: manda o modelo padrão da Meta (hello_world) pro número.
export function WhatsappTeste({ configurado }: { configurado: boolean }) {
  const [tel, setTel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();
  return (
    <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${configurado ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"}`}>
      {configurado
        ? "✓ WhatsApp oficial ligado — o cliente recebe aviso ao pedir, quando confirma, quando sai e quando entrega."
        : "💬 WhatsApp oficial ainda não configurado: faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_ID na Vercel (e os 4 modelos aprovados na Meta). Sem isso, nada é enviado."}
      {configurado && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="Seu celular com DDD" className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-emerald-800 dark:bg-zinc-950 dark:text-zinc-100" />
          <button
            onClick={() => {
              setMsg(null);
              start(async () => {
                const r = await testarWhatsappDelivery(tel);
                setMsg(r.ok ? "✓ Enviado — olha o WhatsApp (mensagem “Hello World” em inglês, é o modelo de teste da Meta)." : `Falhou: ${r.mensagem}`);
              });
            }}
            disabled={proc || tel.replace(/\D/g, "").length < 10}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {proc ? "Enviando..." : "Testar envio"}
          </button>
          {msg && <span className="text-xs">{msg}</span>}
        </div>
      )}
    </div>
  );
}
