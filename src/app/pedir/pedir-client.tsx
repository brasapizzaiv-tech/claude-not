"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import { enviarPedidoPublico, calcularEntregaPublico, meusPedidos, validarCupomPublico, verificarPixPedido } from "./actions";
import {
  PizzaModal, ComboModal, brl, novoUid,
  type Item, type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";

const LARANJA = "#C78340";
const ESCURO = "#211915";
const FORMAS_BASE = [
  { id: "Dinheiro", label: "💵 Dinheiro" },
  { id: "Pix", label: "📱 Pix na entrega" },
  { id: "Cartão", label: "💳 Cartão na entrega" },
];

// QR do Pix gerado na hora a partir do copia-e-cola.
function QrPix({ codigo }: { codigo: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(codigo, { width: 260, margin: 1 }).then(setSrc).catch(() => {});
  }, [codigo]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR Code Pix" className="mx-auto h-64 w-64 rounded-xl bg-white p-2" />;
}
const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando confirmação", aceito: "Confirmado", em_preparo: "Preparando",
  pronto: "Pronto", saiu: "Saiu pra entrega", entregue: "Entregue", cancelado: "Cancelado",
};

function FotoItem({ url, size = "h-20 w-24" }: { url?: string | null; size?: string }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />;
}

export function PedirClient({
  itens, categorias, comComplemento, pizza, complementos, aberto, tempoPreparo, aviso, maisVendidos, pixAtivo,
}: {
  itens: Item[];
  categorias: string[];
  comComplemento: string[];
  pizza: PizzaData;
  complementos: { grupos: Grupo[]; opcoes: Opcao[] };
  aberto: boolean;
  tempoPreparo: number;
  aviso: string | null;
  maisVendidos: string[];
  pixAtivo?: boolean;
}) {
  const [proc, start] = useTransition();
  const [fase, setFase] = useState<"menu" | "checkout" | "historico">("menu");
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
  const [cupomCodigo, setCupomCodigo] = useState("");
  const [cupom, setCupom] = useState<{ codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null } | null>(null);
  const [cupomMsg, setCupomMsg] = useState<string | null>(null);
  const [cupomProc, setCupomProc] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ id: string; numero?: number; pix?: { copiaECola: string } | null } | null>(null);
  const [pixPago, setPixPago] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const FORMAS = pixAtivo ? [{ id: "Pix online", label: "💠 Pix agora" }, ...FORMAS_BASE] : FORMAS_BASE;

  const [pzTamanho, setPzTamanho] = useState<string | null>(null);
  const [comboItem, setComboItem] = useState<Item | null>(null);

  // histórico
  const [histTel, setHistTel] = useState("");
  const [histLista, setHistLista] = useState<Awaited<ReturnType<typeof meusPedidos>> | null>(null);
  const [histBuscando, setHistBuscando] = useState(false);

  // Preenche nome/telefone salvos do último pedido (fora do corpo do effect
  // pra não causar render em cascata).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const t = localStorage.getItem("pedir_tel") || "";
        const n = localStorage.getItem("pedir_nome") || "";
        if (t) { setTelefone(t); setHistTel(t); }
        if (n) setNome(n);
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const comComplSet = useMemo(() => new Set(comComplemento), [comComplemento]);
  const gruposDe = (itemId: string) => complementos.grupos.filter((g) => g.item_id === itemId);
  const opcoesDe = (grupoId: string) => complementos.opcoes.filter((o) => o.grupo_id === grupoId);
  const itemDe = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (!q ? i.categoria === aba : i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  // menor preço de sabor por tamanho ("a partir de")
  const aPartirDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pizza.saborPrecos) {
      const cur = m.get(p.tamanho_id);
      if (cur == null || p.preco < cur) m.set(p.tamanho_id, p.preco);
    }
    return m;
  }, [pizza.saborPrecos]);

  const subtotal = cart.reduce((s, l) => s + l.preco * l.qtd, 0);
  const qtdItens = cart.reduce((s, l) => s + l.qtd, 0);
  const taxaN = tipo === "retirada" ? 0 : taxa ?? 0;
  const descontoCupom = !cupom || (cupom.minimo != null && subtotal < cupom.minimo)
    ? 0
    : cupom.tipo === "percent"
      ? Math.round(subtotal * cupom.valor) / 100
      : Math.min(subtotal, cupom.valor);
  const total = Math.round((subtotal + taxaN - descontoCupom) * 100) / 100;

  async function aplicarCupom() {
    if (!cupomCodigo.trim()) return;
    setCupomProc(true); setCupomMsg(null);
    const r = await validarCupomPublico(cupomCodigo);
    setCupomProc(false);
    if (r.ok) {
      setCupom({ codigo: r.codigo, tipo: r.tipo, valor: r.valor, minimo: r.minimo });
      setCupomMsg(`✅ Cupom ${r.codigo}: ${r.tipo === "percent" ? `${r.valor}% de desconto` : `R$ ${r.valor.toFixed(2).replace(".", ",")} de desconto`}${r.minimo != null ? ` (pedido mínimo R$ ${r.minimo.toFixed(2).replace(".", ",")})` : ""}`);
    } else {
      setCupom(null);
      setCupomMsg(`❌ ${r.mensagem}`);
    }
  }

  function addLinha(l: CartLine) { setCart((c) => [...c, l]); }
  function setQtd(uid: string, q: number) { setCart((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: q } : l)).filter((l) => l.qtd > 0)); }
  function setObsLinha(uid: string, v: string) {
    setCart((c) => c.map((l) => (l.uid === uid ? { ...l, payload: { ...l.payload, obs: v || undefined } } : l)));
  }
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
        cupom: cupom?.codigo ?? null,
        itens: cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
      });
      if (r.ok) {
        try { localStorage.setItem("pedir_tel", telefone); localStorage.setItem("pedir_nome", nome); } catch { /* sem storage */ }
        setFeito({ id: r.id, numero: r.numero, pix: r.pix ?? null }); setPixPago(false); setCart([]);
      } else setErro(r.mensagem || "Não foi possível enviar. Tente de novo.");
    });
  }

  async function buscarHistorico() {
    if (histTel.replace(/\D/g, "").length < 10) { setHistLista([]); return; }
    setHistBuscando(true);
    const lista = await meusPedidos(histTel);
    setHistBuscando(false);
    setHistLista(lista);
  }

  // Fica de olho no Pix: quando cair, confirma sozinho na tela.
  useEffect(() => {
    if (!feito?.pix || pixPago) return;
    const t = setInterval(async () => {
      try {
        const r = await verificarPixPedido(feito.id);
        if (r.ok && r.pago) setPixPago(true);
      } catch { /* tenta de novo */ }
    }, 4000);
    return () => clearInterval(t);
  }, [feito, pixPago]);

  // ---------- telas ----------
  if (feito) {
    return (
      <Casca onMeusPedidos={() => { setFeito(null); setFase("historico"); }}>
        <div className="px-5 py-14 text-center">
          <div className="mb-3 text-6xl">🎉</div>
          <h1 className="text-2xl font-bold">Pedido enviado!</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">
            {feito.numero ? <>Seu pedido é o <b>nº {feito.numero}</b>. </> : null}
            O restaurante vai confirmar em instantes — tempo estimado de preparo: ~{tempoPreparo} min.
          </p>
          {feito.pix && !pixPago && (
            <div className="mx-auto mt-6 max-w-sm rounded-2xl border-2 p-4" style={{ borderColor: LARANJA }}>
              <p className="mb-3 font-bold">💠 Pague agora com Pix</p>
              <QrPix codigo={feito.pix.copiaECola} />
              <button
                onClick={() => {
                  try { navigator.clipboard.writeText(feito.pix!.copiaECola); setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500); } catch { /* sem clipboard */ }
                }}
                className="mt-3 w-full rounded-xl border-2 py-2.5 font-bold"
                style={{ borderColor: LARANJA, color: LARANJA }}
              >
                {pixCopiado ? "✓ Código copiado!" : "📋 Copiar código Pix"}
              </button>
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Aguardando o pagamento... confirma sozinho aqui.
              </p>
            </div>
          )}
          {feito.pix && pixPago && (
            <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-emerald-500/10 p-4 text-lg font-bold text-emerald-600">
              💚 Pagamento confirmado! Seu pedido já está como PAGO.
            </div>
          )}
          <a href={`/pedir/acompanhar/${feito.id}`} className="mt-6 inline-block rounded-2xl px-6 py-3.5 font-bold text-white" style={{ background: LARANJA }}>
            Acompanhar meu pedido →
          </a>
          <p className="mt-4 text-xs text-zinc-400">Guarde esse link pra ver o andamento.</p>
        </div>
      </Casca>
    );
  }

  if (fase === "historico") {
    return (
      <Casca onMeusPedidos={() => setFase("menu")}>
        <div className="p-4">
          <button onClick={() => setFase("menu")} className="mb-3 text-sm font-semibold" style={{ color: LARANJA }}>← Voltar pro cardápio</button>
          <h1 className="mb-3 text-xl font-bold">📋 Meus pedidos</h1>
          <div className="mb-4 flex gap-2">
            <input value={histTel} onChange={(e) => setHistTel(e.target.value)} inputMode="tel" placeholder="Seu telefone com DDD" className="flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
            <button onClick={buscarHistorico} disabled={histBuscando} className="rounded-xl px-4 font-bold text-white disabled:opacity-50" style={{ background: LARANJA }}>{histBuscando ? "..." : "Buscar"}</button>
          </div>
          {histLista !== null && (
            histLista.length === 0 ? <p className="py-8 text-center text-sm text-zinc-400">Nenhum pedido encontrado pra esse telefone.</p> : (
              <div className="space-y-2">
                {histLista.map((h) => (
                  <a key={h.id} href={`/pedir/acompanhar/${h.id}`} className="block rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Pedido nº {h.numero ?? "—"}</span>
                      <span className="text-sm font-semibold" style={{ color: LARANJA }}>{brl(h.total)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-500">
                      <span>{new Date(h.criadoEm).toLocaleDateString("pt-BR")} · {h.tipo === "retirada" ? "Retirada" : "Entrega"}</span>
                      <span>{STATUS_LABEL[h.status] ?? h.status}</span>
                    </div>
                  </a>
                ))}
              </div>
            )
          )}
        </div>
      </Casca>
    );
  }

  if (fase === "checkout") {
    return (
      <Casca onMeusPedidos={() => setFase("historico")}>
        <div className="p-4 pb-44">
          <button onClick={() => setFase("menu")} className="mb-3 text-sm font-semibold" style={{ color: LARANJA }}>← Voltar pro cardápio</button>
          <h1 className="mb-3 text-xl font-bold">Seu pedido</h1>

          <div className="mb-4 space-y-1.5">
            {cart.map((l) => (
              <div key={l.uid} className="rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700">
                <div className="flex items-start justify-between gap-2">
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
                <input
                  value={l.payload.obs ?? ""}
                  onChange={(e) => setObsLinha(l.uid, e.target.value)}
                  maxLength={200}
                  placeholder="📝 Observação deste item (ex.: sem cebola)"
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-xs outline-none dark:border-zinc-800"
                />
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
          <div className="mb-3 flex gap-2">
            <input value={cupomCodigo} onChange={(e) => { setCupomCodigo(e.target.value.toUpperCase()); }} placeholder="🎟️ Cupom de desconto" className="flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 uppercase outline-none dark:border-zinc-700" />
            <button onClick={aplicarCupom} disabled={cupomProc || !cupomCodigo.trim()} className="rounded-xl border-2 px-4 font-bold disabled:opacity-50" style={{ borderColor: LARANJA, color: LARANJA }}>{cupomProc ? "..." : "Aplicar"}</button>
          </div>
          {cupomMsg && <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">{cupomMsg}</p>}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Alguma observação geral? (opcional)" rows={2} className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-lg">
            <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {tipo === "entrega" && <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Entrega</span><span>{taxa == null ? "—" : brl(taxaN)}</span></div>}
            {descontoCupom > 0 && <div className="mb-1 flex justify-between text-sm font-semibold text-emerald-600"><span>Cupom {cupom?.codigo}</span><span>− {brl(descontoCupom)}</span></div>}
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
  const destaque = maisVendidos.map((id) => itemDe.get(id)).filter(Boolean) as Item[];
  return (
    <Casca onMeusPedidos={() => setFase("historico")}>
      {!aberto && (
        <div className="bg-rose-600 px-4 py-2 text-center text-sm font-bold text-white">😴 Estamos fechados agora — você pode olhar o cardápio, mas não dá pra pedir.</div>
      )}
      {aviso && (
        <div className="px-4 py-2 text-center text-sm font-semibold text-white" style={{ background: LARANJA }}>📢 {aviso}</div>
      )}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar no cardápio..." className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none dark:border-zinc-700" />
        {!busca && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {pizza.tamanhos.length > 0 && (
              <button onClick={() => setAba("__pizzas__")} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${aba === "__pizzas__" ? "text-white" : ""}`} style={aba === "__pizzas__" ? { background: LARANJA } : { color: LARANJA, background: "rgba(199,131,64,0.12)" }}>🍕 Pizzas</button>
            )}
            {categorias.map((c) => (
              <button key={c} onClick={() => setAba(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${aba === c ? "text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`} style={aba === c ? { background: ESCURO } : {}}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Os mais vendidos */}
      {!busca && destaque.length > 0 && aba !== "__pizzas__" && (
        <div className="pt-3">
          <h2 className="px-3 font-bold">🔥 Os mais vendidos</h2>
          <div className="flex gap-2 overflow-x-auto p-3">
            {destaque.map((i) => (
              <button key={i.id} onClick={() => clicarItem(i)} className="w-40 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 text-left dark:border-zinc-800">
                {i.foto_url ? <FotoItem url={i.foto_url} size="h-24 w-full" /> : <div className="flex h-24 w-full items-center justify-center text-3xl" style={{ background: "rgba(199,131,64,0.1)" }}>🍽️</div>}
                <div className="p-2">
                  <div className="truncate text-sm font-medium">{i.nome}</div>
                  <div className="text-sm font-semibold" style={{ color: LARANJA }}>{i.preco_antigo != null && <span className="mr-1 text-xs font-normal text-zinc-400 line-through">{brl(i.preco_antigo)}</span>}{i.preco > 0 ? brl(i.preco) : "consulte"}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 p-3 pb-28">
        {/* Pizzas por tamanho */}
        {!busca && aba === "__pizzas__" && pizza.tamanhos.map((t) => {
          const min = aPartirDe.get(t.id);
          return (
            <button key={t.id} onClick={() => setPzTamanho(t.id)} className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 p-3 text-left dark:border-zinc-800">
              <div>
                <div className="font-bold">{t.nome}</div>
                <div className="text-xs text-zinc-500">{t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}{t.fatias ? `, ${t.fatias} fatia${t.fatias > 1 ? "s" : ""}` : ""}</div>
                {min != null && <div className="mt-0.5 text-sm font-semibold text-emerald-600">A partir de {brl(min)}</div>}
              </div>
              <span className="text-3xl">🍕</span>
            </button>
          );
        })}

        {/* Itens */}
        {(busca || aba !== "__pizzas__") && visiveis.map((i) => {
          const noCarrinho = cart.filter((l) => l.payload.kind !== "pizza" && "itemId" in l.payload && l.payload.itemId === i.id).reduce((s, l) => s + l.qtd, 0);
          return (
            <button key={i.id} onClick={() => clicarItem(i)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left ${noCarrinho > 0 ? "" : "border-zinc-200 dark:border-zinc-800"}`} style={noCarrinho > 0 ? { borderColor: LARANJA, background: "rgba(199,131,64,0.06)" } : {}}>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-tight">{i.nome}{noCarrinho > 0 ? ` (${noCarrinho})` : ""}{comComplSet.has(i.id) ? " ⚙️" : ""}</div>
                {i.descricao && <div className="mt-0.5 line-clamp-2 text-xs leading-tight text-zinc-500">{i.descricao}</div>}
                <div className="mt-0.5 text-sm font-semibold" style={{ color: LARANJA }}>{i.preco_antigo != null && <span className="mr-1.5 text-xs font-normal text-zinc-400 line-through">{brl(i.preco_antigo)}</span>}{i.preco > 0 ? brl(i.preco) : "consulte"}{i.preco_antigo != null && <span className="ml-1.5 rounded bg-rose-500/10 px-1 text-[10px] font-bold text-rose-500">PROMO</span>}</div>
              </div>
              {i.foto_url ? <FotoItem url={i.foto_url} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: LARANJA }}>+</span>}
            </button>
          );
        })}
        {(busca || aba !== "__pizzas__") && visiveis.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">Nada encontrado.</p>}
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

      {pzTamanho && <PizzaModal pizza={pizza} tamanhoInicial={pzTamanho} comObs onClose={() => setPzTamanho(null)} onAdd={(l) => { addLinha(l); setPzTamanho(null); }} />}
      {comboItem && <ComboModal item={comboItem} grupos={gruposDe(comboItem.id)} opcoesDe={opcoesDe} comObs onClose={() => setComboItem(null)} onAdd={(l) => { addLinha(l); setComboItem(null); }} />}
    </Casca>
  );
}

function Casca({ children, onMeusPedidos }: { children: React.ReactNode; onMeusPedidos?: () => void }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="px-4 py-3 text-white" style={{ background: ESCURO }}>
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <span className="text-2xl">🍕</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold" style={{ color: LARANJA }}>Brasa Pizzaria e Restaurante</div>
            <div className="text-xs text-zinc-300">Peça online · entrega ou retirada</div>
          </div>
          {onMeusPedidos && (
            <button onClick={onMeusPedidos} className="shrink-0 rounded-xl border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200">📋 Meus pedidos</button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg">{children}</main>
    </div>
  );
}
