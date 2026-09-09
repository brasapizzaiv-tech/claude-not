"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarMinhaSolicitacao, pedirCompra, type Solicitacao } from "./compras-actions";

const fData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS: Record<Solicitacao["status"], { rotulo: string; cor: string }> = {
  pendente: { rotulo: "aguardando", cor: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  comprado: { rotulo: "comprado ✓", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  rejeitado: { rotulo: "não vai comprar", cor: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export function ComprasColab({ token, lista }: { token: string; lista: Solicitacao[] }) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();

  function enviar() {
    setMsg(null);
    start(async () => {
      const r = await pedirCompra(token, { item, quantidade: qtd, motivo, urgente });
      if (!r.ok) { setMsg(r.mensagem); return; }
      setItem(""); setQtd(""); setMotivo(""); setUrgente(false);
      setMsg("Pedido enviado! ✓");
      router.refresh();
    });
  }
  function cancelar(id: number) {
    if (!confirm("Desistir deste pedido?")) return;
    start(async () => {
      await cancelarMinhaSolicitacao(token, id);
      router.refresh();
    });
  }

  const cx = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const pendentes = lista.filter((s) => s.status === "pendente");
  const outras = lista.filter((s) => s.status !== "pendente");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">O que está faltando?</p>
        <input className={cx} placeholder="Ex.: concha grande, pano de prato, pilha AA" value={item} onChange={(e) => setItem(e.target.value)} maxLength={200} />
        <input className={`${cx} mt-2`} placeholder="Quantidade (ex.: 2, 1 caixa)" value={qtd} onChange={(e) => setQtd(e.target.value)} maxLength={60} />
        <textarea className={`${cx} mt-2`} rows={2} placeholder="Pra quê / observação (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
        <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-5 w-5 accent-orange-500" />
          🔥 É urgente (falta pra trabalhar)
        </label>
        <button
          onClick={enviar}
          disabled={proc || item.trim().length < 2}
          className="mt-3 w-full rounded-2xl bg-orange-500 p-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {proc ? "Enviando…" : "Enviar pedido"}
        </button>
        {msg && <p className={`mt-2 text-center text-sm ${msg.endsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
      </div>

      {pendentes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Aguardando compra</p>
          <ul className="space-y-2">
            {pendentes.map((s) => (
              <li key={s.id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <Linha s={s} />
                <button onClick={() => cancelar(s.id)} disabled={proc} className="mt-2 text-xs text-zinc-500 underline">
                  desistir do pedido
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outras.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Respondidos</p>
          <ul className="space-y-2">
            {outras.map((s) => (
              <li key={s.id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <Linha s={s} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {lista.length === 0 && (
        <p className="text-center text-sm text-zinc-500">Você ainda não pediu nada. Quando faltar algo, é só escrever aqui em cima. 🛠️</p>
      )}
    </div>
  );
}

function Linha({ s }: { s: Solicitacao }) {
  const st = STATUS[s.status];
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold text-zinc-900 dark:text-zinc-50">
          {s.urgente && s.status === "pendente" ? "🔥 " : ""}{s.item}
          {s.quantidade ? <span className="font-normal text-zinc-500"> · {s.quantidade}</span> : null}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cor}`}>{st.rotulo}</span>
      </div>
      {s.motivo && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{s.motivo}</p>}
      <p className="mt-0.5 text-xs text-zinc-400">pedido em {fData(s.criado_em)}{s.respondido_em ? ` · respondido ${fData(s.respondido_em)}` : ""}</p>
      {s.resposta && <p className="mt-1 rounded-xl bg-zinc-50 px-2 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">💬 {s.resposta}</p>}
    </div>
  );
}
