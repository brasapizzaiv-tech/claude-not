"use client";

// Painel de pagamento do caixa, no formato que o Rafael já conhecia do Consumer:
// a conta aceita VÁRIOS pagamentos até "Falta pagar" zerar; cada forma tem uma
// tecla de atalho; ao escolher a forma abre um passo com o valor já selecionado,
// botão de "auto preencher o que falta", cédulas (Shift soma), observação e,
// no cartão, a bandeira. Enter salva, Esc volta.
import { useEffect, useMemo, useRef, useState } from "react";
import { tefConfirmar, tefDisponivel, tefVenda, tipoTefDaForma, type TefDados, type TefStatus } from "@/lib/tef-client";
import { Icone, type NomeIcone } from "@/components/icone";

export type Pagamento = {
  uid: string;
  forma: string;
  valor: number;        // o que entra na conta
  recebido?: number;    // dinheiro: o que o cliente entregou (pra calcular troco)
  bandeira?: string | null;
  observacao?: string | null;
  tef?: TefDados | null;  // preenchido quando o cartão passou pelo pinpad (TEF)
  // "Compra da equipe": vai pra conta do funcionário em Compras internas.
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
};
export type ColabMini = { id: string; nome: string; aberto: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const cent = (n: number) => Math.round(n * 100) / 100;
// Identificador local de um pagamento lançado (fora do componente: o compilador
// do React não deixa chamar Date.now/Math.random dentro do render).
const novoUid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Tecla de atalho por forma (a letra é mostrada no botão).
export function atalhoDaForma(forma: string): string {
  const f = forma.toLowerCase();
  if (f.includes("dinheiro")) return "A";
  if (f.includes("pix")) return "P";
  if (f.includes("créd") || f.includes("cred")) return "C";
  if (f.includes("déb") || f.includes("deb")) return "B";
  if (f.includes("vale") || f.includes("refei")) return "R";
  if (f.includes("saldo") || f.includes("fiado")) return "F";
  // "E" de equipe: a primeira letra seria "C" e bateria com Cartão de crédito.
  if (f.includes("equipe") || f.includes("funcion")) return "E";
  return forma.trim().charAt(0).toUpperCase();
}
const ehCartao = (f: string) => /cart|créd|cred|déb|deb/i.test(f);
const ehDinheiro = (f: string) => /dinheiro/i.test(f);
const ehFiado = (f: string) => /saldo cliente|fiado/i.test(f);
// Consumo de funcionário: entra em Compras internas (o "fiado" da equipe).
export const ehEquipe = (f: string) => /compra da equipe|funcion/i.test(f);
const ehPix = (f: string) => /pix/i.test(f);

// Desenho de cada forma de pagamento, pela tecla de atalho.
const ICONE: Record<string, NomeIcone> = { A: "dinheiro", P: "rapido", C: "cartao", B: "cartao", R: "salao", F: "cupom" };
const CEDULAS = [2, 5, 10, 20, 50, 100];
const BANDEIRAS: { tecla: string; nome: string }[] = [
  { tecla: "V", nome: "Visa" },
  { tecla: "M", nome: "Master" },
  { tecla: "E", nome: "Elo" },
  { tecla: "X", nome: "Amex" },
  { tecla: "S", nome: "Outra" },
];

export function PainelPagamentos({
  formas,
  total,
  pagos,
  onAdicionar,
  onRemover,
  onTefConfirmado,
  ativo,
  fiado,
  qrPix,
  colaboradores = [],
}: {
  formas: string[];
  total: number;
  pagos: Pagamento[];
  onAdicionar: (p: Pagamento) => void;
  onRemover: (uid: string) => void;
  // Um cartão já lançado foi confirmado (CNF) no pinpad antes de passar o
  // próximo — o dono da lista marca `tef.confirmado` nele.
  onTefConfirmado?: (uid: string) => void;
  ativo: boolean; // a tela está pronta pra receber (tem itens)
  fiado?: { nome: string; saldo: number; limite: number | null } | null;
  qrPix?: (valor: number, aoPagar: () => void) => React.ReactNode;
  colaboradores?: ColabMini[];
}) {
  const [forma, setForma] = useState<string | null>(null); // forma sendo lançada
  const [valor, setValor] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [obs, setObs] = useState("");
  const [colabId, setColabId] = useState("");
  const [buscaColab, setBuscaColab] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState(1); // só no crédito com pinpad; volta a 1 ao fechar
  const campoRef = useRef<HTMLInputElement>(null);


  const somaPagos = cent(pagos.reduce((s, p) => s + p.valor, 0));
  const falta = cent(total - somaPagos);
  const trocoTotal = cent(pagos.reduce((s, p) => s + Math.max(0, (p.recebido ?? p.valor) - p.valor), 0));

  // Abre o passo de uma forma com o que falta já preenchido.
  function abrir(f: string) {
    if (!ativo || falta <= 0.005) return;
    setForma(f);
    setValor(falta.toFixed(2).replace(".", ","));
    setBandeira("");
    setObs("");
    setAviso(null);
  }
  function fechar() {
    setForma(null);
    setValor("");
    setBandeira("");
    setObs("");
    setAviso(null);
    setParcelas(1);
    setColabId("");
    setBuscaColab("");
  }

  // Foco no valor assim que o passo abre (o caixa já digita por cima).
  useEffect(() => {
    if (!forma) return;
    const t = setTimeout(() => campoRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, [forma]);

  // Atalhos de teclado. Só valem fora de campos de texto, pra não atrapalhar
  // quem está digitando busca, desconto ou observação.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (forma) {
        if (e.key === "Escape") { e.preventDefault(); fechar(); }
        // Bandeira por tecla, mas só com o foco no campo do valor (senão a letra
        // sumiria de dentro da observação).
        if (ehCartao(forma) && campoRef.current && document.activeElement === campoRef.current) {
          const b = BANDEIRAS.find((x) => x.tecla === e.key.toUpperCase());
          if (b) { e.preventDefault(); setBandeira(b.nome); setAviso(null); }
        }
        return;
      }
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;
      const letra = e.key.toUpperCase();
      const f = formas.find((x) => atalhoDaForma(x) === letra);
      if (f) { e.preventDefault(); abrir(f); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma, formas, ativo, falta]);

  // Quanto o cliente entregou (dinheiro) x quanto entra na conta.
  const entregue = num(valor);
  // Nunca lança mais do que falta; no dinheiro a diferença vira troco.
  const aplica = cent(Math.min(entregue, falta));
  const troco = forma && ehDinheiro(forma) ? Math.max(0, cent(entregue - falta)) : 0;

  const fiadoEstoura = useMemo(() => {
    if (!forma || !ehFiado(forma) || !fiado || fiado.limite == null) return null;
    const novo = cent(fiado.saldo + aplica);
    return novo > fiado.limite + 0.005 ? { novo, limite: fiado.limite, saldo: fiado.saldo } : null;
  }, [forma, fiado, aplica]);

  // Agente TEF neste PC? (pinpad integrado). Procura ao abrir a tela e de
  // tempos em tempos — se o programa for ligado depois, o botão aparece sozinho.
  const [tef, setTef] = useState<TefStatus | null>(null);
  const [tefEtapa, setTefEtapa] = useState<"" | "enviando" | "pinpad">("");
  useEffect(() => {
    let vivo = true;
    const olhar = async () => { const s = await tefDisponivel(); if (vivo) setTef(s); };
    const t0 = setTimeout(olhar, 0);
    const t = setInterval(olhar, 15000);
    return () => { vivo = false; clearTimeout(t0); clearInterval(t); };
  }, []);
  const tefAplica = (f: string | null) => !!f && !!tef && tipoTefDaForma(f) !== null;

  // Manda o valor pro pinpad; aprovado → vira pagamento já com NSU/bandeira.
  async function passarNoCartao() {
    if (!forma || !tef || tefEtapa) return;
    const tipo = tipoTefDaForma(forma);
    if (!tipo) return;
    if (!(aplica > 0.005)) { setAviso("Informe o valor."); return; }
    setAviso(null);
    setTefEtapa("enviando");
    try {
      // Dois cartões na mesma conta: o gerenciador exige que a transação
      // anterior esteja confirmada (CNF) ou desfeita antes de começar outra.
      // Até 24/09 o caixa só confirmava depois de gravar a venda inteira, e o
      // agente — seguindo a regra — DESFAZIA o primeiro cartão em silêncio ao
      // receber o segundo. Então o cartão que já passou é confirmado aqui,
      // antes do próximo. Daí em diante ele não tem mais "desfazer": se a
      // venda não gravar, vai pra Cartões (TEF) pra ser cancelado (quem cuida
      // disso é a tela de receber).
      for (const p of pagos) {
        if (!p.tef?.idAgente || p.tef.confirmado) continue;
        const c = await tefConfirmar(p.tef.idAgente);
        if (!c.ok) { setAviso(`Não consegui confirmar o cartão anterior (NSU ${p.tef.nsu ?? "?"}): ${c.erro || "o agente não respondeu"}.`); return; }
        if (c.aviso) {
          setAviso(`O cartão anterior (NSU ${p.tef.nsu ?? "?"}) não está mais em aberto no agente — deve ter sido desfeito. Tire esse pagamento da conta e passe o cartão de novo.`);
          return;
        }
        onTefConfirmado?.(p.uid);
      }
      setTefEtapa("pinpad");
      const r = await tefVenda({ valor: cent(aplica), tipo, parcelas: tipo === "credito" ? parcelas : 1 });
      if (!r.ok) { setAviso(r.erro || "O TEF não respondeu."); return; }
      if (!r.aprovada) { setAviso(`Cartão não aprovado: ${r.mensagem || "recusado"}.`); return; }
      const dados: TefDados = {
        idAgente: r.idAgente || "",
        terminal: r.terminal ?? null,
        nsu: r.nsu ?? null,
        nsuHost: r.nsuHost ?? null,
        autorizacao: r.autorizacao ?? null,
        rede: r.rede ?? null,
        bandeira: r.bandeira ?? null,
        produto: r.produto ?? null,
        tipo,
        parcelas: Number(r.parcelas) || (tipo === "credito" ? parcelas : 1),
        panMascarado: r.panMascarado ?? null,
        viaCliente: r.viaCliente ?? [],
        viaLoja: r.viaLoja ?? [],
        requerConfirmacao: !!r.requerConfirmacao,
        confirmado: false,
      };
      onAdicionar({
        uid: novoUid(),
        forma,
        valor: cent(aplica),
        bandeira: dados.bandeira || bandeira || null,
        observacao: obs.trim() || null,
        tef: dados,
      });
      // Rede de segurança: se mesmo assim o agente desfez um cartão anterior,
      // o caixa fica sabendo e aquele pagamento sai da conta.
      if (r.desfeitaAnterior) {
        const antigo = pagos.find((p) => p.tef?.idAgente === r.desfeitaAnterior?.id);
        if (antigo) onRemover(antigo.uid);
        setAviso(`O agente DESFEZ o cartão anterior (NSU ${r.desfeitaAnterior.nsu ?? "?"}, ${brl(r.desfeitaAnterior.valor)}) porque estava sem confirmação. Esse pagamento saiu da conta — passe o cartão de novo.`);
        return;
      }
      fechar();
    } catch {
      setAviso("O agente TEF não respondeu. Confira o ícone na bandeja.");
    } finally {
      setTefEtapa("");
    }
  }

  function salvar() {
    if (!forma) return;
    if (!(aplica > 0.005)) { setAviso("Informe o valor."); return; }
    if (ehFiado(forma) && !fiado) { setAviso("Vincule o cliente antes de usar o Saldo cliente."); return; }
    if (ehEquipe(forma) && !colabId) { setAviso("Escolha o funcionário."); return; }
    if (fiadoEstoura) {
      setAviso(`Passa do limite: ${fiado?.nome} já deve ${brl(fiadoEstoura.saldo)} e o limite é ${brl(fiadoEstoura.limite)}.`);
      return;
    }
    if (ehCartao(forma) && !bandeira && !tefAplica(forma)) { setAviso("Escolha a bandeira."); return; }
    onAdicionar({
      uid: novoUid(),
      forma,
      valor: cent(aplica),
      recebido: ehDinheiro(forma) ? cent(entregue) : undefined,
      bandeira: bandeira || null,
      observacao: obs.trim() || null,
      colaboradorId: ehEquipe(forma) ? colabId : null,
      colaboradorNome: ehEquipe(forma) ? (colaboradores.find((c) => c.id === colabId)?.nome ?? null) : null,
    });
    fechar();
  }

  // Clique na cédula: preenche; com Shift, soma ao que já está lá.
  function cedula(v: number, somar: boolean) {
    setValor((atual) => (somar ? cent(num(atual) + v) : v).toFixed(2).replace(".", ","));
    setAviso(null);
    campoRef.current?.focus();
  }

  const btn = "rounded-cartao border px-3 py-2 text-sm font-semibold transition";
  const campo = "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

  return (
    <div className="space-y-3">
      {/* ---------- pagamentos já lançados ---------- */}
      {pagos.length > 0 && (
        <ul className="space-y-1">
          {pagos.map((p) => (
            <li key={p.uid} className="flex items-center gap-2 rounded-controle bg-superficie-suave px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-texto-suave">
                {p.forma}
                {p.bandeira ? <span className="text-texto-fraco"> · {p.bandeira}</span> : null}
                {p.tef ? <span className="ml-1 rounded bg-emerald-100 px-1 text-mini font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">TEF · NSU {p.tef.nsu ?? "—"}</span> : null}
                {p.observacao ? <span className="block truncate text-mini text-texto-fraco">{p.observacao}</span> : null}
              </span>
              <span className="font-semibold tabular-nums text-texto">{brl(p.valor)}</span>
              <button onClick={() => onRemover(p.uid)} title="Tirar este pagamento" className="text-texto-fraco hover:text-red-600">✕</button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- total pago / falta pagar ---------- */}
      <div className="grid grid-cols-2 gap-2 rounded-cartao border border-borda p-2.5">
        <div>
          <p className="text-mini text-texto-fraco">Total pago</p>
          <p className="text-xl font-black tabular-nums text-texto">{brl(somaPagos)}</p>
        </div>
        <div className="text-right">
          <p className="text-mini text-texto-fraco">{falta > 0.005 ? "Falta pagar" : "Fechou"}</p>
          <p className={`text-xl font-black tabular-nums ${falta > 0.005 ? "text-amber-600" : "text-emerald-600"}`}>
            {falta > 0.005 ? brl(falta) : "✓"}
          </p>
        </div>
        {trocoTotal > 0.005 && (
          <p className="col-span-2 text-right text-sm font-semibold text-emerald-600">Troco: {brl(trocoTotal)}</p>
        )}
      </div>

      {/* ---------- escolher a forma ---------- */}
      {!forma ? (
        falta > 0.005 && (
          <div>
            <p className="mb-1.5 text-mini text-texto-fraco">Adicionar pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {formas.map((f) => {
                const k = atalhoDaForma(f);
                return (
                  <button
                    key={f}
                    onClick={() => abrir(f)}
                    disabled={!ativo}
                    className={`${btn} flex items-center gap-2 border-borda-forte text-left text-texto-suave hover:border-orange-500 hover:bg-orange-500/5 disabled:opacity-40 dark:border-borda-forte`}
                  >
                    <span className="flex h-4 items-center">{ICONE[k] ? <Icone nome={ICONE[k]} tamanho={15} /> : "•"}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="rounded bg-zinc-200 px-1 text-mini font-bold text-texto-suave dark:bg-zinc-700">{k}</span>{" "}
                      {f}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-mini text-texto-fraco">Aperte a letra do atalho pra lançar direto.</p>
          </div>
        )
      ) : (
        /* ---------- passo da forma escolhida ---------- */
        <div className="rounded-cartao border-2 border-orange-500 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-bold text-texto">
              {ICONE[atalhoDaForma(forma)] && <Icone nome={ICONE[atalhoDaForma(forma)]} tamanho={16} />} {forma}
            </p>
            <button onClick={fechar} className="text-xs text-texto-fraco hover:text-texto-suave">Esc · voltar</button>
          </div>

          <input
            ref={campoRef}
            inputMode="decimal"
            value={valor}
            onChange={(e) => { setValor(e.target.value); setAviso(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (tefAplica(forma)) passarNoCartao(); else salvar(); } }}
            disabled={!!tefEtapa}
            className={`${campo} text-center text-3xl font-black tabular-nums`}
          />

          <button
            onClick={() => cedula(falta, false)}
            className="mt-2 w-full rounded-controle border border-borda-forte px-3 py-2 text-sm text-texto-suave hover:border-orange-500"
          >
            <b>{brl(falta)}</b> <span className="text-texto-fraco">(faltando)</span>
          </button>

          {ehDinheiro(forma) && (
            <>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {CEDULAS.map((c) => (
                  <button
                    key={c}
                    onClick={(e) => cedula(c, e.shiftKey)}
                    className="rounded-controle border border-borda-forte py-2 text-sm font-semibold tabular-nums text-texto-suave hover:border-orange-500 dark:border-borda-forte"
                  >
                    {brl(c)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-mini text-texto-fraco">Clique para preencher. Segure Shift para somar.</p>
              {troco > 0.005 && <p className="mt-1 text-right text-sm font-bold text-emerald-600">Troco: {brl(troco)}</p>}
            </>
          )}

          {tefAplica(forma) && (
            <div className="mt-3 rounded-cartao border border-emerald-600/40 bg-emerald-50 p-3 dark:bg-emerald-950/30">
              {tefEtapa ? (
                <div className="text-center">
                  <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                    {tefEtapa === "enviando" ? "Enviando pro pinpad…" : "Aguardando o cartão no pinpad…"}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    O cliente insere ou aproxima o cartão e digita a senha. Pra desistir, cancele no pinpad.
                  </p>
                </div>
              ) : (
                <>
                  {tipoTefDaForma(forma) === "credito" && (
                    <div className="mb-2 flex items-center gap-2">
                      <label className="text-xs font-semibold text-emerald-800/80 dark:text-emerald-300/80">Parcelas</label>
                      <select
                        value={parcelas}
                        onChange={(e) => setParcelas(Number(e.target.value))}
                        className="rounded-controle border border-emerald-600/40 bg-painel-cartao px-2 py-1.5 text-sm text-texto"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <option key={n} value={n}>{n === 1 ? "à vista" : `${n}x de ${brl(cent(aplica / n))}`}</option>
                        ))}
                      </select>
                      {parcelas > 1 && <span className="text-mini text-emerald-800/70 dark:text-emerald-400/70">parcelado pela loja (sem juros)</span>}
                    </div>
                  )}
                  <button
                    onClick={passarNoCartao}
                    className="w-full rounded-cartao bg-texto py-3 text-base font-bold text-fundo hover:opacity-90"
                  >
                    <Icone nome="cartao" tamanho={15} className="mr-1.5" /> Passar no cartão · {brl(cent(aplica))}{parcelas > 1 && tipoTefDaForma(forma) === "credito" ? ` em ${parcelas}x` : ""}
                    <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-mini font-semibold">Enter</span>
                  </button>
                  <p className="mt-1.5 text-center text-mini text-emerald-800/70 dark:text-emerald-400/70">
                    Pinpad {tef?.terminal}{tef?.gerenciador ? "" : " · gerenciador de TEF não encontrado neste PC"}. Bandeira, NSU e autorização vêm sozinhos.
                  </p>
                </>
              )}
            </div>
          )}

          {ehCartao(forma) && !tefAplica(forma) && (
            <div className="mt-3">
              <p className="mb-1 text-mini text-texto-fraco">Bandeira</p>
              <div className="flex flex-wrap gap-1.5">
                {BANDEIRAS.map((b) => (
                  <button
                    key={b.nome}
                    onClick={() => { setBandeira(b.nome); setAviso(null); }}
                    className={`rounded-controle px-2.5 py-1.5 text-xs font-semibold ${
                      bandeira === b.nome
                        ? "bg-orange-500 text-white"
                        : "border border-borda-forte text-texto-suave hover:border-orange-500  "
                    }`}
                  >
                    <span className="mr-1 opacity-60">{b.tecla}</span>{b.nome}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-mini text-texto-fraco">Número da autorização e NSU vão vir sozinhos quando a maquininha for integrada.</p>
            </div>
          )}

          {ehFiado(forma) && (
            <div className="mt-3 rounded-controle bg-superficie-suave p-2 text-xs">
              {fiado ? (
                <>
                  <p className="text-texto-suave">
                    <b>{fiado.nome}</b> · já deve {brl(fiado.saldo)}
                    {fiado.limite != null ? ` · limite ${brl(fiado.limite)}` : " · sem limite"}
                  </p>
                  {fiado.limite != null && (
                    <p className={fiadoEstoura ? "mt-0.5 font-semibold text-red-600" : "mt-0.5 text-texto-suave"}>
                      Com esta conta ficaria {brl(cent(fiado.saldo + aplica))}
                      {fiadoEstoura ? " — passa do limite." : "."}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-amber-600">Vincule o cliente lá em cima pra usar o Saldo cliente.</p>
              )}
            </div>
          )}

          {ehEquipe(forma) && (
            <div className="mt-3 rounded-controle bg-superficie-suave p-2">
              <p className="mb-1 text-mini text-texto-fraco">Funcionário</p>
              {colaboradores.length === 0 ? (
                <p className="text-xs text-amber-600">Nenhum funcionário ativo cadastrado.</p>
              ) : (
                <>
                  <input
                    value={buscaColab}
                    onChange={(e) => setBuscaColab(e.target.value)}
                    placeholder="Buscar pelo nome…"
                    className="mb-1.5 w-full rounded-controle border border-borda-forte bg-white px-2 py-1.5 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950"
                  />
                  <div className="max-h-36 overflow-y-auto rounded-controle border border-borda dark:border-borda-forte">
                    {colaboradores
                      .filter((c) => !buscaColab.trim() || c.nome.toLowerCase().includes(buscaColab.trim().toLowerCase()))
                      .slice(0, 40)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setColabId(c.id === colabId ? "" : c.id)}
                          className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-sm ${c.id === colabId ? "bg-orange-500 text-white" : "hover:bg-superficie-suave "}`}
                        >
                          <span>{c.nome}</span>
                          <span className={`text-xs ${c.id === colabId ? "text-white/80" : "text-texto-fraco"}`}>
                            {c.aberto > 0 ? `já deve ${brl(c.aberto)}` : "em dia"}
                          </span>
                        </button>
                      ))}
                  </div>
                  <p className="mt-1 text-mini text-texto-suave">Vai pra conta da pessoa em Compras internas, pra descontar depois.</p>
                </>
              )}
            </div>
          )}

          {ehPix(forma) && qrPix && aplica > 0.005 && (
            <div className="mt-3">{qrPix(cent(aplica), salvar)}</div>
          )}

          <label className="mt-3 block text-mini text-texto-fraco">
            Observação
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, 200))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }}
              placeholder="opcional"
              className={`${campo} mt-1 normal-case`}
            />
          </label>

          {aviso && <p className="mt-2 text-sm font-medium text-red-600">{aviso}</p>}

          <div className="mt-3 flex gap-2">
            <button onClick={fechar} className={`${btn} flex-1 border-borda-forte text-texto-suave `}>
              Voltar
            </button>
            {tefAplica(forma) ? (
              <button
                onClick={() => { if (!bandeira) setBandeira("Outra"); salvar(); }}
                disabled={!!tefEtapa}
                title="Usou a maquininha avulsa? Lança sem passar no pinpad."
                className={`${btn} flex-[2] border-borda-forte text-texto-suave disabled:opacity-40 `}
              >
                Lançar sem passar no pinpad
              </button>
            ) : (
              <button
                onClick={salvar}
                className={`${btn} flex-[2] border-emerald-600 bg-texto text-fundo hover:opacity-90`}
              >
                ✓ Salvar {aplica > 0.005 ? brl(cent(aplica)) : ""}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
