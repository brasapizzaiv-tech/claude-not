"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirStatusDelivery, definirEntregador, definirPagoDelivery, reimprimirDelivery } from "../actions";

export type PedidoDetalhe = {
  id: string;
  numero: number | null;
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
  itens: { descricao: string; qtd: number; preco: number }[];
  historicoCliente: number;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ORIGEM: Record<string, string> = { app: "📱 App", whatsapp: "🟢 WhatsApp", instagram: "📸 Instagram", telefone: "📞 Telefone", balcao: "🏪 Balcão" };
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

  const act = (fn: () => Promise<unknown>) => start(async () => { const r = (await fn()) as { ok?: boolean; mensagem?: string } | undefined; if (r && r.ok === false && r.mensagem) alert(r.mensagem); router.refresh(); });

  return (
    <div className="mt-3">
      {/* Cabeçalho + status */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Pedido #{p.numero ?? "—"}</h1>
        <span className="text-sm text-zinc-500">{ORIGEM[p.origem] ?? p.origem} · {new Date(p.carimbos.criado_em).toLocaleString("pt-BR")}</span>
        <div className="ml-auto flex gap-2">
          {PROX[p.status] && !cancelado && (
            <button onClick={() => act(() => definirStatusDelivery(p.id, PROX[p.status]))} disabled={proc} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">→ {ETAPAS.find((e) => e.key === PROX[p.status])?.label}</button>
          )}
          <button onClick={() => act(() => reimprimirDelivery(p.id))} disabled={proc} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">🖨️ Reimprimir</button>
          {!cancelado && p.status !== "entregue" && (
            <button onClick={() => { if (confirm("Cancelar este pedido?")) act(() => definirStatusDelivery(p.id, "cancelado")); }} disabled={proc} className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-600 dark:border-rose-800">Cancelar</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {cancelado ? (
        <div className="mb-4 rounded-xl bg-rose-500/10 px-4 py-3 font-semibold text-rose-600">Pedido cancelado {p.carimbos.cancelado_em ? `às ${hhmm(p.carimbos.cancelado_em)}` : ""}</div>
      ) : (
        <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          {ETAPAS.map((e, i) => {
            const feito = p.carimbos[e.carimbo];
            const atual = i === idxAtual;
            return (
              <div key={e.key} className="flex items-center gap-1">
                <div className="text-center">
                  <div className={`rounded-full px-3 py-1 text-xs font-bold ${atual ? "bg-emerald-600 text-white" : feito ? "bg-emerald-500/15 text-emerald-600" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>{e.label}</div>
                  <div className="mt-1 text-[11px] text-zinc-400">{hhmm(feito)}</div>
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
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">👤 {p.nome}</h2>
              {p.historicoCliente > 0 && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">{p.historicoCliente} pedido(s) antes</span>}
            </div>
            <div className="text-sm text-zinc-500">{p.telefone}</div>
            {p.tipo === "entrega" ? (
              <div className="mt-2 text-sm">
                <div>📍 {[p.endereco.logradouro, p.endereco.numero].filter(Boolean).join(", ")}</div>
                {p.endereco.complemento && <div className="text-zinc-500">{p.endereco.complemento}</div>}
                <div className="text-zinc-500">Bairro: {p.endereco.bairro || "—"} · {p.endereco.cidade || "—"}</div>
                {p.endereco.referencia && <div className="text-zinc-500">Ref.: {p.endereco.referencia}</div>}
                <a href={mapaUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-600 hover:underline">Ver no mapa →</a>
              </div>
            ) : (
              <div className="mt-2 font-medium text-zinc-600 dark:text-zinc-300">🏃 Retirada no balcão</div>
            )}
          </div>

          {p.tipo === "entrega" && (
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-2 font-bold">🛵 Entregador</h2>
              <select value={p.entregadorId ?? ""} onChange={(e) => act(() => definirEntregador(p.id, e.target.value || null))} className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
                <option value="">Não informado</option>
                {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          )}

          {p.observacao && (
            <div className="rounded-2xl border border-amber-300 bg-amber-500/5 p-4 dark:border-amber-800">
              <h2 className="mb-1 font-bold text-amber-600">📝 Observação</h2>
              <p className="text-sm">{p.observacao}</p>
            </div>
          )}
        </div>

        {/* Direita: valores + pagamento */}
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 font-bold">Resumo de valores</h2>
          <div className="space-y-1.5">
            {p.itens.map((i, idx) => (
              <div key={idx} className="flex justify-between gap-2 text-sm">
                <span className="whitespace-pre-line"><b>{i.qtd}x</b> {i.descricao}</span>
                <span className="shrink-0">{brl(i.preco * i.qtd)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {p.tipo === "entrega" && <div className="flex justify-between"><span>Taxa de entrega</span><span>{brl(taxa)}</span></div>}
            {p.desconto > 0 && <div className="flex justify-between text-rose-500"><span>Desconto {p.descontoMotivo ? `· ${p.descontoMotivo}` : ""}</span><span>− {brl(p.desconto)}</span></div>}
            <div className="flex justify-between pt-1 text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div>
              <div className="text-sm font-semibold">{p.formaPagamento ?? "—"}</div>
              {p.formaPagamento === "Dinheiro" && p.trocoPara ? <div className="text-xs text-zinc-500">Troco para {brl(p.trocoPara)}</div> : null}
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
