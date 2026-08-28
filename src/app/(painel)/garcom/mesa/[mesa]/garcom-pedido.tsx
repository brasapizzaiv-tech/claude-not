"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { lancarPedidoGarcom, transferirComanda } from "../../actions";

export type ItemMenu = { id: string; nome: string; categoria: string; preco: number };
export type Comanda = {
  id: string;
  numero: number;
  buffet: number;
  total: number;
  itens: { descricao: string; qtd: number; preco: number }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Cores da barrinha lateral das categorias (estilo Suitable).
const CORES = ["#6366f1", "#10b981", "#ec4899", "#f59e0b", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f43f5e", "#84cc16", "#8b5cf6"];

export function GarcomPedido({
  mesa,
  itens,
  categorias,
  comandas,
  mesas,
  comandaInicial,
}: {
  mesa: string;
  itens: ItemMenu[];
  categorias: string[];
  comandas: Comanda[];
  mesas: string[];
  comandaInicial?: string;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [buscaOn, setBuscaOn] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [obs, setObs] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Comanda escolhida: "nova" = cria uma nova; senão o id de uma existente.
  const [comandaSel, setComandaSel] = useState<string>(comandaInicial ?? comandas[0]?.id ?? "nova");
  const [contaOpen, setContaOpen] = useState(false);
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [trocaComanda, setTrocaComanda] = useState<string>(comandas[0]?.id ?? "");
  const [trocaMesa, setTrocaMesa] = useState<string>("");

  const abas = ["Todos", ...categorias];
  const corDe = (c: string) => (c === "Todos" ? "#3b82f6" : CORES[(categorias.indexOf(c) + CORES.length) % CORES.length]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (aba !== "Todos" && i.categoria !== aba) return false;
      if (q && !i.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [itens, aba, busca]);

  const itemDe = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  const cartLista = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ item: itemDe.get(id)!, qtd: q }))
    .filter((x) => x.item);
  const cartTotal = cartLista.reduce((s, x) => s + x.item.preco * x.qtd, 0);

  const setQtd = (id: string, q: number) =>
    setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));

  const totalMesa = comandas.reduce((s, c) => s + c.total, 0);

  function transferir() {
    if (!trocaComanda || !trocaMesa) return;
    start(async () => {
      const r = await transferirComanda(trocaComanda, trocaMesa);
      if (r.ok) {
        setTrocaOpen(false);
        setToast(`Comanda movida para ${trocaMesa}!`);
        setTimeout(() => router.push(`/garcom/mesa/${encodeURIComponent(trocaMesa)}`), 900);
      } else {
        setToast(r.mensagem || "Não foi possível transferir.");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  function lancar() {
    if (cartLista.length === 0) return;
    start(async () => {
      const r = await lancarPedidoGarcom(
        mesa,
        cartLista.map((x) => ({ itemId: x.item.id, nome: x.item.nome, preco: x.item.preco, qtd: x.qtd })),
        obs,
        comandaSel === "nova" ? undefined : comandaSel,
      );
      if (r.ok) {
        setToast("Pedido realizado com sucesso!");
        setTimeout(() => router.push("/garcom"), 900);
      } else {
        setToast(r.mensagem || "Não foi possível lançar.");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-zinc-950 text-zinc-100">
      {/* Topo */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <Link href="/garcom" className="text-xl text-zinc-400">←</Link>
          <span className="text-lg font-bold">{mesa}</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium text-blue-400">
          <button onClick={() => setContaOpen(true)}>🧾 Conta</button>
          <button onClick={() => { setTrocaComanda(comandas[0]?.id ?? ""); setTrocaMesa(""); setTrocaOpen(true); }}>⇄ Trocar mesa</button>
        </div>
      </div>

      {/* Busca (quando ativa) */}
      {buscaOn && (
        <div className="border-b border-zinc-800 p-2">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
          />
        </div>
      )}

      {/* Conteúdo: produtos (esq) + categorias (dir) */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-2">
          {visiveis.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">Nenhum produto.</p>
          ) : (
            <div className="space-y-2">
              {visiveis.map((i) => {
                const q = cart[i.id] || 0;
                return (
                  <div
                    key={i.id}
                    onClick={() => q === 0 && add(i.id)}
                    className={`flex items-center justify-between rounded-lg border p-3 ${q > 0 ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 bg-zinc-900"}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{i.nome}</div>
                      <div className="text-sm text-emerald-400">{i.preco > 0 ? brl(i.preco) : "Preço variável"}</div>
                    </div>
                    {q > 0 && (
                      <div className="flex items-center gap-3 rounded-lg border border-blue-500 px-2 py-1">
                        <button onClick={(e) => { e.stopPropagation(); setQtd(i.id, q - 1); }} className="text-lg">{q === 1 ? "🗑️" : "−"}</button>
                        <span className="w-5 text-center font-bold">{q}</span>
                        <button onClick={(e) => { e.stopPropagation(); setQtd(i.id, q + 1); }} className="text-lg text-blue-400">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rail de categorias */}
        <div className="w-28 shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-900/50 p-1.5">
          {abas.map((c) => (
            <button
              key={c}
              onClick={() => setAba(c)}
              style={{ borderLeftColor: corDe(c) }}
              className={`mb-1.5 w-full rounded-md border-l-4 px-2 py-3 text-xs font-medium ${aba === c ? "bg-zinc-700 text-white" : "bg-zinc-800/60 text-zinc-300"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-3 border-t border-zinc-800 p-3">
        <button onClick={() => { setBuscaOn((v) => !v); if (buscaOn) setBusca(""); }} className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 text-lg">🔎</button>
        <button
          onClick={() => setCartOpen(true)}
          disabled={cartCount === 0}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-base font-bold ${cartCount > 0 ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
        >
          🛒 Carrinho{cartCount > 0 ? ` (${cartCount})` : ""}
        </button>
      </div>

      {/* Carrinho */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 p-3">
            <span className="text-lg font-bold">Carrinho · {mesa}</span>
            <button onClick={() => setCartOpen(false)} className="text-zinc-400">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {cartLista.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Carrinho vazio.</p>
            ) : (
              <div className="space-y-2">
                {cartLista.map((x) => (
                  <div key={x.item.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{x.item.nome}</div>
                      <div className="text-sm text-emerald-400">{brl(x.item.preco * x.qtd)}</div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 px-2 py-1">
                      <button onClick={() => setQtd(x.item.id, x.qtd - 1)} className="text-lg">{x.qtd === 1 ? "🗑️" : "−"}</button>
                      <span className="w-5 text-center font-bold">{x.qtd}</span>
                      <button onClick={() => setQtd(x.item.id, x.qtd + 1)} className="text-lg text-blue-400">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-zinc-800 p-3">
            {/* Escolher a comanda */}
            <p className="mb-1 text-xs text-zinc-400">Lançar na comanda:</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {comandas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setComandaSel(c.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${comandaSel === c.id ? "bg-blue-600 text-white" : "border border-zinc-700 text-zinc-300"}`}
                >
                  Comanda {c.numero}
                </button>
              ))}
              <button
                onClick={() => setComandaSel("nova")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${comandaSel === "nova" ? "bg-blue-600 text-white" : "border border-zinc-700 text-zinc-300"}`}
              >
                + Nova comanda
              </button>
            </div>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observações do pedido (opcional)"
              rows={2}
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
            />
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-zinc-400">Total</span>
              <span className="font-bold">{brl(cartTotal)}</span>
            </div>
            <button
              onClick={lancar}
              disabled={proc || cartLista.length === 0}
              className="w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              {proc ? "Lançando..." : "✓ Lançar pedido"}
            </button>
          </div>
        </div>
      )}

      {/* Conta / histórico do que foi lançado */}
      {contaOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 p-3">
            <span className="text-lg font-bold">Conta · {mesa}</span>
            <button onClick={() => setContaOpen(false)} className="text-zinc-400">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {comandas.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Esta mesa não tem comanda aberta.</p>
            ) : (
              <div className="space-y-4">
                {comandas.map((c) => (
                  <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900">
                    <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                      <span className="font-bold">Comanda {c.numero}</span>
                      <span className="font-bold text-emerald-400">{brl(c.total)}</span>
                    </div>
                    <div className="divide-y divide-zinc-800/60">
                      {c.buffet > 0 && (
                        <div className="flex justify-between px-3 py-1.5 text-sm">
                          <span className="text-zinc-300">Buffet (balança)</span>
                          <span>{brl(c.buffet)}</span>
                        </div>
                      )}
                      {c.itens.length === 0 && c.buffet === 0 ? (
                        <p className="px-3 py-2 text-sm text-zinc-500">Nada lançado ainda.</p>
                      ) : (
                        c.itens.map((it, idx) => (
                          <div key={idx} className="flex justify-between px-3 py-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate whitespace-pre-line text-zinc-200">
                              {it.qtd}× {it.descricao}
                            </span>
                            <span className="ml-2 shrink-0">{it.preco > 0 ? brl(it.qtd * it.preco) : "—"}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-800 p-3 text-lg">
            <span className="font-medium text-zinc-300">Total da mesa</span>
            <span className="font-bold text-emerald-400">{brl(totalMesa)}</span>
          </div>
        </div>
      )}

      {/* Trocar mesa: mover a comanda para outra mesa */}
      {trocaOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 p-3">
            <span className="text-lg font-bold">Trocar mesa</span>
            <button onClick={() => setTrocaOpen(false)} className="text-zinc-400">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {comandas.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Esta mesa não tem comanda para mover.</p>
            ) : (
              <>
                {comandas.length > 1 && (
                  <>
                    <p className="mb-1 text-xs text-zinc-400">Qual comanda mover?</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {comandas.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setTrocaComanda(c.id)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${trocaComanda === c.id ? "bg-blue-600 text-white" : "border border-zinc-700 text-zinc-300"}`}
                        >
                          Comanda {c.numero}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <p className="mb-1 text-xs text-zinc-400">Mover para qual mesa?</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {mesas.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTrocaMesa(m)}
                      className={`rounded-lg px-2 py-2.5 text-sm font-medium ${trocaMesa === m ? "bg-blue-600 text-white" : "border border-zinc-700 text-zinc-300"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {comandas.length > 0 && (
            <div className="border-t border-zinc-800 p-3">
              <button
                onClick={transferir}
                disabled={proc || !trocaComanda || !trocaMesa}
                className="w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                {proc ? "Movendo..." : trocaMesa ? `⇄ Mover para ${trocaMesa}` : "Escolha a mesa"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-zinc-800 px-8 py-6 text-center">
            <div className="mb-2 text-4xl">✅</div>
            <p className="font-semibold">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
