"use client";

import { useState, useTransition } from "react";
import { modelosWhatsappDelivery, testarWhatsappDelivery } from "../actions";

const ESPERADOS = ["pedido_recebido", "pedido_confirmado", "pedido_saiu", "pedido_entregue"];
const STATUS_PT: Record<string, string> = { APPROVED: "✅ aprovado", PENDING: "⏳ em análise", REJECTED: "❌ rejeitado", PAUSED: "⏸ pausado", DISABLED: "🚫 desativado" };

// Testa a API oficial: manda o modelo padrão da Meta (hello_world) pro número.
export function WhatsappTeste({ configurado }: { configurado: boolean }) {
  const [tel, setTel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();
  const [modelos, setModelos] = useState<{ nome: string; idioma: string; categoria: string; status: string; motivo: string | null }[] | null>(null);
  const [modelosErro, setModelosErro] = useState<string | null>(null);
  function verModelos() {
    setModelosErro(null);
    start(async () => {
      const r = await modelosWhatsappDelivery();
      if (r.ok) setModelos(r.modelos); else setModelosErro(r.erro);
    });
  }
  return (
    <div className={`mb-4 rounded-cartao px-4 py-3 text-sm ${configurado ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-texto-suave"}`}>
      {configurado
        ? "✓ WhatsApp oficial ligado — o cliente recebe aviso ao pedir, quando confirma, quando sai e quando entrega."
        : "💬 WhatsApp oficial ainda não configurado: faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_ID na Vercel (e os 4 modelos aprovados na Meta). Sem isso, nada é enviado."}
      {configurado && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="Seu celular com DDD" className="rounded-controle border border-emerald-300 bg-white px-3 py-1.5 text-sm text-texto outline-none dark:border-emerald-800 dark:bg-zinc-950" />
          <button
            onClick={() => {
              setMsg(null);
              start(async () => {
                const r = await testarWhatsappDelivery(tel);
                setMsg(r.ok ? "✓ Enviado — olha o WhatsApp (mensagem “Hello World” em inglês, é o modelo de teste da Meta)." : `Falhou: ${r.mensagem}`);
              });
            }}
            disabled={proc || tel.replace(/\D/g, "").length < 10}
            className="rounded-controle bg-texto px-3 py-1.5 text-sm font-semibold text-fundo disabled:opacity-50"
          >
            {proc ? "Enviando..." : "Testar envio"}
          </button>
          {msg && <span className="text-xs">{msg}</span>}
          <button onClick={verModelos} disabled={proc} className="rounded-controle border border-emerald-400 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">Ver modelos</button>
        </div>
      )}
      {modelosErro && <p className="mt-2 text-xs text-rose-600">{modelosErro}</p>}
      {modelos && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {ESPERADOS.map((nome) => {
            const m = modelos.find((x) => x.nome === nome);
            return (
              <li key={nome}>
                <code>{nome}</code>: {m ? `${STATUS_PT[m.status] ?? m.status} · ${m.categoria.toLowerCase()} · ${m.idioma}${m.motivo ? ` · motivo: ${m.motivo}` : ""}` : "— não cadastrado"}
              </li>
            );
          })}
          {modelos.filter((m) => !ESPERADOS.includes(m.nome)).map((m) => (
            <li key={m.nome + m.idioma} className="text-texto-suave"><code>{m.nome}</code>: {STATUS_PT[m.status] ?? m.status} · {m.categoria.toLowerCase()} · {m.idioma}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
