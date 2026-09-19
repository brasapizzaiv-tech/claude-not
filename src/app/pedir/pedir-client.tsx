"use client";

import { Icone, type NomeIcone } from "@/components/icone";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { enviarPedidoPublico, calcularEntregaPublico, meusPedidos, validarCupomPublico, verificarPixPedido, dadosClientePublico } from "./actions";
import {
  PizzaModal, ComboModal, brl, novoUid,
  type Item, type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";

const LARANJA = "var(--marca-primaria)"; // vem do cadastro da empresa
const ESCURO = "var(--marca-escuro)"; // vem do cadastro da empresa
const FORMAS_BASE = [
  { id: "Dinheiro", label: "Dinheiro", icone: "dinheiro" as NomeIcone },
  { id: "Pix", label: "Pix na entrega", icone: "celular" as NomeIcone },
  { id: "Cartão", label: "Cartão na entrega", icone: "cartao" as NomeIcone },
];

// QR do Pix gerado na hora a partir do copia-e-cola.
function QrPix({ codigo }: { codigo: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(codigo, { width: 260, margin: 1 }).then(setSrc).catch(() => {});
  }, [codigo]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR Code Pix" className="mx-auto h-64 w-64 rounded-cartao bg-white p-2" />;
}
const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando confirmação", aceito: "Confirmado", em_preparo: "Preparando",
  pronto: "Pronto", saiu: "Saiu pra entrega", entregue: "Entregue", cancelado: "Cancelado",
};

function FotoItem({ url, size = "h-20 w-24" }: { url?: string | null; size?: string }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${size} shrink-0 rounded-cartao object-cover`} />;
}

export type HorarioPedir = {
  livre: boolean;                 // pode pedir pra agora
  fechaEm: string | null;
  proximaAbertura: string | null; // "hoje às 18:30"
  podeAgendar: boolean;
  slots: { iso: string; label: string; turno: string; lotado: boolean }[];
  pedidoMinimo: number;
};

export function PedirClient({
  itens, categorias, comComplemento, pizza, complementos, aberto, tempoPreparo, aviso, maisVendidos, pixAtivo, horario,
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
  horario: HorarioPedir;
}) {
  const [proc, start] = useTransition();
  const [fase, setFase] = useState<"menu" | "checkout" | "historico">("menu");
  const [aba, setAba] = useState(categorias[0] ?? "");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [lembrado, setLembrado] = useState<string | null>(null); // "Endereço da última vez preenchido"
  const foneBuscado = useRef("");
  const [tipo, setTipo] = useState<"entrega" | "retirada">("entrega");
  const [end, setEnd] = useState({ logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Ivoti", referencia: "", cep: "" });
  const [taxa, setTaxa] = useState<number | null>(null);
  const [calcMsg, setCalcMsg] = useState<string | null>(null);
  const [promoDica, setPromoDica] = useState<string | null>(null); // "Entrega grátis hoje acima de R$ 60"
  const [calculando, setCalculando] = useState(false);
  // Quando: "agora" (dentro do horário livre) ou "agendar" (horário exato).
  const [quando, setQuando] = useState<"agora" | "agendar">(aberto ? "agora" : "agendar");
  const [slot, setSlot] = useState<string>("");
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
  const FORMAS = pixAtivo ? [{ id: "Pix online", label: "Pix agora", icone: "rapido" as NomeIcone }, ...FORMAS_BASE] : FORMAS_BASE;

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
      setCupomMsg(`Cupom ${r.codigo}: ${r.tipo === "percent" ? `${r.valor}% de desconto` : `R$ ${r.valor.toFixed(2).replace(".", ",")} de desconto`}${r.minimo != null ? ` (pedido mínimo R$ ${r.minimo.toFixed(2).replace(".", ",")})` : ""}`);
    } else {
      setCupom(null);
      setCupomMsg(r.mensagem);
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
      if (r.foraDeArea) { setTaxa(null); setCalcMsg("Esse endereço fica fora da nossa área de entrega."); return; }
      setTaxa(r.taxa);
      const onde = r.areaNome ? r.areaNome : r.distanciaKm != null ? `${r.distanciaKm} km` : "";
      setCalcMsg(`Entrega: ${brl(r.taxa)}${onde ? ` (${onde})` : ""}${r.tempoMin ? ` · cerca de ${r.tempoMin} min` : ""}`);
      // Promoção da tele que pode valer hoje nessa área (o desconto real é aplicado ao enviar).
      const dicas = (r.promosHoje ?? []).map((pr) => {
        const oque = pr.tipo === "gratis" ? "Entrega grátis" : pr.tipo === "percent" ? `${pr.valor}% de desconto na entrega` : `${brl(Number(pr.valor))} de desconto na entrega`;
        return `${oque} hoje${pr.pedido_minimo != null ? ` em pedidos acima de ${brl(Number(pr.pedido_minimo))}` : ""}`;
      });
      setPromoDica(dicas.length ? dicas.join(" · ") : null);
    } else {
      setTaxa(null);
      setCalcMsg(r.mensagem ?? "Não consegui calcular. Confira o endereço.");
    }
  }

  // Telefone completo → busca nome e último endereço e preenche o que estiver vazio.
  useEffect(() => {
    const fone = telefone.replace(/\D/g, "");
    if (fone.length < 10 || foneBuscado.current === fone) return;
    foneBuscado.current = fone;
    let vivo = true;
    (async () => {
      try {
        const d = await dadosClientePublico(fone);
        if (!vivo || !d) return;
        setNome((n) => n.trim() ? n : d.nome);
        if (d.endereco) {
          setEnd((e) => e.logradouro.trim() ? e : d.endereco!);
          setLembrado("Preenchi com o endereço do seu último pedido — confira antes de calcular a entrega.");
        }
      } catch { /* sem rede */ }
    })();
    return () => { vivo = false; };
  }, [telefone]);

  function enviar() {
    setErro(null);
    if (cart.length === 0) { setErro("Seu carrinho está vazio."); return; }
    if (!nome.trim()) { setErro("Informe seu nome."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { setErro("Informe seu telefone com DDD."); return; }
    if (tipo === "entrega" && !end.logradouro.trim()) { setErro("Informe o endereço de entrega."); return; }
    if (tipo === "entrega" && taxa == null) { setErro("Toque em \"Calcular entrega\" pra confirmar a taxa."); return; }
    if (horario.pedidoMinimo > 0 && subtotal < horario.pedidoMinimo) { setErro(`Pedido mínimo é ${brl(horario.pedidoMinimo)} (sem contar a entrega).`); return; }
    if (quando === "agendar" && !slot) { setErro("Escolha o horário do agendamento."); return; }
    if (quando === "agora" && !aberto) { setErro("Estamos fechados agora — agende um horário."); return; }
    const trocoN = forma === "Dinheiro" ? Number(trocoPara.replace(",", ".")) || 0 : 0;
    start(async () => {
      const r = await enviarPedidoPublico({
        nome, telefone, tipo,
        endereco: tipo === "entrega" ? end : undefined,
        formaPagamento: forma, trocoPara: trocoN || null,
        observacao: obs,
        cupom: cupom?.codigo ?? null,
        itens: cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
        agendadoPara: quando === "agendar" ? slot : null,
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
          <div className="mb-3 flex justify-center"><Icone nome="festa" tamanho={58} className="text-orange-500" /></div>
          <h1 className="text-2xl font-bold">Pedido enviado!</h1>
          <p className="mt-2 text-texto-suave">
            {feito.numero ? <>Seu pedido é o <b>nº {feito.numero}</b>. </> : null}
            O restaurante vai confirmar em instantes — tempo estimado de preparo: ~{tempoPreparo} min.
          </p>
          {feito.pix && !pixPago && (
            <div className="mx-auto mt-6 max-w-sm rounded-cartao border-2 p-4" style={{ borderColor: LARANJA }}>
              <p className="mb-3 flex items-center justify-center gap-1.5 font-bold"><Icone nome="rapido" tamanho={14} /> Pague agora com Pix</p>
              <QrPix codigo={feito.pix.copiaECola} />
              <button
                onClick={() => {
                  try { navigator.clipboard.writeText(feito.pix!.copiaECola); setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500); } catch { /* sem clipboard */ }
                }}
                className="mt-3 w-full rounded-cartao border-2 py-2.5 font-bold"
                style={{ borderColor: LARANJA, color: LARANJA }}
              >
                {pixCopiado ? <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="ok" tamanho={14} /> Código copiado!</span> : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="copiar" tamanho={14} /> Copiar código Pix</span>}
              </button>
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-texto-suave">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Aguardando o pagamento... confirma sozinho aqui.
              </p>
            </div>
          )}
          {feito.pix && pixPago && (
            <div className="mx-auto mt-6 max-w-sm rounded-cartao bg-emerald-500/10 p-4 text-lg font-bold text-emerald-600">
              <span className="inline-flex items-center gap-1.5"><Icone nome="certo" tamanho={14} /> Pagamento confirmado! Seu pedido já está como PAGO.</span>
            </div>
          )}
          <a href={`/pedir/acompanhar/${feito.id}`} className="mt-6 inline-block rounded-cartao px-6 py-3.5 font-bold text-white" style={{ background: LARANJA }}>
            Acompanhar meu pedido →
          </a>
          <p className="mt-4 text-xs text-texto-fraco">Guarde esse link pra ver o andamento.</p>
        </div>
      </Casca>
    );
  }

  if (fase === "historico") {
    return (
      <Casca onMeusPedidos={() => setFase("menu")}>
        <div className="p-4">
          <button onClick={() => setFase("menu")} className="mb-3 text-sm font-semibold" style={{ color: LARANJA }}>← Voltar pro cardápio</button>
          <h1 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icone nome="lista" tamanho={19} /> Meus pedidos</h1>
          <div className="mb-4 flex gap-2">
            <input value={histTel} onChange={(e) => setHistTel(e.target.value)} inputMode="tel" placeholder="Seu telefone com DDD" className="flex-1 rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
            <button onClick={buscarHistorico} disabled={histBuscando} className="rounded-cartao px-4 font-bold text-white disabled:opacity-50" style={{ background: LARANJA }}>{histBuscando ? "..." : "Buscar"}</button>
          </div>
          {histLista !== null && (
            histLista.length === 0 ? <p className="py-8 text-center text-sm text-texto-fraco">Nenhum pedido encontrado pra esse telefone.</p> : (
              <div className="space-y-2">
                {histLista.map((h) => (
                  <a key={h.id} href={`/pedir/acompanhar/${h.id}`} className="block rounded-cartao border border-borda p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Pedido nº {h.numero ?? "—"}</span>
                      <span className="text-sm font-semibold" style={{ color: LARANJA }}>{brl(h.total)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-texto-suave">
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
              <div key={l.uid} className="rounded-cartao border border-borda p-2.5 dark:border-borda-forte">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-line text-sm font-medium leading-tight">{l.descricao}</div>
                    <div className="text-xs" style={{ color: LARANJA }}>{brl(l.preco * l.qtd)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQtd(l.uid, l.qtd - 1)} className="h-7 w-7 rounded-controle border border-borda-forte">{l.qtd === 1 ? <Icone nome="lixeira" tamanho={14} titulo="Tirar do pedido" /> : "−"}</button>
                    <span className="w-5 text-center font-bold">{l.qtd}</span>
                    <button onClick={() => setQtd(l.uid, l.qtd + 1)} className="h-7 w-7 rounded-controle border border-borda-forte font-bold" style={{ color: LARANJA }}>+</button>
                  </div>
                </div>
                <input
                  value={l.payload.obs ?? ""}
                  onChange={(e) => setObsLinha(l.uid, e.target.value)}
                  maxLength={200}
                  placeholder="Observação deste item (ex.: sem cebola)"
                  className="mt-2 w-full rounded-controle border border-borda bg-transparent px-2.5 py-1.5 text-xs outline-none"
                />
              </div>
            ))}
            {cart.length === 0 && <p className="py-6 text-center text-sm text-texto-fraco">Carrinho vazio — volte pro cardápio.</p>}
          </div>

          <h2 className="mb-2 font-bold">Seus dados</h2>
          <div className="mb-4 space-y-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="Telefone com DDD (51 99999-9999)" className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
          </div>

          <h2 className="mb-2 font-bold">Pra quando?</h2>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <button onClick={() => setQuando("agora")} disabled={!aberto} className={`rounded-cartao border py-2.5 font-semibold disabled:opacity-40 ${quando === "agora" ? "text-white" : "border-borda-forte text-texto-suave "}`} style={quando === "agora" ? { background: LARANJA, borderColor: LARANJA } : {}}><Icone nome="rapido" tamanho={14} className="mr-1" /> Agora{aberto && horario.fechaEm ? <span className="block text-[11px] font-normal opacity-80">até {horario.fechaEm}</span> : !aberto ? <span className="block text-[11px] font-normal opacity-80">fechado</span> : null}</button>
            <button onClick={() => setQuando("agendar")} disabled={!horario.podeAgendar} className={`rounded-cartao border py-2.5 font-semibold disabled:opacity-40 ${quando === "agendar" ? "text-white" : "border-borda-forte text-texto-suave "}`} style={quando === "agendar" ? { background: LARANJA, borderColor: LARANJA } : {}}><Icone nome="agenda" tamanho={14} className="mr-1" /> Agendar{!horario.podeAgendar ? <span className="block text-[11px] font-normal opacity-80">indisponível</span> : null}</button>
          </div>
          {quando === "agendar" && horario.podeAgendar && (
            <div className="mb-4">
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none dark:bg-zinc-950">
                <option value="">Escolha o horário…</option>
                {horario.slots.map((s) => (
                  <option key={s.iso} value={s.iso} disabled={s.lotado}>{s.turno} · {s.label}{s.lotado ? " — lotado" : ""}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-texto-suave">Horário em que o pedido {tipo === "entrega" ? "sai pra entrega" : "fica pronto pra retirar"}.</p>
            </div>
          )}
          {!aberto && !horario.podeAgendar && (
            <p className="mb-4 rounded-cartao bg-rose-500/10 px-3 py-2 text-sm text-rose-600">Estamos fechados{horario.proximaAbertura ? ` — abrimos ${horario.proximaAbertura}` : ""}.</p>
          )}

          <h2 className="mb-2 font-bold">Como você quer receber?</h2>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button onClick={() => setTipo("entrega")} className={`rounded-cartao border py-2.5 font-semibold ${tipo === "entrega" ? "text-white" : "border-borda-forte text-texto-suave "}`} style={tipo === "entrega" ? { background: LARANJA, borderColor: LARANJA } : {}}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="entrega" tamanho={15} /> Entrega</span></button>
            <button onClick={() => setTipo("retirada")} className={`rounded-cartao border py-2.5 font-semibold ${tipo === "retirada" ? "text-white" : "border-borda-forte text-texto-suave "}`} style={tipo === "retirada" ? { background: LARANJA, borderColor: LARANJA } : {}}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="loja" tamanho={15} /> Retirar no balcão</span></button>
          </div>

          {tipo === "entrega" && (
            <div className="mb-4 space-y-2">
              {lembrado && <p className="text-xs text-emerald-600">{lembrado}</p>}
              <div className="grid grid-cols-3 gap-2">
                <input value={end.logradouro} onChange={(e) => { setEnd({ ...end, logradouro: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Rua" className="col-span-2 rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
                <input value={end.numero} onChange={(e) => { setEnd({ ...end, numero: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Nº" className="rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={end.bairro} onChange={(e) => { setEnd({ ...end, bairro: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Bairro" className="rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
                <input value={end.cidade} onChange={(e) => { setEnd({ ...end, cidade: e.target.value }); setTaxa(null); setCalcMsg(null); }} placeholder="Cidade" className="rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
              </div>
              <input value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} placeholder="Complemento (apto, casa...)" className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
              <input value={end.referencia} onChange={(e) => setEnd({ ...end, referencia: e.target.value })} placeholder="Ponto de referência (opcional)" className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
              <button onClick={calcularTaxa} disabled={calculando} className="w-full rounded-cartao border-2 py-2.5 font-bold disabled:opacity-50" style={{ borderColor: LARANJA, color: LARANJA }}>
                {calculando ? "Calculando..." : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="local" tamanho={14} /> Calcular entrega</span>}
              </button>
              {calcMsg && <p className="text-sm text-texto-suave">{calcMsg}</p>}
              {promoDica && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <Icone nome="etiqueta" tamanho={14} /> {promoDica}
              </p>
            )}
            </div>
          )}

          <h2 className="mb-2 font-bold">Pagamento (na {tipo === "entrega" ? "entrega" : "retirada"})</h2>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {FORMAS.map((f) => (
              <button key={f.id} onClick={() => setForma(f.id)} className={`rounded-cartao border px-1 py-2.5 text-xs font-semibold ${forma === f.id ? "text-white" : "border-borda-forte text-texto-suave "}`} style={forma === f.id ? { background: LARANJA, borderColor: LARANJA } : {}}>
                <span className="inline-flex items-center justify-center gap-1"><Icone nome={f.icone} tamanho={13} /> {f.label}</span>
              </button>
            ))}
          </div>
          {forma === "Dinheiro" && (
            <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="mb-3 w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
          )}
          <div className="mb-3 flex gap-2">
            <input value={cupomCodigo} onChange={(e) => { setCupomCodigo(e.target.value.toUpperCase()); }} placeholder="Cupom de desconto" className="flex-1 rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 uppercase outline-none" />
            <button onClick={aplicarCupom} disabled={cupomProc || !cupomCodigo.trim()} className="rounded-cartao border-2 px-4 font-bold disabled:opacity-50" style={{ borderColor: LARANJA, color: LARANJA }}>{cupomProc ? "..." : "Aplicar"}</button>
          </div>
          {cupomMsg && <p className="mb-3 text-sm text-texto-suave">{cupomMsg}</p>}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Alguma observação geral? (opcional)" rows={2} className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-borda bg-painel-cartao p-4">
          <div className="mx-auto max-w-lg">
            <div className="mb-1 flex justify-between text-sm text-texto-suave"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {tipo === "entrega" && <div className="mb-1 flex justify-between text-sm text-texto-suave"><span>Entrega</span><span>{taxa == null ? "—" : brl(taxaN)}</span></div>}
            {descontoCupom > 0 && <div className="mb-1 flex justify-between text-sm font-semibold text-emerald-600"><span>Cupom {cupom?.codigo}</span><span>− {brl(descontoCupom)}</span></div>}
            <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
            {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
            {horario.pedidoMinimo > 0 && subtotal < horario.pedidoMinimo && cart.length > 0 && (
              <p className="mb-2 text-xs text-amber-600">Pedido mínimo {brl(horario.pedidoMinimo)} — faltam {brl(horario.pedidoMinimo - subtotal)}.</p>
            )}
            <button onClick={enviar} disabled={proc || (!aberto && !horario.podeAgendar)} className="w-full rounded-cartao py-3.5 text-base font-bold text-white disabled:opacity-50" style={{ background: LARANJA }}>
              {proc ? "Enviando..." : !aberto && !horario.podeAgendar ? "Delivery fechado agora" : quando === "agendar" ? <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="agenda" tamanho={17} /> Agendar pedido</span> : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="certo" tamanho={17} /> Enviar pedido</span>}
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
        <div className={`px-4 py-2 text-center text-sm font-bold text-white ${horario.podeAgendar ? "bg-sky-700" : "bg-rose-600"}`}>
          {horario.podeAgendar
            ? `Fechado agora${horario.proximaAbertura ? ` — abrimos ${horario.proximaAbertura}` : ""}. Mas você já pode AGENDAR seu pedido!`
            : `Estamos fechados${horario.proximaAbertura ? ` — abrimos ${horario.proximaAbertura}` : " agora"}. Pode olhar o cardápio à vontade.`}
        </div>
      )}
      {aviso && (
        <div className="px-4 py-2 text-center text-sm font-semibold text-white" style={{ background: LARANJA }}>
            <span className="inline-flex items-center gap-1.5"><Icone nome="megafone" tamanho={14} /> {aviso}</span>
          </div>
      )}
      <div className="sticky top-0 z-10 border-b border-borda bg-white/95 p-3 backdrop-blur dark:bg-zinc-950/95">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cardápio..." className="w-full rounded-cartao border border-borda-forte bg-transparent px-3 py-2.5 outline-none" />
        {!busca && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {pizza.tamanhos.length > 0 && (
              <button onClick={() => setAba("__pizzas__")} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${aba === "__pizzas__" ? "text-white" : ""}`} style={aba === "__pizzas__" ? { background: LARANJA } : { color: LARANJA, background: "color-mix(in srgb, var(--marca-primaria) 12%, transparent)" }}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="pizza" tamanho={14} /> Pizzas</span></button>
            )}
            {categorias.map((c) => (
              <button key={c} onClick={() => setAba(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${aba === c ? "text-white" : "bg-superficie-suave text-texto-suave  "}`} style={aba === c ? { background: ESCURO } : {}}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Os mais vendidos */}
      {!busca && destaque.length > 0 && aba !== "__pizzas__" && (
        <div className="pt-3">
          <h2 className="flex items-center gap-1.5 px-3 font-bold"><Icone nome="fogo" tamanho={16} className="text-orange-500" /> Os mais vendidos</h2>
          <div className="flex gap-2 overflow-x-auto p-3">
            {destaque.map((i) => (
              <button key={i.id} onClick={() => clicarItem(i)} className="w-40 shrink-0 overflow-hidden rounded-cartao border border-borda text-left">
                {i.foto_url ? <FotoItem url={i.foto_url} size="h-24 w-full" /> : <div className="flex h-24 w-full items-center justify-center" style={{ background: "color-mix(in srgb, var(--marca-primaria) 10%, transparent)" }}><Icone nome="salao" tamanho={28} className="text-orange-500/70" /></div>}
                <div className="p-2">
                  <div className="truncate text-sm font-medium">{i.nome}</div>
                  <div className="text-sm font-semibold" style={{ color: LARANJA }}>{i.preco_antigo != null && <span className="mr-1 text-xs font-normal text-texto-fraco line-through">{brl(i.preco_antigo)}</span>}{i.preco > 0 ? brl(i.preco) : "consulte"}</div>
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
            <button key={t.id} onClick={() => setPzTamanho(t.id)} className="flex w-full items-center justify-between rounded-cartao border border-borda p-3 text-left">
              <div>
                <div className="font-bold">{t.nome}</div>
                <div className="text-xs text-texto-suave">{t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}{t.fatias ? `, ${t.fatias} fatia${t.fatias > 1 ? "s" : ""}` : ""}</div>
                {min != null && <div className="mt-0.5 text-sm font-semibold text-emerald-600">A partir de {brl(min)}</div>}
              </div>
              <Icone nome="pizza" tamanho={30} className="text-orange-500" />
            </button>
          );
        })}

        {/* Itens */}
        {(busca || aba !== "__pizzas__") && visiveis.map((i) => {
          const noCarrinho = cart.filter((l) => l.payload.kind !== "pizza" && "itemId" in l.payload && l.payload.itemId === i.id).reduce((s, l) => s + l.qtd, 0);
          return (
            <button key={i.id} onClick={() => clicarItem(i)} className={`flex w-full items-center justify-between gap-3 rounded-cartao border p-3 text-left ${noCarrinho > 0 ? "" : "border-borda"}`} style={noCarrinho > 0 ? { borderColor: LARANJA, background: "color-mix(in srgb, var(--marca-primaria) 6%, transparent)" } : {}}>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-tight">{i.nome}{noCarrinho > 0 ? ` (${noCarrinho})` : ""}{comComplSet.has(i.id) && <Icone nome="ajustes" tamanho={12} className="ml-1 text-texto-fraco" />}</div>
                {i.descricao && <div className="mt-0.5 line-clamp-2 text-xs leading-tight text-texto-suave">{i.descricao}</div>}
                <div className="mt-0.5 text-sm font-semibold" style={{ color: LARANJA }}>{i.preco_antigo != null && <span className="mr-1.5 text-xs font-normal text-texto-fraco line-through">{brl(i.preco_antigo)}</span>}{i.preco > 0 ? brl(i.preco) : "consulte"}{i.preco_antigo != null && <span className="ml-1.5 rounded bg-rose-500/10 px-1 text-[10px] font-bold text-rose-500">PROMO</span>}</div>
              </div>
              {i.foto_url ? <FotoItem url={i.foto_url} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: LARANJA }}>+</span>}
            </button>
          );
        })}
        {(busca || aba !== "__pizzas__") && visiveis.length === 0 && <p className="py-10 text-center text-sm text-texto-fraco">Nada encontrado.</p>}
      </div>

      {qtdItens > 0 && (
        <div className="fixed inset-x-0 bottom-0 p-4">
          <div className="mx-auto max-w-lg">
            <button onClick={() => setFase("checkout")} className="flex w-full items-center justify-between rounded-cartao px-5 py-3.5 text-white" style={{ background: ESCURO }}>
              <span className="inline-flex items-center gap-1.5 font-bold"><Icone nome="compras" tamanho={16} /> Ver pedido ({qtdItens})</span>
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
    <div className="min-h-screen bg-painel-cartao text-texto">
      <header className="px-4 py-3 text-white" style={{ background: ESCURO }}>
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Icone nome="pizza" tamanho={22} className="text-orange-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold" style={{ color: LARANJA }}>Brasa Pizzaria e Restaurante</div>
            <div className="text-xs text-zinc-300">Peça online · entrega ou retirada</div>
          </div>
          {onMeusPedidos && (
            <button onClick={onMeusPedidos} className="shrink-0 rounded-cartao border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200"><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="lista" tamanho={13} /> Meus pedidos</span></button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg">{children}</main>
    </div>
  );
}
