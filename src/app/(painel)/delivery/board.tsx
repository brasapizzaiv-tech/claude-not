"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatusDelivery, definirEntregador, reimprimirDelivery } from "./actions";

export type PedidoBoard = {
  id: string;
  numero: number | null;
  nome: string;
  telefone: string | null;
  tipo: "entrega" | "retirada";
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  status: string;
  origem: string;
  forma_pagamento: string | null;
  pago: boolean;
  taxa_entrega: number;
  desconto: number;
  criado_em: string;
  previsao_em: string | null;
  entregador_id: string | null;
  entregadorNome: string | null;
  subtotal: number;
};
export type EntregadorOpt = { id: string; nome: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ST: Record<string, { label: string; cor: string; bg: string; proximo?: string }> = {
  pendente: { label: "Pendente", cor: "text-rose-600", bg: "bg-rose-500/10", proximo: "aceito" },
  aceito: { label: "Aceito", cor: "text-blue-600", bg: "bg-blue-500/10", proximo: "em_preparo" },
  em_preparo: { label: "Em preparo", cor: "text-amber-600", bg: "bg-amber-500/10", proximo: "pronto" },
  pronto: { label: "Pronto", cor: "text-emerald-600", bg: "bg-emerald-500/10", proximo: "saiu" },
  saiu: { label: "Saiu p/ entrega", cor: "text-indigo-600", bg: "bg-indigo-500/10", proximo: "entregue" },
  entregue: { label: "Entregue", cor: "text-zinc-500", bg: "bg-zinc-500/10" },
  cancelado: { label: "Cancelado", cor: "text-zinc-400", bg: "bg-zinc-500/10" },
};
const ORIGEM: Record<string, string> = { app: "📱 App", whatsapp: "🟢 WhatsApp", instagram: "📸 Instagram", telefone: "📞 Telefone", balcao: "🏪 Balcão" };

function haQuanto(iso: string, nowMs: number) {
  if (!nowMs) return "";
  const min = Math.floor((nowMs - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 ? ` ${min % 60}min` : ""}`;
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function Board({ pedidos, entregadores }: { pedidos: PedidoBoard[]; entregadores: EntregadorOpt[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [fStatus, setFStatus] = useState<string>("ativos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fOrigem, setFOrigem] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [nowMs, setNowMs] = useState(() => new Date().getTime());

  // relógio p/ "há Xmin" e atraso, e auto-refresh do servidor
  useEffect(() => {
    const t = setInterval(() => { setNowMs(new Date().getTime()); router.refresh(); }, 30000);
    return () => clearInterval(t);
  }, [router]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (fStatus === "ativos" && (p.status === "entregue" || p.status === "cancelado")) return false;
      if (fStatus !== "ativos" && fStatus !== "todos" && p.status !== fStatus) return false;
      if (fTipo !== "todos" && p.tipo !== fTipo) return false;
      if (fOrigem !== "todos" && p.origem !== fOrigem) return false;
      if (q && !(`${p.numero} ${p.nome} ${p.telefone ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pedidos, fStatus, fTipo, fOrigem, busca]);

  const atrasado = (p: PedidoBoard) =>
    !!p.previsao_em && p.status !== "entregue" && p.status !== "cancelado" && nowMs > new Date(p.previsao_em).getTime();

  function avancar(p: PedidoBoard) {
    const prox = ST[p.status]?.proximo;
    if (!prox) return;
    start(async () => {
      const r = await definirStatusDelivery(p.id, prox);
      if (!r.ok && "mensagem" in r && r.mensagem) alert(r.mensagem);
      router.refresh();
    });
  }
  function trocarEntregador(p: PedidoBoard, id: string) {
    start(async () => { await definirEntregador(p.id, id || null); router.refresh(); });
  }
  function imprimir(p: PedidoBoard) {
    start(async () => { await reimprimirDelivery(p.id); });
  }

  const contagem = (s: string) => pedidos.filter((p) => (s === "ativos" ? p.status !== "entregue" && p.status !== "cancelado" : p.status === s)).length;

  return (
    <div>
      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {[["ativos", `Ativos (${contagem("ativos")})`], ["pendente", "Pendentes"], ["em_preparo", "Em preparo"], ["pronto", "Prontos"], ["saiu", "Saíram"], ["entregue", "Entregues"], ["todos", "Todos"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setFStatus(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${fStatus === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{lbl}</button>
          ))}
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700">
          <option value="todos">Entrega e retirada</option>
          <option value="entrega">Só entrega</option>
          <option value="retirada">Só retirada</option>
        </select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700">
          <option value="todos">Todas as origens</option>
          {Object.entries(ORIGEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº / nome / telefone" className="ml-auto w-56 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-zinc-700" />
      </div>

      {lista.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">Nenhum pedido aqui.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((p) => {
            const st = ST[p.status] ?? ST.pendente;
            const total = Math.round((p.subtotal + Number(p.taxa_entrega) - Number(p.desconto)) * 100) / 100;
            return (
              <div key={p.id} className={`flex flex-col rounded-2xl border p-3 ${atrasado(p) ? "border-rose-400" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-bold">#{p.numero ?? "—"}</span>
                  <span className="text-xs text-zinc-400">{haQuanto(p.criado_em, nowMs)}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${st.bg} ${st.cor}`}>{st.label}</span>
                </div>
                <Link href={`/delivery/${p.id}`} className="block">
                  <div className="font-semibold leading-tight">{p.nome}</div>
                  <div className="text-xs text-zinc-500">{p.telefone}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <span>{ORIGEM[p.origem] ?? p.origem}</span>
                    <span>·</span>
                    <span>{p.forma_pagamento ?? "—"}</span>
                    {!p.pago && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-600">a receber</span>}
                  </div>
                  <div className="mt-1.5 text-sm">
                    {p.tipo === "retirada" ? (
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">🏃 Retirada no balcão</span>
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-300">🛵 {[p.bairro, p.logradouro].filter(Boolean).join(" · ") || "Endereço no detalhe"}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{hora(p.criado_em)}</span>
                    <span className="font-bold">{brl(total)}</span>
                  </div>
                  {atrasado(p) && <div className="mt-1 text-xs font-bold text-rose-600">⏰ Atrasado</div>}
                </Link>

                <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  {st.proximo ? (
                    <button onClick={() => avancar(p)} disabled={proc} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white disabled:opacity-50">→ {ST[st.proximo].label}</button>
                  ) : (
                    <span className="flex-1 text-center text-xs text-zinc-400">{p.status === "entregue" ? "Concluído" : "—"}</span>
                  )}
                  {p.tipo === "entrega" && (
                    <select value={p.entregador_id ?? ""} onChange={(e) => trocarEntregador(p, e.target.value)} className="max-w-[7rem] rounded-lg border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700">
                      <option value="">Motoboy</option>
                      {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                  )}
                  <button onClick={() => imprimir(p)} disabled={proc} title="Reimprimir" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">🖨️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
