"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { finalizarVendaPdv } from "./actions";

export type ItemMenu = { id: string; nome: string; categoria: string; preco: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CORES = ["#6366f1", "#10b981", "#ec4899", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f43f5e", "#84cc16", "#8b5cf6"];
const FORMAS = [
  { id: "Dinheiro", label: "💵 Dinheiro" },
  { id: "Cartão", label: "💳 Cartão" },
  { id: "Pix", label: "📱 Pix" },
];

type Feito = { numero: number; pago: boolean; forma?: string; troco?: number; semCaixa?: boolean; viagem?: boolean };

export function PdvClient({ itens, categorias }: { itens: ItemMenu[]; categorias: string[] }) {
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [obs, setObs] = useState("");
  const [fase, setFase] = useState<"menu" | "pagar">("menu");
  const [local, setLocal] = useState<"aqui" | "viagem">("aqui");
  const [forma, setForma] = useState("Dinheiro");
  const [recebido, setRecebido] = useState("");
  const [feito, setFeito] = useState<Feito | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abas = ["Todos", ...categorias];
  const corDe = (c: string) => (c === "Todos" ? "#3b82f6" : CORES[categorias.indexOf(c) % CORES.length]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (aba === "Todos" || i.categoria === aba) && (!q || i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  const itemDe = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const cartLista = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ item: itemDe.get(id)!, qtd: q })).filter((x) => x.item);
  const total = Math.round(cartLista.reduce((s, x) => s + x.item.preco * x.qtd, 0) * 100) / 100;
  const cartCount = cartLista.reduce((s, x) => s + x.qtd, 0);
  const recebidoNum = Number(recebido.replace(",", ".")) || 0;
  const troco = forma === "Dinheiro" && recebidoNum > total ? Math.round((recebidoNum - total) * 100) / 100 : 0;

  const setQtd = (id: string, q: number) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));

  const itensParaEnviar = () => cartLista.map((x) => ({ itemId: x.item.id, nome: x.item.nome, preco: x.item.preco, qtd: x.qtd }));

  function finalizar(pagamento: { forma: string } | null) {
    if (cartLista.length === 0) return;
    const trocoAtual = troco;
    const ehViagem = local === "viagem";
    start(async () => {
      const r = await finalizarVendaPdv(itensParaEnviar(), obs, pagamento, local);
      if (r.ok) {
        setFeito({ numero: r.numero ?? 0, pago: !!pagamento, forma: pagamento?.forma, troco: pagamento?.forma === "Dinheiro" ? trocoAtual : 0, semCaixa: "semCaixa" in r ? r.semCaixa : false, viagem: ehViagem });
        setCart({}); setObs(""); setFase("menu"); setRecebido(""); setForma("Dinheiro"); setLocal("aqui");
      } else {
        setErro(("mensagem" in r && r.mensagem) || "Não foi possível concluir."); setTimeout(() => setErro(null), 3500);
      }
    });
  }

  if (feito) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="mb-3 text-5xl">{feito.pago ? "✅" : "🍳"}</div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Venda nº {feito.numero} {feito.pago ? "paga!" : "enviada!"}</h1>
        {feito.viagem && <div className="mt-2 inline-block rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-600">🥡 Viagem</div>}
        <p className="mt-1 text-zinc-500">
          {feito.pago ? <>Pagou em <b>{feito.forma}</b> e o pedido foi pra cozinha.</> : "O pedido foi pra cozinha. Receba o pagamento no caixa."}
        </p>
        {feito.pago && (feito.troco ?? 0) > 0 && (
          <div className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xl font-bold text-amber-600">Troco: {brl(feito.troco!)}</div>
        )}
        {feito.pago && feito.semCaixa && (
          <p className="mt-3 text-sm text-amber-600">⚠️ Nenhum caixa aberto — a venda foi registrada, mas não entrou no caixa. Abra o caixa pra controlar o dinheiro.</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setFeito(null)} className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white">Nova venda</button>
          {!feito.pago && <Link href="/salao/caixa" className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold dark:border-zinc-700">Ir pro caixa →</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] gap-3 p-3">
      {/* Cardápio */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <h1 className="text-lg font-bold">🧾 PDV — Balcão</h1>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..." className="ml-auto w-64 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 p-2 dark:border-zinc-800">
          {abas.map((c) => (
            <button key={c} onClick={() => setAba(c)} style={{ borderColor: corDe(c) }} className={`rounded-lg border-l-4 px-3 py-1.5 text-sm font-medium ${aba === c ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500"}`}>{c}</button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((i) => {
            const q = cart[i.id] || 0;
            return (
              <button key={i.id} onClick={() => add(i.id)} className={`flex min-h-[76px] flex-col justify-between rounded-xl border p-2.5 text-left ${q > 0 ? "border-emerald-500 bg-emerald-500/5" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}>
                <span className="text-sm font-medium leading-tight">{i.nome}{q > 0 ? ` (${q})` : ""}</span>
                <span className="text-sm text-emerald-600">{i.preco > 0 ? brl(i.preco) : "—"}</span>
              </button>
            );
          })}
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">Nenhum produto.</p>}
        </div>
      </div>

      {/* Carrinho / Pagamento */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 p-3 font-bold dark:border-zinc-800">
          {fase === "pagar" ? <button onClick={() => setFase("menu")} className="text-emerald-600">← Voltar</button> : <>🛒 Pedido {cartCount > 0 ? `(${cartCount})` : ""}</>}
        </div>

        {fase === "menu" ? (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              {cartLista.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-500">Toque nos produtos pra adicionar.</p>
              ) : (
                <div className="space-y-1.5">
                  {cartLista.map((x) => (
                    <div key={x.item.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{x.item.nome}</div>
                        <div className="text-xs text-emerald-600">{brl(x.item.preco * x.qtd)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQtd(x.item.id, x.qtd - 1)} className="h-7 w-7 rounded border border-zinc-300 dark:border-zinc-600">{x.qtd === 1 ? "🗑️" : "−"}</button>
                        <span className="w-5 text-center font-bold">{x.qtd}</span>
                        <button onClick={() => setQtd(x.item.id, x.qtd + 1)} className="h-7 w-7 rounded border border-zinc-300 text-emerald-600 dark:border-zinc-600">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button onClick={() => setLocal("aqui")} className={`rounded-lg border py-2 text-sm font-semibold ${local === "aqui" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}>🍽️ Comer aqui</button>
                <button onClick={() => setLocal("viagem")} className={`rounded-lg border py-2 text-sm font-semibold ${local === "viagem" ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}>🥡 Viagem</button>
              </div>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Nome do cliente / obs (opcional)" className="mb-2 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
              <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
              {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
              <button onClick={() => setFase("pagar")} disabled={cartLista.length === 0} className="mb-2 w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50">💰 Cobrar e finalizar</button>
              <button onClick={() => finalizar(null)} disabled={proc || cartLista.length === 0} className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">{proc ? "Enviando..." : "🍳 Só enviar pra cozinha (pago no caixa)"}</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col p-3">
            <div className="mb-3 rounded-xl bg-zinc-100 p-3 text-center dark:bg-zinc-800">
              <div className="text-sm text-zinc-500">Total a cobrar {local === "viagem" && <span className="font-bold text-amber-600">· 🥡 Viagem</span>}</div>
              <div className="text-3xl font-bold">{brl(total)}</div>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {FORMAS.map((f) => (
                <button key={f.id} onClick={() => setForma(f.id)} className={`rounded-xl border py-3 text-sm font-semibold ${forma === f.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 dark:border-zinc-800"}`}>{f.label}</button>
              ))}
            </div>
            {forma === "Dinheiro" && (
              <div className="mb-3">
                <label className="text-sm text-zinc-500">Valor recebido</label>
                <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" placeholder="Ex.: 50" className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 text-lg outline-none dark:border-zinc-700" />
                <div className="mt-2 flex justify-between text-lg font-bold"><span>Troco</span><span className={troco > 0 ? "text-amber-600" : ""}>{brl(troco)}</span></div>
              </div>
            )}
            <div className="flex-1" />
            {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
            <button onClick={() => finalizar({ forma })} disabled={proc} className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white disabled:opacity-50">{proc ? "Concluindo..." : "✅ Confirmar e enviar pra cozinha"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
