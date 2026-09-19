"use client";

import { Icone, type NomeIcone } from "@/components/icone";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { finalizarVendaPdv } from "./actions";
import { PixQr } from "@/components/pix-qr";
import { EmitirNotaCaixa } from "../salao/caixa/emitir-nota-caixa";
import { NfceAutoToggle, formaEmiteAuto } from "@/components/nfce-auto-toggle";

export type ItemMenu = { id: string; nome: string; categoria: string; preco: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CORES = ["#6366f1", "#10b981", "#ec4899", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f43f5e", "#84cc16", "#8b5cf6"];
const FORMAS = [
  { id: "Dinheiro", label: "Dinheiro", icone: "dinheiro" as NomeIcone },
  { id: "Cartão", label: "Cartão", icone: "cartao" as NomeIcone },
  { id: "Pix", label: "Pix", icone: "celular" as NomeIcone },
];

type Feito = { numero: number; comandaId?: string; pago: boolean; forma?: string; troco?: number; semCaixa?: boolean; viagem?: boolean };

export function PdvClient({ itens, categorias, pixAtivo = false, nfce = { ligado: false, producao: false } }: { itens: ItemMenu[]; categorias: string[]; pixAtivo?: boolean; nfce?: { ligado: boolean; producao: boolean } }) {
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
  // Trava contra finalizar duas vezes (toque duplo, ou o QR Pix caindo no mesmo instante do clique).
  const finalizandoRef = useRef(false);

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
    if (cartLista.length === 0 || finalizandoRef.current) return;
    finalizandoRef.current = true;
    const trocoAtual = troco;
    const ehViagem = local === "viagem";
    start(async () => {
      try {
        const r = await finalizarVendaPdv(itensParaEnviar(), obs, pagamento, local);
        if (r.ok) {
          setFeito({ numero: r.numero ?? 0, comandaId: r.comandaId, pago: !!pagamento, forma: pagamento?.forma, troco: pagamento?.forma === "Dinheiro" ? trocoAtual : 0, semCaixa: "semCaixa" in r ? r.semCaixa : false, viagem: ehViagem });
          setCart({}); setObs(""); setFase("menu"); setRecebido(""); setForma("Dinheiro"); setLocal("aqui");
        } else {
          setErro(("mensagem" in r && r.mensagem) || "Não foi possível concluir."); setTimeout(() => setErro(null), 3500);
        }
      } catch {
        setErro("Sem conexão. Tente de novo."); setTimeout(() => setErro(null), 3500);
      } finally {
        finalizandoRef.current = false;
      }
    });
  }

  if (feito) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="mb-3 flex justify-center">
              <Icone
                nome={feito.pago ? "certo" : "panela"}
                tamanho={52}
                className={feito.pago ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
              />
            </div>
        <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Venda nº {feito.numero} {feito.pago ? "paga!" : "enviada!"}</h1>
        {feito.viagem && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-600"><Icone nome="viagem" tamanho={14} /> Viagem</div>}
        <p className="mt-1 text-texto-suave">
          {feito.pago ? <>Pagou em <b>{feito.forma}</b> e o pedido foi pra cozinha.</> : "O pedido foi pra cozinha. Receba o pagamento no caixa."}
        </p>
        {feito.pago && (feito.troco ?? 0) > 0 && (
          <div className="mt-4 rounded-cartao bg-amber-500/10 px-4 py-3 text-xl font-bold text-amber-600">Troco: {brl(feito.troco!)}</div>
        )}
        {feito.pago && feito.semCaixa && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-600"><Icone nome="alerta" tamanho={15} className="mt-0.5" /> Nenhum caixa aberto — a venda foi registrada, mas não entrou no caixa. Abra o caixa pra controlar o dinheiro.</p>
        )}
        {feito.pago && feito.comandaId && (
          <div className="mt-4 text-left">
            <EmitirNotaCaixa comandas={[{ id: feito.comandaId, numero: feito.numero }]} autoIds={nfce.ligado && nfce.producao && formaEmiteAuto(feito.forma ?? "") ? [feito.comandaId] : []} />
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => setFeito(null)} className="rounded-cartao bg-texto px-5 py-3 font-semibold text-fundo">Nova venda</button>
          {!feito.pago && <Link href="/salao/caixa" className="rounded-cartao border border-borda-forte px-5 py-3 font-semibold">Ir pro caixa →</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] gap-3 p-3">
      {/* Cardápio */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="flex items-center gap-2 border-b border-borda p-3">
          <h1 className="flex items-center gap-2 text-lg font-bold"><Icone nome="cupom" tamanho={18} /> PDV — Balcão</h1>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..." className="ml-auto w-64 rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-borda p-2">
          {abas.map((c) => (
            <button key={c} onClick={() => setAba(c)} style={{ borderColor: corDe(c) }} className={`rounded-controle border-l-4 px-3 py-1.5 text-sm font-medium ${aba === c ? "bg-superficie-suave" : "text-texto-suave"}`}>{c}</button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((i) => {
            const q = cart[i.id] || 0;
            return (
              <button key={i.id} onClick={() => add(i.id)} className={`flex min-h-[76px] flex-col justify-between rounded-cartao border p-2.5 text-left ${q > 0 ? "border-emerald-500 bg-emerald-500/5" : "border-borda hover:bg-superficie-suave  "}`}>
                <span className="text-sm font-medium leading-tight">{i.nome}{q > 0 ? ` (${q})` : ""}</span>
                <span className="text-sm text-emerald-600">{i.preco > 0 ? brl(i.preco) : "—"}</span>
              </button>
            );
          })}
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-texto-suave">Nenhum produto.</p>}
        </div>
      </div>

      {/* Carrinho / Pagamento */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="border-b border-borda p-3 font-bold">
          {fase === "pagar" ? <button onClick={() => setFase("menu")} className="text-emerald-600">← Voltar</button> : <span className="inline-flex items-center gap-1.5"><Icone nome="compras" tamanho={14} /> Pedido {cartCount > 0 ? `(${cartCount})` : ""}</span>}
        </div>

        {fase === "menu" ? (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              {cartLista.length === 0 ? (
                <p className="py-10 text-center text-sm text-texto-suave">Toque nos produtos pra adicionar.</p>
              ) : (
                <div className="space-y-1.5">
                  {cartLista.map((x) => (
                    <div key={x.item.id} className="flex items-center justify-between gap-2 rounded-controle border border-borda p-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{x.item.nome}</div>
                        <div className="text-xs text-emerald-600">{brl(x.item.preco * x.qtd)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQtd(x.item.id, x.qtd - 1)} className="h-7 w-7 rounded border border-borda-forte">{x.qtd === 1 ? <Icone nome="lixeira" tamanho={14} titulo="Tirar do pedido" /> : "−"}</button>
                        <span className="w-5 text-center font-bold">{x.qtd}</span>
                        <button onClick={() => setQtd(x.item.id, x.qtd + 1)} className="h-7 w-7 rounded border border-borda-forte text-emerald-600">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-borda p-3">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button onClick={() => setLocal("aqui")} className={`rounded-controle border py-2 text-sm font-semibold ${local === "aqui" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-borda text-texto-suave "}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="salao" tamanho={14} /> Comer aqui</span></button>
                <button onClick={() => setLocal("viagem")} className={`rounded-controle border py-2 text-sm font-semibold ${local === "viagem" ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-borda text-texto-suave "}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="viagem" tamanho={14} /> Viagem</span></button>
              </div>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Nome do cliente / obs (opcional)" className="mb-2 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm outline-none" />
              <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
              {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
              <button onClick={() => setFase("pagar")} disabled={cartLista.length === 0} className="mb-2 w-full rounded-cartao bg-texto py-3 text-base font-bold text-fundo disabled:opacity-50"><span className="inline-flex items-center justify-center gap-2"><Icone nome="dinheiro" tamanho={18} /> Cobrar e finalizar</span></button>
              <button onClick={() => finalizar(null)} disabled={proc || cartLista.length === 0} className="w-full rounded-cartao border border-borda-forte py-2.5 text-sm font-semibold disabled:opacity-50">{proc ? "Enviando..." : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="panela" tamanho={14} /> Só enviar pra cozinha (pago no caixa)</span>}</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col p-3">
            <div className="mb-3 rounded-cartao bg-superficie-suave p-3 text-center">
              <div className="text-sm text-texto-suave">Total a cobrar {local === "viagem" && <span className="inline-flex items-center gap-1 font-bold text-amber-600">· <Icone nome="viagem" tamanho={13} /> Viagem</span>}</div>
              <div className="text-3xl font-bold">{brl(total)}</div>
            </div>
            <div className="mb-2 flex justify-end"><NfceAutoToggle ligado={nfce.ligado} producao={nfce.producao} compacto /></div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {FORMAS.map((f) => (
                <button key={f.id} onClick={() => setForma(f.id)} className={`rounded-cartao border py-3 text-sm font-semibold ${forma === f.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-borda"}`}>
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Icone nome={f.icone} tamanho={16} /> {f.label}
                  </span>
                </button>
              ))}
            </div>
            {forma === "Dinheiro" && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Valor recebido</label>
                <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" placeholder="Ex.: 50" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-lg outline-none" />
                <div className="mt-2 flex justify-between text-lg font-bold"><span>Troco</span><span className={troco > 0 ? "text-amber-600" : ""}>{brl(troco)}</span></div>
              </div>
            )}
            {forma === "Pix" && pixAtivo && total > 0 && (
              <div className="mb-3"><PixQr valor={total} descricao="Brasa balcão" origem="pdv" onPago={() => finalizar({ forma: "Pix" })} compacto /></div>
            )}
            <div className="flex-1" />
            {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
            {forma === "Pix" && pixAtivo && total > 0 ? (
              // Com QR na tela, a venda fecha sozinha quando o Pix cai (ou por "Vi que caiu").
              // Este botão é só pra quem recebeu pela chave, sem QR.
              <button onClick={() => finalizar({ forma })} disabled={proc} className="w-full rounded-cartao border border-borda-forte py-2.5 text-sm font-semibold text-texto-suave disabled:opacity-50 dark:border-borda-forte">{proc ? "Concluindo..." : "Recebi o Pix pela chave (sem QR) — concluir"}</button>
            ) : (
              <button onClick={() => finalizar({ forma })} disabled={proc} className="w-full rounded-cartao bg-texto py-3.5 text-base font-bold text-fundo disabled:opacity-50">{proc ? "Concluindo..." : <span className="inline-flex items-center justify-center gap-2"><Icone nome="certo" tamanho={18} /> Confirmar e enviar pra cozinha</span>}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
