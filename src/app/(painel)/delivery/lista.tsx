"use client";

import Link from "next/link";
import { useState } from "react";
import { Icone } from "@/components/icone";
import { perguntar } from "@/components/dialogo";
import { minutosDoPedido, pedidoAtrasado } from "@/lib/delivery-atraso";
import type { EntregadorOpt, PedidoBoard } from "./board";

// Lista de pedidos do delivery com o painel do pedido ao lado (layout novo,
// out/2026 — docs/referencia-layout/pedidos-delivery.html).
//
// Linha: nº, cliente (bairro embaixo), itens, total, pagamento, situação e
// tempo. Painel (cartão de foco): situação, endereço, linha do tempo
// recebido → cozinha → pronto → saiu, a conta e o botão da PRÓXIMA ação.

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valor = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const total = (p: PedidoBoard) => Math.round((p.subtotal + Number(p.taxa_entrega) - Number(p.desconto)) * 100) / 100;

/** Situação na lista: o que importa pra quem opera. */
export function situacao(p: PedidoBoard, agora: number): { texto: string; cls: string } {
  if (p.status === "cancelado") return { texto: "Cancelado", cls: "pilula pilula-neutra" };
  if (p.status === "entregue") return { texto: "Entregue", cls: "pilula pilula-ok" };
  if (pedidoAtrasado(p, agora)) return { texto: "Atrasado", cls: "pilula pilula-urgente" };
  if (p.status === "pendente") return { texto: "Novo", cls: "pilula pilula-urgente-solido" };
  if (p.status === "aceito" || p.status === "em_preparo") return { texto: "Na cozinha", cls: "pilula" };
  if (p.status === "pronto") return { texto: p.tipo === "retirada" ? "Pronto p/ retirar" : "Pronto", cls: "pilula pilula-grafite" };
  if (p.status === "saiu") return { texto: "Na rua", cls: "pilula pilula-info" };
  return { texto: p.status, cls: "pilula pilula-neutra" };
}

function pagamento(p: PedidoBoard): { texto: string; cls: string } {
  const forma = p.forma_pagamento ?? "—";
  if (p.pago) return { texto: /pix/i.test(forma) ? "Pix" : forma, cls: "pilula pilula-ok" };
  return { texto: forma, cls: "pilula pilula-neutra" };
}

function resumoItens(p: PedidoBoard) {
  if (p.itens.length === 0) return "—";
  return p.itens.map((i) => `${i.qtd > 1 ? `${i.qtd}× ` : ""}${i.descricao}`).join(" · ");
}

/** A próxima ação do pedido, no texto do botão. */
const PROXIMA: Record<string, { status: string; texto: string } | undefined> = {
  pendente: { status: "aceito", texto: "Aceitar pedido" },
  aceito: { status: "em_preparo", texto: "Mandar pra cozinha" },
  em_preparo: { status: "pronto", texto: "Marcar como pronto" },
  pronto: { status: "saiu", texto: "Saiu para entrega" },
  saiu: { status: "entregue", texto: "Marcar como entregue" },
};
function proxima(p: PedidoBoard) {
  if (p.status === "pronto" && p.tipo === "retirada") return { status: "entregue", texto: "Cliente retirou" };
  return PROXIMA[p.status];
}

// Escritas por extenso (o Tailwind só gera a classe que aparece inteira no código).
const COLUNAS = "md:grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1.5fr)_92px_96px_112px_64px]";

export function ListaPedidos({
  pedidos, todos, nowMs, proc, entregadores, avancar, irPara, trocarEntregador, imprimir,
}: {
  pedidos: PedidoBoard[];
  todos: PedidoBoard[];
  nowMs: number;
  proc: boolean;
  entregadores: EntregadorOpt[];
  avancar: (p: PedidoBoard, extra?: { tempoMin?: number; motivo?: string }) => void;
  irPara: (p: PedidoBoard, status: string) => void;
  trocarEntregador: (p: PedidoBoard, id: string) => void;
  imprimir: (p: PedidoBoard) => void;
}) {
  const [selId, setSelId] = useState<string | null>(null);
  // Sem escolha: o primeiro atrasado, senão o primeiro da lista.
  const sel = pedidos.find((p) => p.id === selId) ?? pedidos.find((p) => pedidoAtrasado(p, nowMs)) ?? pedidos[0] ?? null;

  // Entregadores: livre ou com N entregas na rua.
  const naRua = new Map<string, number>();
  for (const p of todos) if (p.status === "saiu" && p.entregador_id) naRua.set(p.entregador_id, (naRua.get(p.entregador_id) ?? 0) + 1);
  const nLivres = entregadores.filter((e) => !naRua.get(e.id)).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---------- lista ---------- */}
      <section className="cartao min-w-0 p-2" aria-label="Pedidos">
        {pedidos.length === 0 ? (
          <p className="py-16 text-center text-sm text-texto-suave">Nenhum pedido neste filtro.</p>
        ) : (
          <>
            <div className={`rotulo hidden gap-3 px-3.5 pb-2 pt-2.5 md:grid ${COLUNAS}`}>
              <span>Pedido</span><span>Cliente</span><span>Itens</span><span className="text-right">Total</span><span>Pagto.</span><span>Situação</span><span className="text-right">Tempo</span>
            </div>
            <ul className="flex flex-col">
              {pedidos.map((p) => {
                const ativo = sel?.id === p.id;
                const atrasado = pedidoAtrasado(p, nowMs);
                const sit = situacao(p, nowMs);
                const pag = pagamento(p);
                const min = p.entregue_em
                  ? Math.max(0, Math.round((new Date(p.entregue_em).getTime() - new Date(p.criado_em).getTime()) / 60000))
                  : minutosDoPedido(p, nowMs);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(p.id)}
                      aria-pressed={ativo}
                      className={`grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-controle px-3.5 py-2.5 text-left transition ${COLUNAS} md:gap-y-0 ${
                        ativo
                          ? "bg-destaque shadow-[inset_0_0_0_2px_var(--marca-primaria)]"
                          : p.status === "pendente"
                            ? "bg-painel-fundo hover:bg-superficie-suave"
                            : "hover:bg-superficie-suave"
                      }`}
                    >
                      <span className="font-numero text-[15px] font-bold text-texto">#{p.numero ?? "—"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-texto">{p.nome}</span>
                        <span className="block truncate text-[12.5px] text-texto-suave">
                          {p.tipo === "retirada" ? "Retirada no balcão" : p.bairro || "—"}
                          {p.agendado_para && p.status !== "entregue" && p.status !== "cancelado" ? ` · agendado ${hora(p.agendado_para)}` : ""}
                        </span>
                      </span>
                      <span className="hidden min-w-0 truncate text-[13px] text-texto-suave md:block">{resumoItens(p)}</span>
                      <span className="hidden text-right font-numero text-[15px] font-bold text-texto md:block">{valor(total(p))}</span>
                      <span className="hidden md:block"><span className={pag.cls}>{pag.texto}</span></span>
                      <span className="col-start-2 md:col-start-auto"><span className={sit.cls}>{sit.texto}</span></span>
                      <span className={`row-start-1 text-right font-numero text-sm font-bold md:row-start-auto ${atrasado ? "text-urgente-texto" : "text-texto"}`}>
                        {/* Entregue muito depois (convênio marcado no fim do dia): mostra o dia, não 1777 min. */}
                        {p.entregue_em && min > 180
                          ? new Date(p.entregue_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
                          : `${min} min`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ---------- painel do pedido ---------- */}
      <aside className="flex flex-col gap-3.5" aria-label="Pedido selecionado">
        {sel && <PainelPedido p={sel} nowMs={nowMs} proc={proc} entregadores={entregadores} avancar={avancar} irPara={irPara} trocarEntregador={trocarEntregador} imprimir={imprimir} />}

        <div className="cartao flex flex-col gap-2.5 px-[18px] py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-numero text-base font-bold text-texto">Entregadores</h2>
            <span className="text-xs text-texto-suave">{naRua.size} na rua · {nLivres} {nLivres === 1 ? "livre" : "livres"}</span>
          </div>
          {entregadores.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhum entregador cadastrado. <Link href="/delivery/entregadores" className="font-semibold text-texto-marca hover:underline">Cadastrar</Link></p>
          ) : (
            entregadores.map((e, i) => {
              const n = naRua.get(e.id) ?? 0;
              return (
                <div key={e.id} className="flex items-center gap-2.5">
                  <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${i % 2 === 0 ? "bg-primaria text-marca-sobre-primaria" : "bg-destaque text-texto-marca-pilula"}`}>
                    {e.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{e.nome}</span>
                  <span className={n ? "pilula" : "pilula pilula-ok"}>{n ? `${n} ${n === 1 ? "entrega" : "entregas"}` : "livre"}</span>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

function PainelPedido({ p, nowMs, proc, entregadores, avancar, irPara, trocarEntregador, imprimir }: {
  p: PedidoBoard;
  nowMs: number;
  proc: boolean;
  entregadores: EntregadorOpt[];
  avancar: (p: PedidoBoard, extra?: { tempoMin?: number; motivo?: string }) => void;
  irPara: (p: PedidoBoard, status: string) => void;
  trocarEntregador: (p: PedidoBoard, id: string) => void;
  imprimir: (p: PedidoBoard) => void;
}) {
  const [tempo, setTempo] = useState(40);
  const atrasado = pedidoAtrasado(p, nowMs);
  const min = minutosDoPedido(p, nowMs);
  const prox = proxima(p);
  const sit = situacao(p, nowMs);

  const etapas = [
    { nome: "Recebido", em: p.criado_em },
    { nome: "Na cozinha", em: p.preparo_em ?? p.aceito_em },
    { nome: p.tipo === "retirada" ? "Pronto pra retirar" : "Pronto", em: p.pronto_em },
    { nome: p.tipo === "retirada" ? "Retirado" : "Saiu para entrega", em: p.tipo === "retirada" ? p.entregue_em : p.saiu_em },
  ];
  const ordem = ["pendente", "aceito", "em_preparo", "pronto", "saiu", "entregue"];
  const idxStatus = ordem.indexOf(p.status);
  // Etapa ATUAL = a próxima que falta; as anteriores estão feitas.
  const feitas = p.status === "pendente" ? 1 : p.status === "aceito" || p.status === "em_preparo" ? 2 : p.status === "pronto" ? 3 : idxStatus >= 4 ? 4 : 1;

  const zap = (p.telefone ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const endereco = p.tipo === "retirada"
    ? "Retirada no balcão"
    : [[p.logradouro, p.numero_casa].filter(Boolean).join(", "), p.bairro].filter(Boolean).join(" · ") || "Endereço no pedido";

  async function recusar() {
    const motivo = await perguntar("Motivo pra recusar/cancelar este pedido (o cliente vai ver):", "");
    if (motivo && motivo.trim()) avancar({ ...p, status: "__cancelar" } as PedidoBoard, { motivo: motivo.trim() });
  }

  return (
    <div className="cartao-foco flex flex-col gap-3.5 p-5" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <span className="rotulo !text-painel-foco-rotulo">Pedido #{p.numero ?? "—"}</span>
        <span className={atrasado ? "pilula pilula-urgente-solido" : sit.cls}>{atrasado ? `atrasado ${min} min` : sit.texto}</span>
      </div>
      <div>
        <p className="font-numero text-[22px] font-bold tracking-apertada">{p.nome}</p>
        <p className="mt-0.5 text-[13px] text-painel-foco-suave">{endereco}</p>
        {p.agendado_para && <p className="mt-0.5 text-[13px] text-painel-foco-suave">Agendado pra {hora(p.agendado_para)}</p>}
      </div>

      <ol className="flex flex-col gap-2">
        {etapas.map((e, i) => {
          const feita = i < feitas || p.status === "entregue";
          const atual = !feita && i === feitas && p.status !== "cancelado";
          return (
            <li key={e.nome} className="flex items-center gap-2.5">
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${feita ? "bg-primaria" : atual ? "border-2 border-primaria shadow-[0_0_0_4px_color-mix(in_srgb,var(--marca-primaria)_22%,transparent)]" : "border-2 border-painel-foco-linha"}`}
                aria-hidden
              />
              <span className={`text-[13.5px] ${feita || atual ? "font-semibold" : "text-painel-foco-suave"}`}>
                {e.nome}{atual ? <span className="sr-only"> (etapa atual)</span> : null}
              </span>
              <span className="ml-auto font-numero text-[12.5px] text-painel-foco-suave">{feita ? hora(e.em) : "—"}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5 border-t border-painel-foco-linha pt-3 text-[13.5px]">
        {p.itens.map((i, k) => (
          <div key={k} className="flex justify-between gap-3">
            <span className="min-w-0">{i.qtd}× {i.descricao}</span>
            <span className="font-numero">{valor(i.qtd * i.preco)}</span>
          </div>
        ))}
        {p.tipo === "entrega" && Number(p.taxa_entrega) > 0 && (
          <div className="flex justify-between text-painel-foco-suave"><span>Entrega</span><span className="font-numero">{valor(Number(p.taxa_entrega))}</span></div>
        )}
        {Number(p.desconto) > 0 && (
          <div className="flex justify-between text-painel-foco-suave"><span>Desconto</span><span className="font-numero">− {valor(Number(p.desconto))}</span></div>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="font-semibold">Total · {p.forma_pagamento ?? "—"} {p.pago ? "pago" : "a receber"}</span>
          <span className="font-numero text-[22px] font-bold">{brl(total(p))}</span>
        </div>
      </div>

      {p.status === "pendente" && !p.agendado_para && (
        <label className="flex items-center justify-between gap-2 text-[13px] text-painel-foco-suave">
          Tempo prometido ao cliente
          <select value={tempo} onChange={(e) => setTempo(Number(e.target.value))} className="min-h-11 rounded-controle border border-painel-foco-linha bg-transparent px-2 text-sm text-painel-foco-texto">
            {[30, 40, 50, 60, 75, 90].map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
        </label>
      )}

      {prox ? (
        <button
          type="button"
          onClick={() => (p.status === "pendente" ? avancar(p, { tempoMin: p.agendado_para ? undefined : tempo }) : irPara(p, prox.status))}
          disabled={proc}
          className="btn-principal w-full text-sm"
        >
          {prox.texto}
        </button>
      ) : (
        <p className="text-center text-sm text-painel-foco-suave">{p.status === "entregue" ? "Pedido concluído." : "Pedido cancelado."}</p>
      )}

      <div className="flex gap-2">
        {zapNum ? (
          <a href={`https://web.whatsapp.com/send?phone=${zapNum}`} target="_blank" rel="noopener" className="btn-foco flex-1 text-[13px]">
            <Icone nome="zap" tamanho={15} /> WhatsApp
          </a>
        ) : (
          <span className="btn-foco flex-1 text-[13px] opacity-50" aria-disabled>Sem telefone</span>
        )}
        <button type="button" onClick={() => imprimir(p)} disabled={proc} className="btn-foco flex-1 text-[13px]">
          <Icone nome="imprimir" tamanho={15} /> Imprimir
        </button>
      </div>

      {/* O resto (motoboy, pular etapa, recusar, detalhe) fica discreto embaixo. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-painel-foco-linha pt-3 text-[13px]">
        {p.tipo === "entrega" && p.status !== "entregue" && p.status !== "cancelado" && (
          <select
            value={p.entregador_id ?? ""}
            onChange={(e) => trocarEntregador(p, e.target.value)}
            aria-label="Entregador"
            className="min-h-11 flex-1 rounded-controle border border-painel-foco-linha bg-transparent px-2 text-painel-foco-texto"
          >
            <option value="">Sem motoboy</option>
            {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        {p.status !== "entregue" && p.status !== "cancelado" && p.status !== "pendente" && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) irPara(p, e.target.value); }}
            disabled={proc}
            aria-label="Pular pra outra etapa"
            className="min-h-11 rounded-controle border border-painel-foco-linha bg-transparent px-2 text-painel-foco-texto"
          >
            <option value="">Mudar etapa…</option>
            {["aceito", "em_preparo", "pronto", "saiu", "entregue"].filter((k) => k !== p.status).map((k) => (
              <option key={k} value={k}>{{ aceito: "Aceito", em_preparo: "Na cozinha", pronto: "Pronto", saiu: "Saiu", entregue: "Entregue" }[k]}</option>
            ))}
          </select>
        )}
        {p.status === "pendente" && (
          <button type="button" onClick={recusar} disabled={proc} className="min-h-11 rounded-controle px-2 font-semibold text-painel-foco-suave underline">Recusar</button>
        )}
        <Link href={`/delivery/${p.id}`} className="ml-auto flex min-h-11 items-center font-semibold text-painel-foco-rotulo hover:underline">Abrir pedido</Link>
      </div>
    </div>
  );
}
