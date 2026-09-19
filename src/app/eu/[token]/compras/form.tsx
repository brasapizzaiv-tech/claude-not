"use client";

import { Icone } from "@/components/icone";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarMinhaSolicitacao, pedirCompra, type Solicitacao } from "./compras-actions";

const fData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

const COR: Record<Solicitacao["status"], string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  comprado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejeitado: "bg-zinc-200 text-texto-suave dark:bg-zinc-800 ",
};
function rotulo(s: Solicitacao) {
  if (s.status === "pendente") return "aguardando";
  if (s.status === "comprado") return s.tipo === "manutencao" ? "feito ✓" : "comprado ✓";
  return s.tipo === "manutencao" ? "não vai fazer" : "não vai comprar";
}

export function ComprasColab({ token, lista }: { token: string; lista: Solicitacao[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"compra" | "manutencao">("compra");
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [proc, start] = useTransition();

  function enviar() {
    setMsg(null);
    start(async () => {
      const r = await pedirCompra(token, { tipo, item, quantidade: tipo === "compra" ? qtd : "", motivo, urgente });
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

  const cx = "w-full rounded-cartao border border-borda-forte bg-white px-3 py-3 text-base text-texto outline-none focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-900 dark:text-zinc-50";
  const pendentes = lista.filter((s) => s.status === "pendente");
  const outras = lista.filter((s) => s.status !== "pendente");

  return (
    <div className="space-y-4">
      <div className="rounded-cartao border border-borda bg-painel-cartao p-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["compra", "manutencao"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-cartao px-3 py-2.5 text-sm font-semibold ${tipo === t ? "bg-orange-500 text-white" : "bg-superficie-suave text-texto-suave  "}`}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <Icone nome={t === "compra" ? "compras" : "ferramenta"} tamanho={14} /> {t === "compra" ? "Comprar" : "Manutenção"}
              </span>
            </button>
          ))}
        </div>
        <p className="mb-2 text-sm font-semibold text-texto">
          {tipo === "compra" ? "O que está faltando?" : "O que precisa de conserto?"}
        </p>
        <input
          className={cx}
          placeholder={tipo === "compra" ? "Ex.: concha grande, pano de prato, pilha AA" : "Ex.: porta do freezer não fecha, torneira pingando"}
          value={item}
          onChange={(e) => setItem(e.target.value)}
          maxLength={200}
        />
        {tipo === "compra" && (
          <input className={`${cx} mt-2`} placeholder="Quantidade (ex.: 2, 1 caixa)" value={qtd} onChange={(e) => setQtd(e.target.value)} maxLength={60} />
        )}
        <textarea className={`${cx} mt-2`} rows={2} placeholder="Pra quê / observação (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
        <label className="mt-2 flex items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-5 w-5 accent-orange-500" />
          <Icone nome="fogo" tamanho={14} className="mr-1" /> É urgente (atrapalha o trabalho)
        </label>
        <button
          onClick={enviar}
          disabled={proc || item.trim().length < 2}
          className="mt-3 w-full rounded-cartao bg-orange-500 p-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {proc ? "Enviando…" : "Enviar pedido"}
        </button>
        {msg && <p className={`mt-2 text-center text-sm ${msg.endsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
      </div>

      {pendentes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-texto-fraco">Aguardando</p>
          <ul className="space-y-2">
            {pendentes.map((s) => (
              <li key={s.id} className="rounded-cartao border border-borda bg-painel-cartao p-3">
                <Linha s={s} />
                <button onClick={() => cancelar(s.id)} disabled={proc} className="mt-2 text-xs text-texto-suave underline">
                  desistir do pedido
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outras.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-texto-fraco">Respondidos</p>
          <ul className="space-y-2">
            {outras.map((s) => (
              <li key={s.id} className="rounded-cartao border border-borda bg-painel-cartao p-3">
                <Linha s={s} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {lista.length === 0 && (
        <p className="text-center text-sm text-texto-suave">Você ainda não pediu nada. Quando faltar algo, é só escrever aqui em cima.</p>
      )}
    </div>
  );
}

function Linha({ s }: { s: Solicitacao }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold text-texto">
          {s.urgente && s.status === "pendente" && <Icone nome="fogo" tamanho={13} className="mr-1 text-red-600" />}
          {s.tipo === "manutencao" && <Icone nome="ferramenta" tamanho={13} className="mr-1 text-texto-suave" />}
          {s.item}
          {s.quantidade ? <span className="font-normal text-texto-suave"> · {s.quantidade}</span> : null}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR[s.status]}`}>{rotulo(s)}</span>
      </div>
      {s.motivo && <p className="mt-0.5 text-sm text-texto-suave">{s.motivo}</p>}
      <p className="mt-0.5 text-xs text-texto-fraco">pedido em {fData(s.criado_em)}{s.respondido_em ? ` · respondido ${fData(s.respondido_em)}` : ""}</p>
      {s.resposta && <p className="mt-1 rounded-cartao bg-superficie-suave px-2 py-1 text-sm text-texto-suave"><span className="inline-flex items-start gap-1.5"><Icone nome="conversa" tamanho={13} className="mt-0.5" /> {s.resposta}</span></p>}
    </div>
  );
}
