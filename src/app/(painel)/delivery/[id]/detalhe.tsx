"use client";

import { Icone } from "@/components/icone";
import { avisar, perguntar } from "@/components/dialogo";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatusDelivery, definirEntregador, definirPagoDelivery, reimprimirDelivery } from "../actions";
import { emitirNfceComanda } from "../../salao/fiscal-actions";

export type PedidoDetalhe = {
  id: string;
  numero: number | null;
  comandaId: string | null;
  nome: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco: { logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; referencia: string };
  status: string;
  origem: string;
  formaPagamento: string | null;
  trocoPara: number | null;
  pago: boolean;
  taxaEntrega: number;
  desconto: number;
  descontoMotivo: string | null;
  observacao: string | null;
  entregadorId: string | null;
  previsaoEm: string | null;
  carimbos: {
    criado_em: string; aceito_em: string | null; preparo_em: string | null; pronto_em: string | null;
    saiu_em: string | null; entregue_em: string | null; cancelado_em: string | null;
  };
  canceladoMotivo: string | null;
  itens: { descricao: string; qtd: number; preco: number }[];
  historicoCliente: number;
  historico: { numero: number | null; criado_em: string; status: string; tipo: string }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ORIGEM: Record<string, string> = { app: "App", whatsapp: "WhatsApp", instagram: "Instagram", telefone: "Telefone", balcao: "Balcão" };
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

const ETAPAS: { key: string; label: string; carimbo: keyof PedidoDetalhe["carimbos"] }[] = [
  { key: "pendente", label: "Pendente", carimbo: "criado_em" },
  { key: "aceito", label: "Aceito", carimbo: "aceito_em" },
  { key: "em_preparo", label: "Em preparo", carimbo: "preparo_em" },
  { key: "pronto", label: "Pronto", carimbo: "pronto_em" },
  { key: "saiu", label: "Saiu", carimbo: "saiu_em" },
  { key: "entregue", label: "Entregue", carimbo: "entregue_em" },
];
const PROX: Record<string, string> = { pendente: "aceito", aceito: "em_preparo", em_preparo: "pronto", pronto: "saiu", saiu: "entregue" };

export function Detalhe({ pedido: p, entregadores }: { pedido: PedidoDetalhe; entregadores: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();

  const subtotal = p.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const taxa = p.tipo === "retirada" ? 0 : p.taxaEntrega;
  const total = Math.round((subtotal + taxa - p.desconto) * 100) / 100;
  const cancelado = p.status === "cancelado";
  const idxAtual = ETAPAS.findIndex((e) => e.key === p.status);
  const mapaUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.endereco.logradouro, p.endereco.numero, p.endereco.bairro, p.endereco.cidade].filter(Boolean).join(", "))}`;

  const act = (fn: () => Promise<unknown>) => start(async () => { const r = (await fn()) as { ok?: boolean; mensagem?: string } | undefined; if (r && r.ok === false && r.mensagem) void avisar(r.mensagem); router.refresh(); });

  return (
    <div className="mt-3">
      {/* Cabeçalho + status */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Pedido #{p.numero ?? "—"}</h1>
        <span className="text-sm text-texto-suave">{ORIGEM[p.origem] ?? p.origem} · {new Date(p.carimbos.criado_em).toLocaleString("pt-BR")}</span>
        <div className="ml-auto flex gap-2">
          {PROX[p.status] && !cancelado && (
            <button onClick={() => act(() => definirStatusDelivery(p.id, PROX[p.status]))} disabled={proc} className="rounded-cartao bg-texto px-4 py-2 font-semibold text-fundo disabled:opacity-50">→ {ETAPAS.find((e) => e.key === PROX[p.status])?.label}</button>
          )}
          <button onClick={() => act(() => reimprimirDelivery(p.id))} disabled={proc} className="rounded-cartao border border-borda-forte px-3 py-2 text-sm"><span className="inline-flex items-center gap-1.5"><Icone nome="imprimir" tamanho={14} /> Reimprimir</span></button>
          {p.comandaId && (
            <button
              onClick={async () => {
                const cpf = await perguntar("CPF na nota? (deixe vazio pra emitir sem CPF)") ?? "";
                start(async () => {
                  const r = await emitirNfceComanda(p.comandaId!, cpf.trim() || undefined);
                  if (r.ok) {
                    void avisar(`NFC-e ${"jaEmitida" in r && r.jaEmitida ? "já estava emitida" : "emitida"}!${"numero" in r && r.numero ? ` Nº ${r.numero}` : ""}`);
                    if ("urlDanfe" in r && r.urlDanfe) window.open(r.urlDanfe as string, "_blank");
                  } else {
                    void avisar(`${"mensagem" in r && r.mensagem ? r.mensagem : "Não foi possível emitir."}`);
                  }
                  router.refresh();
                });
              }}
              disabled={proc}
              className="rounded-cartao border border-borda-forte px-3 py-2 text-sm"
              title="Emitir a nota fiscal do consumidor deste pedido"
            >
              <Icone nome="cupom" tamanho={15} className="mr-1.5" /> NFC-e
            </button>
          )}
          {!cancelado && p.status !== "entregue" && (
            <button onClick={async () => { const m = await perguntar("Motivo do cancelamento (o cliente vai ver):", ""); if (m && m.trim()) act(() => definirStatusDelivery(p.id, "cancelado", { motivo: m.trim() })); }} disabled={proc} className="rounded-cartao border border-rose-300 px-3 py-2 text-sm text-rose-600 dark:border-rose-800">Cancelar</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {cancelado ? (
        <div className="mb-4 rounded-cartao bg-rose-500/10 px-4 py-3 font-semibold text-rose-600">Pedido cancelado {p.carimbos.cancelado_em ? `às ${hhmm(p.carimbos.cancelado_em)}` : ""}{p.canceladoMotivo ? <span className="block text-sm font-normal">Motivo: {p.canceladoMotivo}</span> : null}</div>
      ) : (
        <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-cartao border border-borda p-3">
          {ETAPAS.map((e, i) => {
            const feito = p.carimbos[e.carimbo];
            const atual = i === idxAtual;
            return (
              <div key={e.key} className="flex items-center gap-1">
                <div className="text-center">
                  <div className={`rounded-full px-3 py-1 text-xs font-bold ${atual ? "bg-texto text-fundo" : feito ? "bg-emerald-500/15 text-emerald-600" : "bg-superficie-suave text-texto-fraco "}`}>{e.label}</div>
                  <div className="mt-1 text-[11px] text-texto-fraco">{hhmm(feito)}</div>
                </div>
                {i < ETAPAS.length - 1 && <div className={`h-0.5 w-6 ${feito ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Esquerda: cliente + entrega */}
        <div className="space-y-4">
          <div className="rounded-cartao border border-borda p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-bold"><Icone nome="pessoa" tamanho={15} /> {p.nome}</h2>
              {p.historicoCliente > 0 && <span className="rounded-full bg-superficie-suave px-2 py-0.5 text-xs text-texto-suave">{p.historicoCliente} pedido(s) antes</span>}
            </div>
            <div className="text-sm text-texto-suave">{p.telefone}</div>
            {p.tipo === "entrega" ? (
              <div className="mt-2 text-sm">
                <div className="flex items-start gap-1.5"><Icone nome="local" tamanho={14} className="mt-0.5" /> {[p.endereco.logradouro, p.endereco.numero].filter(Boolean).join(", ")}</div>
                {p.endereco.complemento && <div className="text-texto-suave">{p.endereco.complemento}</div>}
                <div className="text-texto-suave">Bairro: {p.endereco.bairro || "—"} · {p.endereco.cidade || "—"}</div>
                {p.endereco.referencia && <div className="text-texto-suave">Ref.: {p.endereco.referencia}</div>}
                <a href={mapaUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-600 hover:underline">Ver no mapa →</a>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 font-medium text-texto-suave"><Icone nome="loja" tamanho={14} /> Retirada no balcão</div>
            )}
          </div>

          {p.tipo === "entrega" && (
            <div className="rounded-cartao border border-borda p-4">
              <h2 className="mb-2 flex items-center gap-1.5 font-bold"><Icone nome="entrega" tamanho={15} /> Entregador</h2>
              <select value={p.entregadorId ?? ""} onChange={(e) => act(() => definirEntregador(p.id, e.target.value || null))} className="w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm">
                <option value="">Não informado</option>
                {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          )}

          {p.observacao && (
            <div className="rounded-cartao border border-amber-300 bg-amber-500/5 p-4 dark:border-amber-800">
              <h2 className="mb-1 flex items-center gap-1.5 font-bold text-amber-600"><Icone nome="editar" tamanho={15} /> Observação</h2>
              <p className="text-sm">{p.observacao}</p>
            </div>
          )}

          {p.historico.length > 0 && (
            <div className="rounded-cartao border border-borda p-4">
              <h2 className="mb-2 flex items-center gap-1.5 font-bold"><Icone nome="relogio" tamanho={15} /> Últimos pedidos do cliente</h2>
              <div className="space-y-1">
                {p.historico.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>#{h.numero ?? "—"} · {new Date(h.criado_em).toLocaleDateString("pt-BR")}</span>
                    <span className="text-texto-suave">{h.tipo === "retirada" ? "Retirada" : "Entrega"} · {h.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Direita: valores + pagamento */}
        <div className="rounded-cartao border border-borda p-4">
          <h2 className="mb-3 font-bold">Resumo de valores</h2>
          <div className="space-y-1.5">
            {p.itens.map((i, idx) => (
              <div key={idx} className="flex justify-between gap-2 text-sm">
                <span className="whitespace-pre-line"><b>{i.qtd}x</b> {i.descricao}</span>
                <span className="shrink-0">{brl(i.preco * i.qtd)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-borda pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {p.tipo === "entrega" && <div className="flex justify-between"><span>Taxa de entrega</span><span>{brl(taxa)}</span></div>}
            {p.desconto > 0 && <div className="flex justify-between text-rose-500"><span>Desconto {p.descontoMotivo ? `· ${p.descontoMotivo}` : ""}</span><span>− {brl(p.desconto)}</span></div>}
            <div className="flex justify-between pt-1 text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-borda pt-3">
            <div>
              <div className="text-sm font-semibold">{p.formaPagamento ?? "—"}</div>
              {p.formaPagamento === "Dinheiro" && p.trocoPara ? <div className="text-xs text-texto-suave">Troco para {brl(p.trocoPara)}</div> : null}
            </div>
            <button onClick={() => act(() => definirPagoDelivery(p.id, !p.pago))} disabled={proc} className={`rounded-full px-3 py-1.5 text-sm font-bold ${p.pago ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>
              {p.pago ? "✓ Pago" : "A receber — marcar pago"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
