"use client";

import { Icone } from "@/components/icone";
import { avisar } from "@/components/dialogo";
import { alternarContaPedida } from "@/app/(painel)/salao/actions";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { lancarPedidoGarcomLinhas, transferirComanda } from "../../actions";
import {
  PizzaModal, ComboModal, novoUid,
  type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";

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
  comComplemento,
  pizza,
  complementos,
}: {
  mesa: string;
  itens: ItemMenu[];
  categorias: string[];
  comandas: Comanda[];
  mesas: string[];
  comandaInicial?: string;
  comComplemento: string[];
  pizza: PizzaData;
  complementos: { grupos: Grupo[]; opcoes: Opcao[] };
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  // Id do lançamento atual: o mesmo carrinho reenviado (depois de falha de rede)
  // chega ao servidor com a mesma chave e não duplica o pedido.
  const lancIdRef = useRef("");
  const [aba, setAba] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [buscaOn, setBuscaOn] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [pzOpen, setPzOpen] = useState(false);
  const [comboItem, setComboItem] = useState<ItemMenu | null>(null);
  const [obs, setObs] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Comanda escolhida: "nova" = cria uma nova; senão o id de uma existente.
  const [comandaSel, setComandaSel] = useState<string>(comandaInicial ?? comandas[0]?.id ?? "nova");
  const [contaOpen, setContaOpen] = useState(false);
  const [avisando, setAvisando] = useState<string | null>(null);
  const [avisadas, setAvisadas] = useState<Set<string>>(new Set());

  async function avisarConta(comandaId: string) {
    setAvisando(comandaId);
    try {
      const r = await alternarContaPedida(comandaId);
      if (!r.ok) { void avisar(r.mensagem); return; }
      setAvisadas((s) => {
        const n = new Set(s);
        if (r.pedida) n.add(comandaId); else n.delete(comandaId);
        return n;
      });
    } finally {
      setAvisando(null);
    }
  }
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

  const comComplSet = useMemo(() => new Set(comComplemento), [comComplemento]);
  const gruposDe = (itemId: string) => complementos.grupos.filter((g) => g.item_id === itemId);
  const opcoesDe = (grupoId: string) => complementos.opcoes.filter((o) => o.grupo_id === grupoId);

  const cartCount = cart.reduce((s, l) => s + l.qtd, 0);
  const cartTotal = cart.reduce((s, l) => s + l.preco * l.qtd, 0);

  // Quantidade daquele produto no carrinho (itens simples e combos dele).
  const qtdDoItem = (id: string) =>
    cart.filter((l) => "itemId" in l.payload && l.payload.itemId === id).reduce((s, l) => s + l.qtd, 0);

  const addLinha = (l: CartLine) => setCart((c) => [...c, l]);
  const setQtdLinha = (uid: string, q: number) =>
    setCart((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: q } : l)).filter((l) => l.qtd > 0));

  // Toque no produto: com complementos abre o montador; simples soma 1.
  const add = (i: ItemMenu) => {
    if (comComplSet.has(i.id) && gruposDe(i.id).length) { setComboItem(i); return; }
    setCart((c) => {
      const simples = c.find((l) => l.payload.kind === "item" && l.payload.itemId === i.id);
      if (simples) return c.map((l) => (l.uid === simples.uid ? { ...l, qtd: l.qtd + 1 } : l));
      return [...c, { uid: novoUid(), descricao: i.nome, preco: i.preco, qtd: 1, payload: { kind: "item", itemId: i.id, qtd: 1 } }];
    });
  };
  // "−" no card do produto: tira 1 da última linha daquele produto.
  const tiraUm = (id: string) => {
    setCart((c) => {
      const idx = [...c].reverse().findIndex((l) => "itemId" in l.payload && l.payload.itemId === id);
      if (idx < 0) return c;
      const real = c.length - 1 - idx;
      const l = c[real];
      if (l.qtd <= 1) return c.filter((_, j) => j !== real);
      return c.map((x, j) => (j === real ? { ...x, qtd: x.qtd - 1 } : x));
    });
  };

  const totalMesa = comandas.reduce((s, c) => s + c.total, 0);

  function transferir() {
    if (!trocaComanda || !trocaMesa) return;
    start(async () => {
      try {
        const r = await transferirComanda(trocaComanda, trocaMesa);
        if (r.ok) {
          setTrocaOpen(false);
          setToast(`Comanda movida para ${trocaMesa}!`);
          setTimeout(() => router.push(`/garcom/mesa/${encodeURIComponent(trocaMesa)}`), 900);
        } else {
          setToast(r.mensagem || "Não foi possível transferir.");
          setTimeout(() => setToast(null), 3000);
        }
      } catch {
        setToast("Sem conexão. Tente de novo.");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  function novoId() {
    try { return crypto.randomUUID(); } catch { return ""; }
  }

  function lancar() {
    if (cart.length === 0 || proc) return;
    if (!lancIdRef.current) lancIdRef.current = novoId();
    start(async () => {
      try {
        const r = await lancarPedidoGarcomLinhas(
          mesa,
          cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
          obs,
          comandaSel === "nova" ? undefined : comandaSel,
          lancIdRef.current || undefined,
        );
        if (r.ok) {
          lancIdRef.current = "";
          setToast("jaLancado" in r && r.jaLancado ? "Esse pedido já tinha sido lançado ✓" : "Pedido realizado com sucesso!");
          setTimeout(() => router.push("/garcom"), 900);
        } else {
          setToast(r.mensagem || "Não foi possível lançar.");
          setTimeout(() => setToast(null), 3500);
        }
      } catch {
        // Rede caiu no meio: o carrinho fica como está; ao tentar de novo vai
        // com a mesma chave, então não duplica se o servidor já tiver gravado.
        setToast("Sem conexão. Toque em Lançar de novo — não vai duplicar.");
        setTimeout(() => setToast(null), 4000);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-painel-fundo text-texto">
      {/* Topo */}
      <div className="flex items-center justify-between border-b border-borda px-3 py-3">
        <div className="flex items-center gap-2">
          <Link href="/garcom" className="text-xl text-texto-suave">←</Link>
          <span className="text-lg font-bold">{mesa}</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium text-blue-400">
          <button onClick={() => setContaOpen(true)} className="inline-flex items-center gap-1.5"><Icone nome="cupom" tamanho={14} /> Conta</button>
          <button onClick={() => { setTrocaComanda(comandas[0]?.id ?? ""); setTrocaMesa(""); setTrocaOpen(true); }}>⇄ Trocar mesa</button>
        </div>
      </div>

      {/* Busca (quando ativa) */}
      {buscaOn && (
        <div className="border-b border-borda p-2">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm "
          />
        </div>
      )}

      {/* Conteúdo: produtos (esq) + categorias (dir) */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-2">
          {visiveis.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-fraco">Nenhum produto.</p>
          ) : (
            <div className="space-y-2">
              {visiveis.map((i) => {
                const q = qtdDoItem(i.id);
                const temCompl = comComplSet.has(i.id) && gruposDe(i.id).length > 0;
                return (
                  <div
                    key={i.id}
                    onClick={() => (q === 0 || temCompl) && add(i)}
                    className={`flex items-center justify-between rounded-controle border p-3 ${q > 0 ? "border-blue-500 bg-blue-500/10" : "border-borda bg-painel-cartao"}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{i.nome}{temCompl && <Icone nome="ajustes" tamanho={12} className="ml-1 text-texto-suave" />}</div>
                      <div className="text-sm text-emerald-400">{i.preco > 0 ? brl(i.preco) : "Preço variável"}</div>
                    </div>
                    {q > 0 && (
                      <div className="flex items-center gap-3 rounded-controle border border-blue-500 px-2 py-1">
                        <button onClick={(e) => { e.stopPropagation(); tiraUm(i.id); }} className="text-lg">{q === 1 ? <Icone nome="lixeira" tamanho={16} titulo="Tirar" /> : "−"}</button>
                        <span className="w-5 text-center font-bold">{q}</span>
                        <button onClick={(e) => { e.stopPropagation(); add(i); }} className="text-lg text-blue-400">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rail de categorias */}
        <div className="w-28 shrink-0 overflow-y-auto border-l border-borda bg-painel-cartao/50 p-1.5">
          {pizza.tamanhos.length > 0 && (
            <button
              onClick={() => setPzOpen(true)}
              className="mb-1.5 w-full rounded-controle bg-orange-500 px-2 py-3 text-xs font-bold text-white"
            >
              <Icone nome="pizza" tamanho={16} className="mr-1.5" /> Montar pizza
            </button>
          )}
          {abas.map((c) => (
            <button
              key={c}
              onClick={() => setAba(c)}
              style={{ borderLeftColor: corDe(c) }}
              className={`mb-1.5 w-full rounded-controle border-l-4 px-2 py-3 text-xs font-medium ${aba === c ? "bg-zinc-700 text-white" : "bg-superficie-suave/60 text-texto-suave"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-3 border-t border-borda p-3">
        <button onClick={() => { setBuscaOn((v) => !v); if (buscaOn) setBusca(""); }} className="flex h-11 w-11 items-center justify-center rounded-full border border-borda-forte"><Icone nome="buscar" tamanho={19} titulo="Buscar" /></button>
        <button
          onClick={() => setCartOpen(true)}
          disabled={cartCount === 0}
          className={`flex flex-1 items-center justify-center gap-2 rounded-cartao py-3 text-base font-bold ${cartCount > 0 ? "bg-blue-600 text-white" : "bg-superficie-suave text-texto-fraco"}`}
        >
          <Icone nome="compras" tamanho={16} className="mr-1.5" /> Carrinho{cartCount > 0 ? ` (${cartCount})` : ""}
        </button>
      </div>

      {/* Carrinho */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-painel-fundo">
          <div className="flex items-center justify-between border-b border-borda p-3">
            <span className="text-lg font-bold">Carrinho · {mesa}</span>
            <button onClick={() => setCartOpen(false)} className="text-texto-suave">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-texto-fraco">Carrinho vazio.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.uid} className="flex items-start justify-between rounded-controle border border-borda bg-painel-cartao p-3">
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-pre-line text-sm font-medium leading-tight">{l.descricao}</div>
                      <div className="mt-0.5 text-sm text-emerald-400">{brl(l.preco * l.qtd)}</div>
                    </div>
                    <div className="ml-2 flex items-center gap-3 rounded-controle border border-borda-forte px-2 py-1">
                      <button onClick={() => setQtdLinha(l.uid, l.qtd - 1)} className="text-lg">{l.qtd === 1 ? <Icone nome="lixeira" tamanho={16} titulo="Tirar" /> : "−"}</button>
                      <span className="w-5 text-center font-bold">{l.qtd}</span>
                      <button onClick={() => setQtdLinha(l.uid, l.qtd + 1)} className="text-lg text-blue-400">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-[60vh] shrink-0 overflow-y-auto border-t border-borda p-3">
            {/* Escolher a comanda (lista rola quando a mesa tem muitas) */}
            <p className="mb-1 text-xs text-texto-suave">Lançar na comanda:{comandas.length > 6 ? " (" + comandas.length + " abertas — role a lista)" : ""}</p>
            <div className="mb-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-controle">
              {comandas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setComandaSel(c.id)}
                  className={`rounded-controle px-3 py-1.5 text-sm font-medium ${comandaSel === c.id ? "bg-blue-600 text-white" : "border border-borda-forte text-texto-suave"}`}
                >
                  Comanda {c.numero}
                </button>
              ))}
              <button
                onClick={() => setComandaSel("nova")}
                className={`rounded-controle px-3 py-1.5 text-sm font-medium ${comandaSel === "nova" ? "bg-blue-600 text-white" : "border border-borda-forte text-texto-suave"}`}
              >
                + Nova comanda
              </button>
            </div>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observações do pedido (opcional)"
              rows={2}
              className="mb-2 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm "
            />
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-texto-suave">Total</span>
              <span className="font-bold">{brl(cartTotal)}</span>
            </div>
            <button
              onClick={lancar}
              disabled={proc || cart.length === 0}
              className="w-full rounded-cartao bg-blue-600 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              {proc ? "Lançando..." : "✓ Lançar pedido"}
            </button>
          </div>
        </div>
      )}

      {/* Conta / histórico do que foi lançado */}
      {contaOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col bg-painel-fundo">
          <div className="flex items-center justify-between border-b border-borda p-3">
            <span className="text-lg font-bold">Conta · {mesa}</span>
            <button onClick={() => setContaOpen(false)} className="text-texto-suave">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {comandas.length === 0 ? (
              <p className="py-10 text-center text-sm text-texto-fraco">Esta mesa não tem comanda aberta.</p>
            ) : (
              <div className="space-y-4">
                {comandas.map((c) => (
                  <div key={c.id} className="rounded-controle border border-borda bg-painel-cartao">
                    <div className="flex items-center justify-between border-b border-borda px-3 py-2">
                      <span className="font-bold">Comanda {c.numero}</span>
                      <span className="font-bold text-emerald-400">{brl(c.total)}</span>
                    </div>
                    {/* Avisa o caixa que a mesa chamou pra fechar: pinta a mesa
                        no mapa da tela inicial. O caixa também pode marcar. */}
                    <button
                      onClick={() => avisarConta(c.id)}
                      disabled={avisando === c.id}
                      className="flex min-h-11 w-full items-center justify-center gap-2 border-b border-borda text-sm font-semibold text-amber-300 disabled:opacity-60"
                    >
                      <Icone nome="cupom" tamanho={15} />
                      {avisadas.has(c.id) ? "Caixa avisado" : "Avisar o caixa que pediu a conta"}
                    </button>
                    <div className="divide-y divide-borda/60">
                      {c.buffet > 0 && (
                        <div className="flex justify-between px-3 py-1.5 text-sm">
                          <span className="text-texto-suave">Buffet (balança)</span>
                          <span>{brl(c.buffet)}</span>
                        </div>
                      )}
                      {c.itens.length === 0 && c.buffet === 0 ? (
                        <p className="px-3 py-2 text-sm text-texto-fraco">Nada lançado ainda.</p>
                      ) : (
                        c.itens.map((it, idx) => (
                          <div key={idx} className="flex justify-between px-3 py-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate whitespace-pre-line text-texto">
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
          <div className="flex items-center justify-between border-t border-borda p-3 text-lg">
            <span className="font-medium text-texto-suave">Total da mesa</span>
            <span className="font-bold text-emerald-400">{brl(totalMesa)}</span>
          </div>
        </div>
      )}

      {/* Trocar mesa: mover a comanda para outra mesa */}
      {trocaOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col bg-painel-fundo">
          <div className="flex items-center justify-between border-b border-borda p-3">
            <span className="text-lg font-bold">Trocar mesa</span>
            <button onClick={() => setTrocaOpen(false)} className="text-texto-suave">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {comandas.length === 0 ? (
              <p className="py-10 text-center text-sm text-texto-fraco">Esta mesa não tem comanda para mover.</p>
            ) : (
              <>
                {comandas.length > 1 && (
                  <>
                    <p className="mb-1 text-xs text-texto-suave">Qual comanda mover?</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {comandas.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setTrocaComanda(c.id)}
                          className={`rounded-controle px-3 py-1.5 text-sm font-medium ${trocaComanda === c.id ? "bg-blue-600 text-white" : "border border-borda-forte text-texto-suave"}`}
                        >
                          Comanda {c.numero}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <p className="mb-1 text-xs text-texto-suave">Mover para qual mesa?</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {mesas.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTrocaMesa(m)}
                      className={`rounded-controle px-2 py-2.5 text-sm font-medium ${trocaMesa === m ? "bg-blue-600 text-white" : "border border-borda-forte text-texto-suave"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {comandas.length > 0 && (
            <div className="border-t border-borda p-3">
              <button
                onClick={transferir}
                disabled={proc || !trocaComanda || !trocaMesa}
                className="w-full rounded-cartao bg-blue-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                {proc ? "Movendo..." : trocaMesa ? `⇄ Mover para ${trocaMesa}` : "Escolha a mesa"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Montador de pizza / combos (compartilhados com o delivery) */}
      {pzOpen && <PizzaModal pizza={pizza} comObs onClose={() => setPzOpen(false)} onAdd={(l) => { addLinha(l); setPzOpen(false); }} />}
      {comboItem && <ComboModal item={comboItem} grupos={gruposDe(comboItem.id)} opcoesDe={opcoesDe} comObs onClose={() => setComboItem(null)} onAdd={(l) => { addLinha(l); setComboItem(null); }} />}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="rounded-cartao bg-superficie-suave px-8 py-6 text-center">
            <div className="mb-2 flex justify-center"><Icone nome="certo" tamanho={42} className="text-emerald-500" /></div>
            <p className="font-semibold">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
