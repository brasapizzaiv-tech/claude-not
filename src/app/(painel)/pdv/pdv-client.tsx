"use client";

import { Icone } from "@/components/icone";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { buscarClientesPdv, cashbackClientePdv, finalizarVendaPdv } from "./actions";
import { PixQr } from "@/components/pix-qr";
import { EmitirNotaCaixa } from "../salao/caixa/emitir-nota-caixa";
import { NfceAutoToggle } from "@/components/nfce-auto-toggle";
import { FORMAS_PADRAO, emiteNotaAuto, iconeDoTipo, naoEntraNoCaixa, tefDoTipo, tipoDe, type FormaOpcao } from "@/lib/formas-pagamento";
import { CobrarPinpad, useAgenteTef } from "@/components/cobrar-pinpad";
import type { TefDados } from "@/lib/tef-client";
import { CampoVale } from "@/components/campo-vale";
import type { ValeConsulta } from "../salao/caixa/vales/actions";

export type ItemMenu = { id: string; nome: string; categoria: string; preco: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Feito = { numero: number; comandaId?: string; pago: boolean; forma?: string; troco?: number; semCaixa?: boolean; viagem?: boolean; cliente?: string; cashbackUsado?: number; cashbackGanho?: number };

export function PdvClient({ itens, categorias, pixAtivo = false, nfce = { ligado: false, producao: false }, formas = FORMAS_PADRAO.pdv, colaboradores = [] }: { itens: ItemMenu[]; categorias: string[]; pixAtivo?: boolean; nfce?: { ligado: boolean; producao: boolean }; formas?: FormaOpcao[]; colaboradores?: { id: string; nome: string }[] }) {
  const FORMAS = formas.map((f) => ({ id: f.nome, label: f.nome, icone: iconeDoTipo(f.tipo) }));
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [obs, setObs] = useState("");
  const [fase, setFase] = useState<"menu" | "pagar">("menu");
  const [local, setLocal] = useState<"aqui" | "viagem">("aqui");
  const [forma, setForma] = useState(formas[0]?.nome ?? "Dinheiro");
  const [recebido, setRecebido] = useState("");
  // Compra da equipe pede o funcionário; Saldo cliente pede o cliente.
  const [colabId, setColabId] = useState("");
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [buscaCli, setBuscaCli] = useState("");
  const [cliResultados, setCliResultados] = useState<{ id: string; nome: string; cpf_cnpj: string | null; telefone?: string | null }[]>([]);
  // Cashback do cliente vinculado (opcional no balcão).
  const [cb, setCb] = useState<{ saldo: number; percentual: number; maxResgate: number | null } | null>(null);
  const [usarCb, setUsarCb] = useState(true);
  const escolherCliente = (c: { id: string; nome: string } | null) => {
    setCliente(c); setCliResultados([]); setCb(null); setUsarCb(true);
    if (c) cashbackClientePdv(c.id).then(setCb).catch(() => setCb(null));
  };
  const tipoForma = tipoDe(forma, formas);
  // Cortesia / vale-presente: pedem o motivo (vai pro relatório de cortesias e vales).
  const [motivo, setMotivo] = useState("");
  const semDinheiro = naoEntraNoCaixa(tipoForma);
  // Vale-presente com código (migration 0235): o código substitui o motivo.
  const [vale, setVale] = useState<ValeConsulta | null>(null);
  const [valeSemCodigo, setValeSemCodigo] = useState(false);
  const valeComCodigo = tipoForma === "vale_presente" && !valeSemCodigo;
  const [feito, setFeito] = useState<Feito | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Trava contra finalizar duas vezes (toque duplo, ou o QR Pix caindo no mesmo instante do clique).
  const finalizandoRef = useRef(false);
  // Pinpad neste PC (Pix na maquininha / cartão pelo TEF).
  const agenteTef = useAgenteTef();

  const abas = ["Todos", ...categorias];
  
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (aba === "Todos" || i.categoria === aba) && (!q || i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  const itemDe = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const cartLista = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ item: itemDe.get(id)!, qtd: q })).filter((x) => x.item);
  const total = Math.round(cartLista.reduce((s, x) => s + x.item.preco * x.qtd, 0) * 100) / 100;
  const cartCount = cartLista.reduce((s, x) => s + x.qtd, 0);
  // Cashback usado sai do valor a cobrar (o servidor confere e tem a palavra final).
  const cbUsado = cliente && cb && usarCb && cb.saldo > 0 && tipoDe(forma, formas) !== "equipe"
    ? Math.round(Math.max(0, Math.min(cb.saldo, cb.maxResgate ?? Infinity, total)) * 100) / 100
    : 0;
  const cobrar = Math.round((total - cbUsado) * 100) / 100;
  const faltaQuem = (tipoForma === "equipe" && !colabId) || (tipoForma === "saldo" && !cliente) || (semDinheiro && !valeComCodigo && !motivo.trim()) || (valeComCodigo && (!vale || vale.saldo < cobrar - 0.005));
  const recebidoNum = Number(recebido.replace(",", ".")) || 0;
  const troco = tipoDe(forma, formas) === "dinheiro" && recebidoNum > cobrar ? Math.round((recebidoNum - cobrar) * 100) / 100 : 0;

  const setQtd = (id: string, q: number) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));

  const itensParaEnviar = () => cartLista.map((x) => ({ itemId: x.item.id, nome: x.item.nome, preco: x.item.preco, qtd: x.qtd }));

  type Pagto = { forma: string; colaboradorId?: string | null; clienteId?: string | null; usarCashback?: boolean };
  // Venda gravada: mostra a tela de concluído e limpa o pedido.
  function concluir(r: Awaited<ReturnType<typeof finalizarVendaPdv>>, pagamento: Pagto | null, trocoAtual: number, ehViagem: boolean, nomeCliente?: string) {
    if (!r.ok) return;
          setFeito({
            numero: r.numero ?? 0, comandaId: r.comandaId, pago: !!pagamento, forma: pagamento?.forma,
            troco: tipoDe(pagamento?.forma, formas) === "dinheiro" ? trocoAtual : 0, semCaixa: "semCaixa" in r ? r.semCaixa : false, viagem: ehViagem,
            cliente: pagamento?.clienteId ? nomeCliente : undefined,
            cashbackUsado: "cashbackUsado" in r ? r.cashbackUsado : 0,
            cashbackGanho: "cashbackGanho" in r ? r.cashbackGanho : 0,
          });
          setCart({}); setObs(""); setFase("menu"); setRecebido(""); setForma(formas[0]?.nome ?? "Dinheiro"); setLocal("aqui"); setColabId(""); escolherCliente(null); setBuscaCli("");
  }

  // Pinpad: a cobrança já foi aprovada; grava a venda levando o TEF. Quem
  // confirma (ou desfaz) no pinpad é o CobrarPinpad, com o que voltar daqui.
  async function finalizarComTef(tef: TefDados) {
    if (cartLista.length === 0 || finalizandoRef.current) return { ok: false, mensagem: "Venda já em andamento." };
    finalizandoRef.current = true;
    const pagamento: Pagto = { forma, colaboradorId: colabId || null, clienteId: cliente?.id ?? null, usarCashback: cbUsado > 0 };
    try {
      const r = await finalizarVendaPdv(itensParaEnviar(), obs, { ...pagamento, tef, valorTef: cobrar }, local);
      if (!r.ok) return { ok: false, mensagem: ("mensagem" in r && r.mensagem) || "Não foi possível concluir." };
      concluir(r, pagamento, 0, local === "viagem", cliente?.nome);
      return { ok: true, transacaoId: "tefTransacaoId" in r ? r.tefTransacaoId : null };
    } finally {
      finalizandoRef.current = false;
    }
  }

  function finalizar(pagamento: Pagto | null) {
    if (cartLista.length === 0 || finalizandoRef.current) return;
    finalizandoRef.current = true;
    const trocoAtual = troco;
    const ehViagem = local === "viagem";
    const nomeCliente = cliente?.nome;
    start(async () => {
      try {
        const r = await finalizarVendaPdv(itensParaEnviar(), obs, pagamento ? { ...pagamento, observacao: motivo.trim() || null, valeCodigo: valeComCodigo && vale ? vale.codigo : null } : null, local);
        if (r.ok) {
          setMotivo("");
          setVale(null);
          setValeSemCodigo(false);
          concluir(r, pagamento, trocoAtual, ehViagem, nomeCliente);
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
        <h1 className="font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Venda nº {feito.numero} {feito.pago ? "paga!" : "enviada!"}</h1>
        {feito.viagem && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-600"><Icone nome="viagem" tamanho={14} /> Viagem</div>}
        <p className="mt-1 text-texto-suave">
          {feito.pago ? <>Pagou em <b>{feito.forma}</b> e o pedido foi pra cozinha.</> : "O pedido foi pra cozinha. Receba o pagamento no caixa."}
        </p>
        {feito.pago && ((feito.cashbackUsado ?? 0) > 0 || (feito.cashbackGanho ?? 0) > 0) && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-cartao bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <Icone nome="presente" tamanho={15} />
            {feito.cliente ?? "Cliente"}
            {(feito.cashbackUsado ?? 0) > 0 ? ` usou ${brl(feito.cashbackUsado!)} de cashback` : ""}
            {(feito.cashbackUsado ?? 0) > 0 && (feito.cashbackGanho ?? 0) > 0 ? " e" : ""}
            {(feito.cashbackGanho ?? 0) > 0 ? ` ganhou ${brl(feito.cashbackGanho!)}` : ""}.
          </p>
        )}
        {feito.pago && (feito.troco ?? 0) > 0 && (
          <div className="mt-4 rounded-cartao bg-amber-500/10 px-4 py-3 text-xl font-bold text-amber-600">Troco: {brl(feito.troco!)}</div>
        )}
        {feito.pago && feito.semCaixa && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-600"><Icone nome="alerta" tamanho={15} className="mt-0.5" /> Nenhum caixa aberto — a venda foi registrada, mas não entrou no caixa. Abra o caixa pra controlar o dinheiro.</p>
        )}
        {feito.pago && feito.comandaId && (
          <div className="mt-4 text-left">
            <EmitirNotaCaixa comandas={[{ id: feito.comandaId, numero: feito.numero }]} autoIds={nfce.ligado && nfce.producao && emiteNotaAuto(tipoDe(feito.forma, formas)) ? [feito.comandaId] : []} />
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
          <h1 className="font-numero text-[22px] font-bold tracking-apertada text-texto">PDV · balcão</h1>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" aria-label="Buscar produto" className="ml-auto h-11 w-64 rounded-controle bg-painel-fundo px-4 text-sm text-texto placeholder:text-texto-fraco" />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-borda p-2">
          {abas.map((c) => (
            <button key={c} onClick={() => setAba(c)} aria-pressed={aba === c} className={`min-h-11 shrink-0 rounded-full px-4 text-[13.5px] ${aba === c ? "bg-marca-escuro font-semibold text-painel-foco-texto dark:bg-painel-foco-fundo" : "bg-painel-fundo text-texto hover:bg-superficie-suave"}`}>{c}</button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((i) => {
            const q = cart[i.id] || 0;
            return (
              <button key={i.id} onClick={() => add(i.id)} className={`flex min-h-[76px] flex-col justify-between rounded-controle p-3 text-left transition ${q > 0 ? "bg-destaque shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : "bg-painel-fundo hover:bg-superficie-suave"}`}>
                <span className="text-sm font-medium leading-tight">{i.nome}{q > 0 ? ` (${q})` : ""}</span>
                <span className="font-numero text-sm font-bold text-texto">{i.preco > 0 ? brl(i.preco) : "—"}</span>
              </button>
            );
          })}
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-texto-suave">Nenhum produto.</p>}
        </div>
      </div>

      {/* Carrinho / Pagamento */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="border-b border-borda p-3 font-bold">
          {fase === "pagar" ? <button onClick={() => setFase("menu")} className="font-semibold text-texto-marca">← Voltar</button> : <span className="inline-flex items-center gap-1.5"><Icone nome="compras" tamanho={14} /> Pedido {cartCount > 0 ? `(${cartCount})` : ""}</span>}
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
                        <div className="font-numero text-xs font-semibold text-texto-suave">{brl(x.item.preco * x.qtd)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQtd(x.item.id, x.qtd - 1)} className="h-7 w-7 rounded border border-borda-forte">{x.qtd === 1 ? <Icone nome="lixeira" tamanho={14} titulo="Tirar do pedido" /> : "−"}</button>
                        <span className="w-5 text-center font-bold">{x.qtd}</span>
                        <button onClick={() => setQtd(x.item.id, x.qtd + 1)} className="h-9 w-9 rounded-mesa bg-destaque font-bold text-texto-marca-pilula" aria-label="Mais um">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-borda p-3">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button onClick={() => setLocal("aqui")} className={`min-h-11 rounded-controle py-2 text-sm font-semibold ${local === "aqui" ? "bg-destaque text-texto-marca-pilula shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : "bg-painel-fundo text-texto-suave"}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="salao" tamanho={14} /> Comer aqui</span></button>
                <button onClick={() => setLocal("viagem")} className={`min-h-11 rounded-controle py-2 text-sm font-semibold ${local === "viagem" ? "bg-destaque text-texto-marca-pilula shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : "bg-painel-fundo text-texto-suave"}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="viagem" tamanho={14} /> Viagem</span></button>
              </div>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Nome do cliente / obs (opcional)" className="mb-2 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
              <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
              {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
              <button onClick={() => setFase("pagar")} disabled={cartLista.length === 0} className="btn-principal mb-2 w-full text-base"><span className="inline-flex items-center justify-center gap-2"><Icone nome="dinheiro" tamanho={18} /> Cobrar e finalizar</span></button>
              <button onClick={() => finalizar(null)} disabled={proc || cartLista.length === 0} className="btn-secundario w-full text-sm">{proc ? "Enviando..." : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="panela" tamanho={14} /> Só enviar pra cozinha (pago no caixa)</span>}</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col p-3">
            <div className="mb-3 rounded-cartao bg-superficie-suave p-3 text-center">
              <div className="text-sm text-texto-suave">Total a cobrar {local === "viagem" && <span className="inline-flex items-center gap-1 font-bold text-amber-600">· <Icone nome="viagem" tamanho={13} /> Viagem</span>}</div>
              <div className="text-3xl font-bold">{brl(cobrar)}</div>
              {cbUsado > 0 && <div className="text-xs text-emerald-600">{brl(total)} − {brl(cbUsado)} de cashback</div>}
            </div>
            <div className="mb-2 flex justify-end"><NfceAutoToggle ligado={nfce.ligado} producao={nfce.producao} compacto /></div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {FORMAS.map((f) => (
                <button key={f.id} onClick={() => setForma(f.id)} className={`min-h-11 rounded-controle py-3 text-sm font-semibold ${forma === f.id ? "bg-destaque text-texto-marca-pilula shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : "bg-painel-fundo text-texto"}`}>
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Icone nome={f.icone} tamanho={16} /> {f.label}
                  </span>
                </button>
              ))}
            </div>
            {tipoDe(forma, formas) === "dinheiro" && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Valor recebido</label>
                <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" placeholder="Ex.: 50" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-lg " />
                <div className="mt-2 flex justify-between text-lg font-bold"><span>Troco</span><span className={troco > 0 ? "text-amber-600" : ""}>{brl(troco)}</span></div>
              </div>
            )}
            {tipoForma === "vale_presente" && (
              <div className="mb-3">
                <CampoVale vale={vale} onVale={setVale} semCodigo={valeSemCodigo} onSemCodigo={setValeSemCodigo} campoCls="w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-sm" />
                {vale && vale.saldo < cobrar - 0.005 && (
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">O saldo não cobre a venda toda. Pra usar o vale e pagar o resto de outro jeito, lance pelo caixa do salão.</p>
                )}
              </div>
            )}
            {semDinheiro && !valeComCodigo && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Motivo (obrigatório)</label>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 200))} placeholder={tipoForma === "cortesia" ? "ex.: aniversário, cortesia da casa" : "ex.: vale nº 123"} className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-sm" />
                <p className="mt-1 text-xs text-texto-fraco">Não entra no caixa nem no faturamento e não sai nota.</p>
              </div>
            )}
            {tipoForma === "equipe" && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Funcionário (vai pra Compras internas)</label>
                <select value={colabId} onChange={(e) => setColabId(e.target.value)} className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-sm">
                  <option value="">— escolher —</option>
                  {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
            {tipoForma === "saldo" && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Cliente (vai pro saldo dele)</label>
                {cliente ? (
                  <div className="mt-1 flex items-center justify-between rounded-controle border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"><span className="font-semibold">{cliente.nome}</span><button type="button" onClick={() => escolherCliente(null)} className="text-xs text-texto-suave">trocar</button></div>
                ) : (
                  <>
                    <input value={buscaCli} onChange={(e) => { const v = e.target.value; setBuscaCli(v); if (v.trim().length >= 2) buscarClientesPdv(v).then(setCliResultados).catch(() => setCliResultados([])); else setCliResultados([]); }} placeholder="Nome ou CPF do cliente" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2.5 text-sm" />
                    {cliResultados.length > 0 && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-controle border border-borda">
                        {cliResultados.map((c) => <button key={c.id} type="button" onClick={() => escolherCliente({ id: c.id, nome: c.nome })} className="block w-full px-3 py-2 text-left text-sm hover:bg-superficie-suave">{c.nome}{c.cpf_cnpj ? <span className="text-texto-fraco"> · {c.cpf_cnpj}</span> : null}</button>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {tipoForma !== "saldo" && tipoForma !== "equipe" && (
              <div className="mb-3">
                <label className="text-sm text-texto-suave">Cliente <span className="text-texto-fraco">(opcional, pro cashback)</span></label>
                {cliente ? (
                  <div className="mt-1 rounded-controle border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between"><span className="font-semibold">{cliente.nome}</span><button type="button" onClick={() => escolherCliente(null)} className="text-xs text-texto-suave">tirar</button></div>
                    {cb === null ? (
                      <div className="mt-0.5 text-xs text-texto-suave">Cashback desligado no balcão.</div>
                    ) : cb.saldo > 0 ? (
                      <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={usarCb} onChange={(e) => setUsarCb(e.target.checked)} className="h-4 w-4" /> Usar cashback: tem {brl(cb.saldo)}{cb.maxResgate != null && cb.saldo > cb.maxResgate ? ` (até ${brl(cb.maxResgate)} por venda)` : ""}</label>
                    ) : (
                      <div className="mt-0.5 text-xs text-texto-suave">Sem saldo ainda. Ganha {String(cb.percentual).replace(".", ",")}% desta compra.</div>
                    )}
                  </div>
                ) : (
                  <>
                    <input value={buscaCli} onChange={(e) => { const v = e.target.value; setBuscaCli(v); if (v.trim().length >= 2) buscarClientesPdv(v).then(setCliResultados).catch(() => setCliResultados([])); else setCliResultados([]); }} placeholder="Nome, telefone ou CPF (opcional)" className="mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm" />
                    {cliResultados.length > 0 && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-controle border border-borda">
                        {cliResultados.map((c) => <button key={c.id} type="button" onClick={() => escolherCliente({ id: c.id, nome: c.nome })} className="block w-full px-3 py-2 text-left text-sm hover:bg-superficie-suave">{c.nome}{c.telefone ? <span className="text-texto-fraco"> · {c.telefone}</span> : c.cpf_cnpj ? <span className="text-texto-fraco"> · {c.cpf_cnpj}</span> : null}</button>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {tipoDe(forma, formas) === "pix" && pixAtivo && cobrar > 0 && (
              <div className="mb-3"><PixQr valor={cobrar} descricao="Brasa balcão" origem="pdv" onPago={() => finalizar({ forma, colaboradorId: colabId || null, clienteId: cliente?.id ?? null, usarCashback: cbUsado > 0 })} compacto /></div>
            )}
            <div className="flex-1" />
            {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
            {tefDoTipo(tipoForma) && agenteTef ? (
              <CobrarPinpad
                tipo={tefDoTipo(tipoForma)!}
                valor={cobrar}
                agente={agenteTef}
                desabilitado={proc || faltaQuem || cartLista.length === 0}
                aoAprovar={finalizarComTef}
              />
            ) : tipoDe(forma, formas) === "pix" && pixAtivo && cobrar > 0 ? (
              // Com QR na tela, a venda fecha sozinha quando o Pix cai (ou por "Vi que caiu").
              // Este botão é só pra quem recebeu pela chave, sem QR.
              <button onClick={() => finalizar({ forma, colaboradorId: colabId || null, clienteId: cliente?.id ?? null, usarCashback: cbUsado > 0 })} disabled={proc || faltaQuem} className="w-full rounded-cartao border border-borda-forte py-2.5 text-sm font-semibold text-texto-suave disabled:opacity-50 dark:border-borda-forte">{proc ? "Concluindo..." : "Recebi o Pix pela chave (sem QR) — concluir"}</button>
            ) : (
              <button onClick={() => finalizar({ forma, colaboradorId: colabId || null, clienteId: cliente?.id ?? null, usarCashback: cbUsado > 0 })} disabled={proc || faltaQuem} className="w-full rounded-cartao bg-texto py-3.5 text-base font-bold text-fundo disabled:opacity-50">{proc ? "Concluindo..." : <span className="inline-flex items-center justify-center gap-2"><Icone nome="certo" tamanho={18} /> Confirmar e enviar pra cozinha</span>}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
