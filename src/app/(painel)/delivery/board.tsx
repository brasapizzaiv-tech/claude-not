"use client";

import { Icone, type NomeIcone } from "@/components/icone";
import { avisar, perguntar } from "@/components/dialogo";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatusDelivery, definirEntregador, reimprimirDelivery } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { META_DELIVERY_MIN, pedidoAtrasado } from "@/lib/delivery-atraso";
import { ListaPedidos } from "./lista";

// Alerta sonoro de pedido novo (WebAudio, sem arquivo). O navegador só toca
// depois de um clique na página — por isso o botão de som no topo.
let audioCtx: AudioContext | null = null;
function tocarAlerta() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((dt, i) => {
      const o = audioCtx!.createOscillator(); const g = audioCtx!.createGain();
      o.type = "sine"; o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(audioCtx!.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* sem áudio */ }
}
const TEMPOS_ACEITE = [30, 40, 50, 60, 75, 90];

const MapaPedidos = dynamic(() => import("./mapa").then((m) => m.MapaPedidos), { ssr: false });
const MapaPedidosGoogle = dynamic(() => import("./mapa-google").then((m) => m.MapaPedidosGoogle), { ssr: false });

export type PedidoBoard = {
  id: string;
  numero: number | null;
  nome: string;
  telefone: string | null;
  tipo: "entrega" | "retirada";
  logradouro: string | null;
  numero_casa: string | null;
  complemento: string | null;
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
  agendado_para: string | null;
  aceito_em: string | null;
  preparo_em: string | null;
  pronto_em: string | null;
  saiu_em: string | null;
  entregue_em: string | null;
  itens: { descricao: string; qtd: number; preco: number }[];
  turno: string | null;
  turno_data: string | null;
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
  entregue: { label: "Entregue", cor: "text-texto-suave", bg: "bg-superficie-suave" },
  cancelado: { label: "Cancelado", cor: "text-texto-fraco", bg: "bg-superficie-suave" },
};
// Pular etapa (14/10/2026): qualquer status dá pra escolher direto — o Kern,
// por exemplo, vai de "aceito" pra "entregue" sem passar pelo meio.
const PULAR = ["aceito", "em_preparo", "pronto", "saiu", "entregue"] as const;

const ORIGEM: Record<string, { label: string; icone: NomeIcone }> = {
  app: { label: "App", icone: "celular" },
  whatsapp: { label: "WhatsApp", icone: "zap" },
  instagram: { label: "Instagram", icone: "camera" },
  telefone: { label: "Telefone", icone: "telefone" },
  balcao: { label: "Balcão", icone: "loja" },
  convenio: { label: "Convênio", icone: "empresa" },
};
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

function CardPedido({ p, nowMs, proc, entregadores, atrasado, avancar, irPara, trocarEntregador, imprimir }: {
  p: PedidoBoard;
  nowMs: number;
  proc: boolean;
  entregadores: EntregadorOpt[];
  atrasado: (p: PedidoBoard) => boolean;
  avancar: (p: PedidoBoard, extra?: { tempoMin?: number; motivo?: string }) => void;
  irPara: (p: PedidoBoard, status: string) => void;
  trocarEntregador: (p: PedidoBoard, id: string) => void;
  imprimir: (p: PedidoBoard) => void;
}) {
  const st = ST[p.status] ?? ST.pendente;
  const [tempo, setTempo] = useState(40);
  async function recusar() {
    const motivo = await perguntar("Motivo pra recusar/cancelar este pedido (o cliente vai ver):", "");
    if (motivo && motivo.trim()) avancar({ ...p, status: "__cancelar" } as PedidoBoard, { motivo: motivo.trim() });
  }
  const total = Math.round((p.subtotal + Number(p.taxa_entrega) - Number(p.desconto)) * 100) / 100;
  return (
    <div className={`flex flex-col rounded-cartao bg-painel-cartao p-3 ${atrasado(p) ? "ring-2 ring-erro" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-bold">#{p.numero ?? "—"}</span>
        <span className="text-xs text-texto-fraco">{haQuanto(p.criado_em, nowMs)}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${st.bg}  ${st.cor}`}>{st.label}</span>
      </div>
      {p.agendado_para && p.status !== "entregue" && p.status !== "cancelado" && (
        <div className={`mb-2 rounded-controle px-2 py-1 text-xs font-bold ${nowMs >= new Date(p.agendado_para).getTime() - 45 * 60000 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"}`}>
          <Icone nome="agenda" tamanho={13} className="mr-1" /> Agendado pra {hora(p.agendado_para)}{nowMs >= new Date(p.agendado_para).getTime() - 45 * 60000 ? " · hora de preparar" : ""}
        </div>
      )}
      <Link href={`/delivery/${p.id}`} className="block">
        <div className="font-semibold leading-tight">{p.nome}</div>
        <div className="font-numero text-xs text-texto-suave">{p.telefone}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-texto-suave">
          <span className="inline-flex items-center gap-1">
            {ORIGEM[p.origem] ? <><Icone nome={ORIGEM[p.origem].icone} tamanho={12} /> {ORIGEM[p.origem].label}</> : p.origem}
          </span>
          <span>·</span>
          <span>{p.forma_pagamento ?? "—"}</span>
          {!p.pago && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-600">a receber</span>}
        </div>
        <div className="mt-1.5 text-sm">
          {p.tipo === "retirada" ? (
            <span className="inline-flex items-center gap-1 font-medium text-texto-suave"><Icone nome="loja" tamanho={13} /> Retirada no balcão</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-texto-suave"><Icone nome="entrega" tamanho={13} /> {[p.bairro, p.logradouro].filter(Boolean).join(" · ") || "Endereço no detalhe"}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="font-numero text-xs text-texto-fraco">{hora(p.criado_em)}</span>
          <span className="font-numero font-semibold tracking-apertada text-texto">{brl(total)}</span>
        </div>
        {atrasado(p) && (
            <div className="mt-1 flex items-center gap-1 text-xs font-bold text-rose-600"><Icone nome="atraso" tamanho={13} /> Atrasado</div>
          )}
      </Link>

      <div className="mt-2 flex items-center gap-1.5 border-t border-borda pt-2">
        {p.status === "pendente" ? (
          <>
            {!p.agendado_para && (
              <select value={tempo} onChange={(e) => setTempo(Number(e.target.value))} title="Tempo prometido" className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-1.5 text-xs text-texto">
                {TEMPOS_ACEITE.map((t) => <option key={t} value={t}>{t} min</option>)}
              </select>
            )}
            <button onClick={() => avancar(p, { tempoMin: p.agendado_para ? undefined : tempo })} disabled={proc} className="min-h-11 flex-1 rounded-controle bg-texto text-xs font-bold text-fundo transition hover:opacity-90 disabled:opacity-50">Aceitar</button>
            <button onClick={recusar} disabled={proc} title="Recusar com motivo" className="flex min-h-11 items-center rounded-controle border border-borda-forte px-2 text-xs text-erro"><Icone nome="fechar" tamanho={13} titulo="Recusar" /></button>
          </>
        ) : st.proximo ? (
          <>
            <button onClick={() => avancar(p)} disabled={proc} className="min-h-11 flex-1 rounded-controle bg-texto text-xs font-bold text-fundo transition hover:opacity-90 disabled:opacity-50">{ST[st.proximo].label}</button>
            <select
              value=""
              onChange={(e) => { if (e.target.value) irPara(p, e.target.value); }}
              disabled={proc}
              title="Pular direto pra outra etapa"
              aria-label="Pular direto pra outra etapa"
              className="min-h-11 w-11 rounded-controle border border-borda-forte bg-transparent px-1 text-xs text-texto"
            >
              <option value="">⋯</option>
              {PULAR.filter((k) => k !== p.status).map((k) => <option key={k} value={k}>{ST[k].label}</option>)}
            </select>
          </>
        ) : (
          <span className="flex-1 text-center text-xs text-texto-fraco">{p.status === "entregue" ? "Concluído" : "—"}</span>
        )}
        {p.tipo === "entrega" && (
          <select value={p.entregador_id ?? ""} onChange={(e) => trocarEntregador(p, e.target.value)} className="min-h-11 max-w-[7rem] rounded-controle border border-borda-forte bg-transparent px-1.5 text-xs text-texto">
            <option value="">Motoboy</option>
            {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        <button onClick={() => imprimir(p)} disabled={proc} title="Reimprimir" className="flex min-h-11 items-center rounded-controle border border-borda-forte px-2 text-texto-suave transition hover:bg-superficie-suave"><Icone nome="imprimir" tamanho={14} titulo="Reimprimir" /></button>
      </div>
    </div>
  );
}

export type BoyNoMapa = { id: string; nome: string; lat: number; lng: number; em: string };

export function Board({ pedidos, entregadores, boys = [], origemMapa, googleKey = null, turnoAtual = null }: {
  pedidos: PedidoBoard[];
  entregadores: EntregadorOpt[];
  boys?: BoyNoMapa[]; // posição dos entregadores (GPS do app), últimos 20 min
  origemMapa: { lat: number; lng: number } | null;
  googleKey?: string | null; // chave de navegador do Google Maps; sem ela, OpenStreetMap
  turnoAtual?: string | null; // "AAAA-MM-DD|Noite" — o filtro de turno abre nele
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  // Abre na LISTA (layout novo, out/2026); quadro de colunas e mapa ficam a um
  // botão. A escolha fica lembrada neste navegador.
  const [visao, setVisao] = useState<"lista" | "kanban" | "mapa">(() => {
    if (typeof window === "undefined") return "lista";
    try {
      const v = localStorage.getItem("delivery_visao2");
      return v === "kanban" || v === "mapa" ? v : "lista";
    } catch { return "lista"; }
  });
  const [fStatus, setFStatus] = useState<string>("ativos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fOrigem, setFOrigem] = useState<string>("todos");
  // Turno (numeração recomeça a cada um): abre no de agora, se tiver pedido nele.
  const chaveTurno = (p: PedidoBoard) => (p.turno && p.turno_data ? `${p.turno_data}|${p.turno}` : "");
  const turnos = useMemo(() => [...new Set(pedidos.map(chaveTurno).filter(Boolean))].sort().reverse(), [pedidos]);
  const [fTurno, setFTurno] = useState<string>(() => (turnoAtual && pedidos.some((p) => chaveTurno(p) === turnoAtual) ? turnoAtual : "todos"));
  const nomeTurno = (k: string) => { const [d, t] = k.split("|"); return `${t} · ${d.slice(8, 10)}/${d.slice(5, 7)}${k === turnoAtual ? " (agora)" : ""}`; };
  const [busca, setBusca] = useState("");
  const [nowMs, setNowMs] = useState(() => new Date().getTime());
  // Som de pedido novo (lembrado neste navegador).
  const [som, setSom] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("delivery_som") === "1"; } catch { return false; }
  });
  const somRef = useRef(som);
  useEffect(() => { somRef.current = som; }, [som]);
  function alternarSom() {
    const novo = !som;
    setSom(novo);
    try { localStorage.setItem("delivery_som", novo ? "1" : "0"); } catch { /* sem storage */ }
    if (novo) tocarAlerta(); // o clique libera o áudio e serve de teste
  }

  // Tempo real: pedido novo → som + recarrega; qualquer mudança → recarrega.
  // O refresh de 30 s abaixo continua como reserva se o canal cair.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("delivery_pedidos_board")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_pedidos" }, () => {
        if (somRef.current) tocarAlerta();
        router.refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_pedidos" }, () => { router.refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [router]);

  // Título da aba avisa quando tem pedido esperando aceite.
  const pendentes = pedidos.filter((p) => p.status === "pendente").length;
  useEffect(() => {
    const antes = document.title;
    if (pendentes > 0) document.title = `🔔 (${pendentes}) pedido${pendentes > 1 ? "s" : ""} novo${pendentes > 1 ? "s" : ""} · Delivery`;
    return () => { document.title = antes; };
  }, [pendentes]);

  function mudarVisao(v: "lista" | "kanban" | "mapa") {
    setVisao(v);
    try { localStorage.setItem("delivery_visao2", v); } catch { /* sem storage */ }
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
      if (fTurno !== "todos" && chaveTurno(p) !== fTurno) return false;
      if (q && !(`${p.numero} ${p.nome} ${p.telefone ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pedidos, fTipo, fOrigem, fTurno, busca]);

  // Filtros em pílula da lista. "Na cozinha" junta aceito e em preparo.
  const FILTROS: { k: string; rotulo: string; casa: (p: PedidoBoard) => boolean }[] = [
    { k: "ativos", rotulo: "Em andamento", casa: (p) => p.status !== "entregue" && p.status !== "cancelado" },
    { k: "pendente", rotulo: "Novos", casa: (p) => p.status === "pendente" },
    { k: "cozinha", rotulo: "Na cozinha", casa: (p) => p.status === "aceito" || p.status === "em_preparo" },
    { k: "pronto", rotulo: "Prontos", casa: (p) => p.status === "pronto" },
    { k: "saiu", rotulo: "Na rua", casa: (p) => p.status === "saiu" },
    { k: "entregue", rotulo: "Entregues", casa: (p) => p.status === "entregue" },
  ];
  const filtroAtual = FILTROS.find((x) => x.k === fStatus) ?? FILTROS[0];
  const lista = useMemo(() => base.filter(filtroAtual.casa)
    // Atrasados primeiro, depois novos, depois o mais antigo em cima.
    .sort((a, b) => Number(pedidoAtrasado(b, nowMs)) - Number(pedidoAtrasado(a, nowMs)) || Number(b.status === "pendente") - Number(a.status === "pendente") || (fStatus === "entregue" ? b.criado_em.localeCompare(a.criado_em) : a.criado_em.localeCompare(b.criado_em))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, fStatus, nowMs]);

  const atrasado = (p: PedidoBoard) => pedidoAtrasado(p, nowMs);

  // Tempo médio do dia (entregues hoje): entrou → entregue.
  const hojeSP = new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const temposHoje = pedidos
    .filter((p) => p.entregue_em && new Date(p.criado_em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeSP)
    .map((p) => (new Date(p.entregue_em!).getTime() - new Date(p.criado_em).getTime()) / 60000)
    .filter((n) => n > 0 && n < 240);
  const tempoMedio = temposHoje.length ? Math.round(temposHoje.reduce((s, n) => s + n, 0) / temposHoje.length) : null;
  const turnoTexto = (() => {
    const d = new Date(nowMs);
    const dia = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" }).replace("-feira", "");
    const h = Number(d.toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }));
    return `${h < 17 ? "almoço" : "noite"} de ${dia}`;
  })();

  function avancar(p: PedidoBoard, extra?: { tempoMin?: number; motivo?: string }) {
    // status "__cancelar" = recusa com motivo (vinda do card)
    const prox = p.status === "__cancelar" ? "cancelado" : ST[p.status]?.proximo;
    if (!prox) return;
    start(async () => {
      const r = await definirStatusDelivery(p.id, prox, extra);
      if (!r.ok && "mensagem" in r && r.mensagem) void avisar(r.mensagem);
      if (r.ok && "aviso" in r && r.aviso) void avisar(r.aviso);
      router.refresh();
    });
  }
  function irPara(p: PedidoBoard, status: string) {
    start(async () => {
      const r = await definirStatusDelivery(p.id, status);
      if (!r.ok && "mensagem" in r && r.mensagem) void avisar(r.mensagem);
      if (r.ok && "aviso" in r && r.aviso) void avisar(r.aviso);
      router.refresh();
    });
  }
  function trocarEntregador(p: PedidoBoard, id: string) {
    start(async () => { await definirEntregador(p.id, id || null); router.refresh(); });
  }
  function imprimir(p: PedidoBoard) {
    start(async () => { await reimprimirDelivery(p.id); });
  }

  const contagem = (k: string) => base.filter((FILTROS.find((x) => x.k === k) ?? FILTROS[0]).casa).length;

  const cardProps = { nowMs, proc, entregadores, atrasado, avancar, irPara, trocarEntregador, imprimir };
  const ativos = base.filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  const pinos = ativos
    .filter((p) => p.tipo === "entrega" && p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, numero: p.numero, nome: p.nome, status: p.status, lat: Number(p.lat), lng: Number(p.lng), entregadorNome: p.entregadorNome, bairro: p.bairro }));

  return (
    <div className="flex flex-col gap-4 px-4 py-5 md:px-[30px] md:py-[26px]">
      {/* ---------- topo ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="shrink-0">
          <p className="rotulo">Delivery · {turnoTexto}</p>
          <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Pedidos</h1>
        </div>
        <label className="flex h-[46px] w-full max-w-[420px] flex-1 items-center gap-2.5 rounded-controle bg-painel-cartao px-4 shadow-controle">
          <Icone nome="buscar" tamanho={18} className="shrink-0 text-texto-fraco" />
          <span className="sr-only">Buscar pedido, cliente ou telefone</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido, cliente, telefone…" className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-texto placeholder:text-texto-fraco" />
        </label>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={alternarSom}
            aria-pressed={som}
            title={som ? "Som de pedido novo ligado — clique pra desligar" : "Ligar som de pedido novo"}
            className="btn-secundario w-[46px] !px-0"
          >
            <Icone nome={som ? "campainha" : "mudo"} tamanho={17} titulo={som ? "Som ligado" : "Som desligado"} />
          </button>
          <button type="button" onClick={() => mudarVisao(visao === "kanban" ? "lista" : "kanban")} className="btn-secundario text-sm">
            {visao === "kanban" ? "Ver em lista" : "Ver em quadro"}
          </button>
          <button type="button" onClick={() => mudarVisao(visao === "mapa" ? "lista" : "mapa")} className="btn-secundario text-sm">
            {visao === "mapa" ? "Ver em lista" : "Ver no mapa"}
          </button>
          <Link href="/delivery/novo" className="btn-principal text-sm">
            <Icone nome="novo" tamanho={16} /> Pedido por telefone
          </Link>
          <details className="relative">
            <summary className="btn-secundario w-[46px] cursor-pointer list-none !px-0" aria-label="Ajustes do delivery">
              <Icone nome="ajustes" tamanho={17} />
            </summary>
            <div className="cartao absolute right-0 z-30 mt-2 flex w-56 flex-col p-2">
              {([
                ["/salao/cardapio", "Cardápio", "caderno"], ["/delivery/vitrine", "Vitrine do app", "loja"], ["/delivery/areas", "Áreas e tele", "mapa"],
                ["/delivery/cupons", "Cupons", "etiqueta"], ["/delivery/cashback", "Cashback", "presente"], ["/delivery/campanhas", "Campanhas", "megafone"],
                ["/delivery/kern", "Kern", "empresa"], ["/delivery/relatorios", "Relatórios", "grafico"], ["/delivery/entregadores", "Entregadores", "entrega"],
                ["/delivery/config", "Configurações", "ajustes"],
              ] as [string, string, NomeIcone][]).map(([href, rotulo, ico]) => (
                <Link key={href} href={href} className="flex min-h-11 items-center gap-2.5 rounded-controle px-2.5 text-sm text-texto-suave hover:bg-superficie-suave hover:text-texto">
                  <Icone nome={ico} tamanho={16} /> {rotulo}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>

      {/* ---------- filtros em pílula ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((x) => {
          const ativo = fStatus === x.k || (x.k === "ativos" && !FILTROS.some((y) => y.k === fStatus));
          const n = contagem(x.k);
          const urgente = x.k === "pendente" && n > 0;
          return (
            <button
              key={x.k}
              type="button"
              onClick={() => setFStatus(x.k)}
              aria-pressed={ativo}
              className={`flex min-h-11 items-center gap-2 rounded-full pl-4 pr-2 text-[13.5px] ${ativo ? "bg-marca-escuro font-semibold text-painel-foco-texto dark:bg-painel-foco-fundo" : "bg-painel-cartao text-texto shadow-controle"}`}
            >
              {x.rotulo}
              <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${ativo ? "bg-primaria text-marca-sobre-primaria" : urgente ? "bg-urgente-solido text-marca-escuro" : "bg-superficie-suave text-texto-suave"}`}>
                {n}
              </span>
            </button>
          );
        })}
        <select value={fTurno} onChange={(e) => setFTurno(e.target.value)} aria-label="Turno" className="min-h-11 rounded-full bg-painel-cartao px-3 text-[13.5px] font-semibold text-texto shadow-controle">
          <option value="todos">Todos os turnos</option>
          {turnos.map((k) => <option key={k} value={k}>{nomeTurno(k)}</option>)}
        </select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Entrega ou retirada" className="min-h-11 rounded-full bg-painel-cartao px-3 text-[13.5px] text-texto shadow-controle">
          <option value="todos">Entrega e retirada</option>
          <option value="entrega">Só entrega</option>
          <option value="retirada">Só retirada</option>
        </select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Origem do pedido" className="min-h-11 rounded-full bg-painel-cartao px-3 text-[13.5px] text-texto shadow-controle">
          <option value="todos">Todas as origens</option>
          {Object.entries(ORIGEM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="ml-auto text-[13px] text-texto-suave">
          Tempo médio <span className="font-bold text-texto">{tempoMedio == null ? "—" : `${tempoMedio} min`}</span> · meta {META_DELIVERY_MIN} min
        </span>
      </div>

      {visao === "mapa" ? (
        googleKey ? <MapaPedidosGoogle pinos={pinos} origem={origemMapa} chave={googleKey} boys={boys} /> : <MapaPedidos pinos={pinos} origem={origemMapa} boys={boys} />
      ) : visao === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {KANBAN_COLS.map((col) => {
            const doCol = ativos.filter((p) => p.status === col);
            const st = ST[col];
            return (
              <div key={col} className="w-72 shrink-0">
                <div className={`mb-2 flex items-center justify-between rounded-controle px-3 py-2 ${st.bg}`}>
                  <span className={`text-sm font-bold ${st.cor}`}>{st.label}</span>
                  <span className={`text-xs font-bold ${st.cor}`}>{doCol.length}</span>
                </div>
                <div className="space-y-2">
                  {doCol.map((p) => <CardPedido key={p.id} p={p} {...cardProps} />)}
                  {doCol.length === 0 && <p className="rounded-cartao bg-painel-cartao py-6 text-center text-xs text-texto-fraco">vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListaPedidos pedidos={lista} todos={pedidos} {...cardProps} />
      )}
    </div>
  );
}
