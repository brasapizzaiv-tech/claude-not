"use client";

import { useMemo, useState, useTransition } from "react";
import { enviarPedidoPublico, calcularEntregaPublico } from "./actions";
import {
  PizzaModal, ComboModal, brl, novoUid,
  type Item, type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";

const LARANJA = "#C78340";
const ESCURO = "#211915";
const FORMAS = [
  { id: "Dinheiro", label: "💵 Dinheiro" },
  { id: "Pix", label: "📱 Pix na entrega" },
  { id: "Cartão", label: "💳 Cartão na entrega" },
];

export function PedirClient({
  itens, categorias, comComplemento, pizza, complementos, aberto, tempoPreparo,
}: {
  itens: Item[];
  categorias: string[];
  comComplemento: string[];
  pizza: PizzaData;
  complementos: { grupos: Grupo[]; opcoes: Opcao[] };
  aberto: boolean;
  tempoPreparo: number;
}) {
  const [proc, start] = useTransition();
  const [fase, setFase] = useState<"menu" | "checkout">("menu");
  const [aba, setAba] = useState(categorias[0] ?? "");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipo, setTipo] = useState<"entrega" | "retirada">("entrega");
  const [end, setEnd] = useState({ logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Ivoti", referencia: "", cep: "" });
  const [taxa, setTaxa] = useState<number | null>(null);
  const [calcMsg, setCalcMsg] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [forma, setForma] = useState("Dinheiro");
  const [trocoPara, setTrocoPara] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ id: string; numero?: number } | null>(null);

  const [pzOpen, setPzOpen] = useState(false);
  const [comboItem, setComboItem] = useState<Item | null>(null);

  const comComplSet = useMemo(() => new Set(comComplemento), [comComplemento]);
  const gruposDe = (itemId: string) => complementos.grupos.filter((g) => g.item_id === itemId);
  const opcoesDe = (grupoId: string) => complementos.opcoes.filter((o) => o.grupo_id === grupoId);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (!q ? i.categoria === aba : i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  const subtotal = cart.reduce((s, l) => s + l.preco * l.qtd, 0);
  const qtdItens = cart.reduce((s, l) => s + l.qtd, 0);
  const taxaN = tipo === "retirada" ? 0 : taxa ?? 0;
  const total = Math.round((subtotal + taxaN) * 100) / 100;

  function addLinha(l: CartLine) { setCart((c) => [...c, l]); }
  function setQtd(uid: string, q: number) { setCart((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: q } : l)).filter((l) => l.qtd > 0)); }
  function clicarItem(i: Item) {
    if (comComplSet.has(i.id) && gruposDe(i.id).length) { setComboItem(i); return; }
    addLinha({ uid: novoUid(), descricao: i.nome, preco: i.preco, qtd: 1, payload: { kind: "item", itemId: i.id, qtd: 1 } });
  }

  async function calcularTaxa() {
    if (!end.logradouro.trim()) { setCalcMsg("Preencha a rua primeiro."); return; }
    setCalculando(true); setCalcMsg(null);
    const r = await calcularEntregaPublico({ logradouro: end.logradouro, numero: end.numero, bairro: end.bairro, cidade: end.cidade, cep: end.cep });
    setCalculando(false);
    if (r.ok) {
      if (r.foraDeArea) { setTaxa(null); setCalcMsg("😕 Esse endereço fica fora da nossa área de entrega."); return; }
      setTaxa(r.taxa);
      setCalcMsg(`Entrega: ${brl(r.taxa)} (${r.distanciaKm} km)`);
    } else {
      setTaxa(null);
      setCalcMsg(r.mensagem ?? "Não consegui calcular. Confira o endereço.");
    }
  }

  function enviar() {
    setErro(null);
    if (cart.length === 0) { setErro("Seu carrinho está vazio."); return; }
    if (!nome.trim()) { setErro("Informe seu nome."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { setErro("Informe seu telefone com DDD."); return; }
    if (tipo === "entrega" && !end.logradouro.trim()) { setErro("Informe o endereço de entrega."); return; }
    if (tipo === "entrega" && taxa == null) { setErro("Toque em \"Calcular entrega\" pra confirmar a taxa."); return; }
    const trocoN = forma === "Dinheiro" ? Number(trocoPara.replace(",", ".")) || 0 : 0;
    start(async () => {
      const r = await enviarPedidoPublico({
        nome, telefone, tipo,
        endereco: tipo === "entrega" ? end : undefined,
        formaPagamento: forma, trocoPara: trocoN || null,
        observacao: obs,
        itens: cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
      });
      if (r.ok) { setFeito({ id: r.id, numero: r.numero }); setCart([]); }
      else setErro(r.mensagem || "Não foi possível enviar. Tente de novo.");
    });
  }

  // ---------- telas ----------
  if (feito) {
    return (
      <Casca>
        <div className="px-5 py-14 text-center">
          <div className="mb-3 text-6xl">🎉</div>
          <h1 className="text-2xl font-bold">Pedido enviado!</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">
            {feito.numero ? <>Seu pedido é o <b>nº {feito.numero}</b>. </> : null}
            O restaurante vai confirmar em instantes — tempo estimado de preparo: ~{tempoPreparo} min.
          </p>
          <a
            href={`/pedir/acompanhar/${feito.id}`}
            className="mt-6 inline-block rounded-2xl px-6 py-3.5 font-bold text-white"
            style={{ background: LARANJA }}
          >
            Acompanhar meu pedido →
          </a>
          <p className="mt-4 text-xs text-zinc-400">Guarde esse link pra ver o andamento.</p>
        </div>
      </Casca>
    );
  }

  if (fase === "checkout") {
    return (
      <Casca>
        <div className="p-4 pb-40">
          <button onClick={() => setFase("menu")} className="mb-3 text-sm font-semibold" style={{ color: LARANJA }}>← Voltar pro cardápio</button>
          <h1 className="mb-3 text-xl font-bold">Seu pedido</h1>

          <div className="mb-4 space-y-1.5">
            {cart.map((l) => (
              <div key={l.uid} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700">
                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-line text-sm font-medium leading-tight">{l.descricao}</div>
                  <div className="text-xs" style={{ color: LARANJA }}>{brl(l.preco * l.qtd)}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQtd(l.uid, l.qtd - 1)} className="h-7 w-7 rounded-lg border border-zinc-300 dark:border-zinc-600">{l.qtd === 1 ? "🗑️" : "−"}</button>
                  <span className="w-5 text-center font-bold">{l.qtd}</span>
                  <button onClick={() => setQtd(l.uid, l.qtd + 1)} className="h-7 w-7 rounded-lg border border-zinc-300 font-bold dark:border-zinc-600" style={{ color: LARANJA }}>+</button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">Carrinho vazio — volte pro cardápio.</p>}
          </div>

          <h2 className="mb-2 font-bold">Seus dados</h2>
          <div className="mb-4 space-y-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="Telefone com DDD (51 99999-9999)" className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
          </div>

          <h2 className="mb-2 font-bold">Como você quer receber?</h2>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button onClick={() => setTipo("entrega")} className={`rounded-xl border py-2.5 font-semibold ${tipo === "entrega" ? "text-white" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`} style={tipo === "entrega" ? { background: LARANJA, borderColor: LARANJA } : {}}>🛵 Entrega</button>
            <button onClick={() => setTipo("retirada")} className={`rounded-xl border py-2.5 font-semibold ${tipo === "retirada" ? "text-white" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`} style={tipo === "retirada" ? { background: LARANJA, borderColor: LARANJA } : {}}>🏃 Retirar no balcão</button>
          </div>

          {tipo === "entrega" && (
            <div className="mb-4 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input value={end.logradouro} onChange={(e) => { setEnd({ ...end, logradouro: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Rua" className="col-span-2 rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
                <input value={end.numero} onChange={(e) => { setEnd({ ...end, numero: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Nº" className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={end.bairro} onChange={(e) => { setEnd({ ...end, bairro: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Bairro" className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
                <input value={end.cidade} onChange={(e) => { setEnd({ ...end, cidade: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Cidade" className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
              </div>
              <input value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} placeholder="Complemento (apto, casa...)" className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
              <input value={end.referencia} onChange={(e) => setEnd({ ...end, referencia: e.target.value })} placeholder="Ponto de referência (opcional)" className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
              <button onClick={calcularTaxa} disabled={calculando} className="w-full rounded-xl border-2 py-2.5 font-bold disabled:opacity-50" style={{ borderColor: LARANJA, color: LARANJA }}>
                {calculando ? "Calculando..." : "📍 Calcular entrega"}
              </button>
              {calcMsg && <p className="text-sm text-zinc-600 dark:text-zinc-300">{calcMsg}</p>}
            </div>
          )}

          <h2 className="mb-2 font-bold">Pagamento (na {tipo === "entrega" ? "entrega" : "retirada"})</h2>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {FORMAS.map((f) => (
              <button key={f.id} onClick={() => setForma(f.id)} className={`rounded-xl border px-1 py-2.5 text-xs font-semibold ${forma === f.id ? "text-white" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`} style={forma === f.id ? { background: LARANJA, borderColor: LARANJA } : {}}>{f.label}</button>
            ))}
          </div>
          {forma === "Dinheiro" && (
            <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="mb-3 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
          )}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Alguma observação? (opcional)" rows={2} className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
        </div>

        {/* rodapé fixo */}
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-lg">
            <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {tipo === "entrega" && <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Entrega</span><span>{taxa == null ? "—" : brl(taxaN)}</span></div>}
            <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
            {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
            <button onClick={enviar} disabled={proc || !aberto} className="w-full rounded-2xl py-3.5 text-base font-bold text-white disabled:opacity-50" style={{ background: LARANJA }}>
              {proc ? "Enviando..." : aberto ? "✅ Enviar pedido" : "Delivery fechado agora"}
            </button>
          </div>
        </div>
      </Casca>
    );
  }

  // fase "menu"
  return (
    <Casca>
      {!aberto && (
        <div className="bg-rose-600 px-4 py-2 text-center text-sm font-bold text-white">😴 Estamos fechados agora — você pode olhar o cardápio, mas não dá pra pedir.</div>
      )}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar no cardápio..." className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
        {!busca && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {pizza.tamanhos.length > 0 && (
              <button onClick={() => setPzOpen(true)} className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold text-white" style={{ background: LARANJA }}>🍕 Montar pizza</button>
            )}
            {categorias.map((c) => (
              <button key={c} onClick={() => setAba(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${aba === c ? "text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`} style={aba === c ? { background: ESCURO } : {}}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 p-3 pb-28 sm:grid-cols-2">
        {visiveis.map((i) => {
          const noCarrinho = cart.filter((l) => l.payload.kind !== "pizza" && "itemId" in l.payload && l.payload.itemId === i.id).reduce((s, l) => s + l.qtd, 0);
          return (
            <button key={i.id} onClick={() => clicarItem(i)} className={`flex items-center justify-between rounded-2xl border p-3 text-left ${noCarrinho > 0 ? "" : "border-zinc-200 dark:border-zinc-800"}`} style={noCarrinho > 0 ? { borderColor: LARANJA, background: "rgba(199,131,64,0.06)" } : {}}>
              <div className="min-w-0">
                <div className="font-medium leading-tight">{i.nome}{noCarrinho > 0 ? ` (${noCarrinho})` : ""}{comComplSet.has(i.id) ? " ⚙️" : ""}</div>
                <div className="text-sm font-semibold" style={{ color: LARANJA }}>{i.preco > 0 ? brl(i.preco) : "consulte"}</div>
              </div>
              <span className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: LARANJA }}>+</span>
            </button>
          );
        })}
        {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-400">Nada encontrado.</p>}
      </div>

      {qtdItens > 0 && (
        <div className="fixed inset-x-0 bottom-0 p-4">
          <div className="mx-auto max-w-lg">
            <button onClick={() => setFase("checkout")} className="flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-white shadow-lg" style={{ background: ESCURO }}>
              <span className="font-bold">🛒 Ver pedido ({qtdItens})</span>
              <span className="font-bold">{brl(subtotal)}</span>
            </button>
          </div>
        </div>
      )}

      {pzOpen && <PizzaModal pizza={pizza} onClose={() => setPzOpen(false)} onAdd={(l) => { addLinha(l); setPzOpen(false); }} />}
      {comboItem && <ComboModal item={comboItem} grupos={gruposDe(comboItem.id)} opcoesDe={opcoesDe} onClose={() => setComboItem(null)} onAdd={(l) => { addLinha(l); setComboItem(null); }} />}
    </Casca>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="px-4 py-3 text-white" style={{ background: ESCURO }}>
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <span className="text-2xl">🍕</span>
          <div>
            <div className="text-lg font-bold" style={{ color: LARANJA }}>Brasa Pizzaria e Restaurante</div>
            <div className="text-xs text-zinc-300">Peça online · entrega ou retirada</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg">{children}</main>
    </div>
  );
}
