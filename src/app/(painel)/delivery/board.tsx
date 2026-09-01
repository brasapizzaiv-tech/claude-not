"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatusDelivery, definirEntregador, reimprimirDelivery } from "./actions";

const MapaPedidos = dynamic(() => import("./mapa").then((m) => m.MapaPedidos), { ssr: false });

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
  lat: number | null;
  lng: number | null;
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
const KANBAN_COLS = ["pendente", "aceito", "em_preparo", "pronto", "saiu"];

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

function CardPedido({ p, nowMs, proc, entregadores, atrasado, avancar, trocarEntregador, imprimir }: {
  p: PedidoBoard;
  nowMs: number;
  proc: boolean;
  entregadores: EntregadorOpt[];
  atrasado: (p: PedidoBoard) => boolean;
  avancar: (p: PedidoBoard) => void;
  trocarEntregador: (p: PedidoBoard, id: string) => void;
  imprimir: (p: PedidoBoard) => void;
}) {
  const st = ST[p.status] ?? ST.pendente;
  const total = Math.round((p.subtotal + Number(p.taxa_entrega) - Number(p.desconto)) * 100) / 100;
  return (
    <div className={`flex flex-col rounded-2xl border p-3 ${atrasado(p) ? "border-rose-400" : "border-zinc-200 dark:border-zinc-800"}`}>
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
}

export function Board({ pedidos, entregadores, origemMapa }: {
  pedidos: PedidoBoard[];
  entregadores: EntregadorOpt[];
  origemMapa: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [visao, setVisao] = useState<"cards" | "kanban" | "mapa">(() => {
    if (typeof window === "undefined") return "cards";
    try {
      const v = localStorage.getItem("delivery_visao");
      return v === "kanban" || v === "mapa" ? v : "cards";
    } catch { return "cards"; }
  });
  const [fStatus, setFStatus] = useState<string>("ativos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fOrigem, setFOrigem] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [nowMs, setNowMs] = useState(() => new Date().getTime());

  function mudarVisao(v: "cards" | "kanban" | "mapa") {
    setVisao(v);
    try { localStorage.setItem("delivery_visao", v); } catch { /* sem storage */ }
  }

  // relógio p/ "há Xmin" e atraso, e auto-refresh do servidor
  useEffect(() => {
    const t = setInterval(() => { setNowMs(new Date().getTime()); router.refresh(); }, 30000);
    return () => clearInterval(t);
  }, [router]);

  // Filtros de tipo/origem/busca valem em todas as visões; o de status só nos cards.
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (fTipo !== "todos" && p.tipo !== fTipo) return false;
      if (fOrigem !== "todos" && p.origem !== fOrigem) return false;
      if (q && !(`${p.numero} ${p.nome} ${p.telefone ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pedidos, fTipo, fOrigem, busca]);

  const lista = useMemo(() => base.filter((p) => {
    if (fStatus === "ativos") return p.status !== "entregue" && p.status !== "cancelado";
    if (fStatus === "todos") return true;
    return p.status === fStatus;
  }), [base, fStatus]);

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

  const cardProps = { nowMs, proc, entregadores, atrasado, avancar, trocarEntregador, imprimir };
  const ativos = base.filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  const pinos = ativos
    .filter((p) => p.tipo === "entrega" && p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, numero: p.numero, nome: p.nome, status: p.status, lat: Number(p.lat), lng: Number(p.lng), entregadorNome: p.entregadorNome, bairro: p.bairro }));

  return (
    <div>
      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
          {[["cards", "▦ Cards"], ["kanban", "▥ Kanban"], ["mapa", "🗺️ Mapa"]].map(([k, lbl]) => (
            <button key={k} onClick={() => mudarVisao(k as "cards" | "kanban" | "mapa")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${visao === k ? "bg-white shadow dark:bg-zinc-950" : "text-zinc-500"}`}>{lbl}</button>
          ))}
        </div>
        {visao === "cards" && (
          <div className="flex flex-wrap gap-1">
            {[["ativos", `Ativos (${contagem("ativos")})`], ["pendente", "Pendentes"], ["em_preparo", "Em preparo"], ["pronto", "Prontos"], ["saiu", "Saíram"], ["entregue", "Entregues"], ["todos", "Todos"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setFStatus(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${fStatus === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{lbl}</button>
            ))}
          </div>
        )}
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

      {visao === "mapa" ? (
        <MapaPedidos pinos={pinos} origem={origemMapa} />
      ) : visao === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {KANBAN_COLS.map((col) => {
            const doCol = ativos.filter((p) => p.status === col);
            const st = ST[col];
            return (
              <div key={col} className="w-72 shrink-0">
                <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 ${st.bg}`}>
                  <span className={`text-sm font-bold ${st.cor}`}>{st.label}</span>
                  <span className={`text-xs font-bold ${st.cor}`}>{doCol.length}</span>
                </div>
                <div className="space-y-2">
                  {doCol.map((p) => <CardPedido key={p.id} p={p} {...cardProps} />)}
                  {doCol.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800">vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : lista.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">Nenhum pedido aqui.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((p) => <CardPedido key={p.id} p={p} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}
