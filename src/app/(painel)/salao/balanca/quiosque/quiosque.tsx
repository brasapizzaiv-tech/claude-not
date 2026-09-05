"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- WebSerial não tem tipos no TS padrão */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { gerarComandaBuffetKiosk, gerarComandaLivreKiosk, virarLivreKiosk, virarLivrePorNumeroKiosk } from "../../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LIMIAR = 0.05; // kg de comida para considerar "prato na balança"
const ESTAVEL_MS = 450; // peso parado por ~0,45s → fecha a comanda (rápido)
const TOL_ESTAVEL = 0.05; // oscilação tolerada (50 g) para considerar "parado"
const RESET_MS = 6000; // após mostrar a comanda, volta sozinho p/ o próximo cliente

type Resultado = {
  id: string;
  numero: number;
  valor: number;
  liquido: number;
  peso: number;
  tara: number;
  livre: boolean;
  viradaLivre?: boolean;  // pesou antes e virou livre pelo QR
  antes?: number;         // valor que era antes de virar livre
  codigoOffline?: string; // sem internet: código local da fila do agente
};

const AGENTE_URL = "http://localhost:8543";

// QR da comanda (mesmo das comandas normais — aponta para a página da comanda).
function CupomQR({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = (typeof window !== "undefined" ? window.location.origin : "") + `/salao/comandas/${id}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setSrc).catch(() => {});
  }, [id]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR da comanda" style={{ width: "40mm", height: "40mm", margin: "2mm auto 0" }} />;
}

export function QuiosqueBalanca({
  precoKg,
  buffetLivre,
  taraPadrao,
  cupom,
}: {
  precoKg: number;
  buffetLivre: number;
  taraPadrao: number;
  cupom: { nome: string; endereco: string; telefone: string; msg: string };
}) {
  const [estado, setEstado] = useState<
    "conectar" | "aguardando" | "pesando" | "processando" | "resultado"
  >("conectar");
  const [pesoBruto, setPesoBruto] = useState(0);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [diag, setDiag] = useState<{ bytes: number; raw: string }>({ bytes: 0, raw: "" });
  const [taraBalanca, setTaraBalanca] = useState(0); // tara feita NA balança (campo TARA)
  const taraBalancaRef = useRef(0);
  const [soKg, setSoKg] = useState(false); // marmita: só por kg (sem teto do livre)
  const soKgRef = useRef(false);
  const toggleSoKg = () => {
    const v = !soKgRef.current;
    soKgRef.current = v;
    setSoKg(v);
  };

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Depois de pesar, a próxima comanda só sai quando a balança ZERAR (prato
  // retirado) — senão o mesmo prato parado gerava outra comanda.
  const precisaZerar = useRef(false);
  const estadoRef = useRef(estado);
  const refPeso = useRef(0);
  const estavelDesde = useRef(0);

  const setEst = (v: typeof estado) => {
    estadoRef.current = v;
    setEstado(v);
  };

  // Peso líquido (comida): se tarou NA balança, o PESO L já é líquido → não
  // desconta de novo; senão, desconta a tara do sistema (o prato).
  const netDe = (bruto: number, taraBal: number) =>
    taraBal > 0.001 ? Math.max(0, bruto) : Math.max(0, bruto - taraPadrao);

  const calcValor = (bruto: number, soKgFlag: boolean) => {
    const liquido = netDe(bruto, taraBalanca);
    let valor = liquido * precoKg;
    let livre = false;
    if (!soKgFlag && buffetLivre > 0 && valor >= buffetLivre) {
      valor = buffetLivre;
      livre = true;
    }
    return { liquido, valor: Math.round(valor * 100) / 100, livre };
  };

  const liq = netDe(pesoBruto, taraBalanca);
  const { valor: valorAtual } = calcValor(pesoBruto, soKg);

  async function capturar(bruto: number) {
    setEst("processando");
    try {
      const r = await gerarComandaBuffetKiosk(bruto, soKgRef.current, taraBalancaRef.current);
      if (r.ok) {
        const res: Resultado = {
          id: r.id,
          numero: r.numero,
          valor: r.valor,
          liquido: r.liquido,
          peso: r.peso,
          tara: r.tara,
          livre: r.livre,
        };
        setResultado(res);
        setEst("resultado");
        // Imprime o cupom sozinho: pelo agente (térmica deste PC) ou, sem
        // agente, pelo navegador (silencioso com Chrome em --kiosk-printing).
        setTimeout(() => imprimirCupom(res), 400);
        // Fica em "retire o prato" até a balança zerar (sem temporizador: com
        // o prato ainda em cima, o reset por tempo gerava uma 2ª comanda).
        if (resetRef.current) clearTimeout(resetRef.current);
        precisaZerar.current = true;
      } else {
        setEst("aguardando");
      }
    } catch {
      // Sistema fora do ar (internet caiu) → fila offline do agente.
      const ok = await capturarViaAgente({ peso: bruto, tara_balanca: taraBalancaRef.current, so_kg: soKgRef.current });
      if (!ok) setEst("aguardando");
    }
    // Marmita é por pesagem — volta ao normal para o próximo cliente.
    soKgRef.current = false;
    setSoKg(false);
  }

  // ---------- agente da balança (programa no PC) ----------
  const [agente, setAgente] = useState(false);
  const agenteRef = useRef(false);
  const [filaAgente, setFilaAgente] = useState(0);

  // Impressão do cupom: com agente, sai na térmica deste PC (sem janela);
  // sem agente, cai no window.print (Chrome --kiosk-printing).
  const [erroImpressao, setErroImpressao] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  const [impressoras, setImpressoras] = useState<{ nome: string; padrao: boolean }[]>([]);
  const [impressoraCupom, setImpressoraCupom] = useState("");
  const [msgConfig, setMsgConfig] = useState<string | null>(null);

  // "Virar livre": pessoa que pesou antes e voltou — passa o cupom no leitor
  // (ou digita o nº) e a comanda vira BUFFET LIVRE.
  const [virarAberto, setVirarAberto] = useState(false);
  const [numeroVirar, setNumeroVirar] = useState("");
  const [virando, setVirando] = useState(false);
  async function virarPorNumero() {
    const n = Number(numeroVirar.replace(/\D/g, ""));
    if (!n || virando) return;
    setVirando(true);
    setErro("");
    try {
      const r = await virarLivrePorNumeroKiosk(n);
      if (r.ok) {
        setVirarAberto(false);
        setNumeroVirar("");
        concluir({ id: r.id, numero: r.numero, valor: r.valor, liquido: 0, peso: 0, tara: 0, livre: true, viradaLivre: true, antes: r.antes });
      } else {
        setErro(r.mensagem ?? "Não deu certo.");
        setTimeout(() => setErro(""), 5000);
      }
    } catch {
      setErro("Sem conexão com o sistema.");
      setTimeout(() => setErro(""), 5000);
    } finally {
      setVirando(false);
    }
  }

  async function imprimirCupom(r: Resultado | null) {
    if (!r) return;
    if (!agenteRef.current) { try { window.print(); } catch {} return; }
    setErroImpressao(null);
    try {
      const res = await fetch(`${AGENTE_URL}/imprimir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cupom, ...r }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await res.json();
      if (!j.ok) setErroImpressao(j.erro || "falha ao imprimir");
    } catch {
      setErroImpressao("o agente não respondeu");
    }
  }
  async function abrirConfig() {
    setConfigAberta(true);
    setMsgConfig(null);
    try {
      const r = await fetch(`${AGENTE_URL}/impressoras`, { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      setImpressoras(j.impressoras ?? []);
      setImpressoraCupom(j.atual ?? "");
    } catch {
      setMsgConfig("Não consegui listar as impressoras (agente não respondeu).");
    }
  }
  async function escolherImpressora(nome: string) {
    setImpressoraCupom(nome);
    try {
      await fetch(`${AGENTE_URL}/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ impressoraCupom: nome }) });
      setMsgConfig(`✓ Cupom vai sair em "${nome || "impressora padrão do Windows"}"`);
    } catch {
      setMsgConfig("Não consegui salvar.");
    }
  }
  function testarImpressora() {
    setMsgConfig("Imprimindo teste…");
    imprimirCupom({ id: "", numero: 0, valor: 0, liquido: 0, peso: 0, tara: 0, livre: false, codigoOffline: "TESTE" }).then(() => setMsgConfig("Teste enviado — saiu na impressora?"));
  }

  // Procura o agente local: se existir, ele vira a fonte do peso (nada de
  // Web Serial) e a tela pula direto pro atendimento.
  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await fetch(`${AGENTE_URL}/peso`, { signal: AbortSignal.timeout(1200) });
        const j = await r.json();
        if (!vivo) return;
        if (!agenteRef.current) {
          agenteRef.current = true;
          setAgente(true);
          if (estadoRef.current === "conectar") setEst("aguardando");
        }
        setFilaAgente(Number(j.fila) || 0);
        if (j.lendo) {
          setDiag((d) => ({ bytes: d.bytes + 1, raw: "via agente" }));
          taraBalancaRef.current = Number(j.tara) || 0;
          setTaraBalanca(Number(j.tara) || 0);
          processar(Number(j.peso) || 0);
        }
      } catch {
        if (vivo && agenteRef.current) { agenteRef.current = false; setAgente(false); }
      }
      if (vivo) timer = setTimeout(tick, 400);
    }
    tick();
    return () => { vivo = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sem internet no sistema? Manda pro agente: ele cria a comanda (se ele
  // tiver conexão) ou guarda na fila offline e devolve um código local.
  async function capturarViaAgente(payload: { peso?: number; tara_balanca?: number; so_kg?: boolean; livre_direto?: boolean }): Promise<boolean> {
    try {
      const r = await fetch(`${AGENTE_URL}/pesagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const j = await r.json();
      if (!j.ok) return false;
      if (j.offline) {
        const bruto = Number(payload.peso) || 0;
        const { liquido, valor, livre } = payload.livre_direto
          ? { liquido: 0, valor: buffetLivre, livre: true }
          : calcValor(bruto, !!payload.so_kg);
        concluir({ id: "", numero: 0, valor, liquido, peso: bruto, tara: Number(payload.tara_balanca) || 0, livre, codigoOffline: String(j.codigo || "OFF") });
      } else {
        concluir({ id: j.id, numero: j.numero, valor: j.valor, liquido: j.liquido, peso: j.peso, tara: j.tara, livre: j.livre });
      }
      return true;
    } catch {
      return false;
    }
  }

  // Fecha um resultado (livre direto ou virada de livre): mostra, imprime, agenda o reset.
  function concluir(r: Resultado) {
    setResultado(r);
    setEst("resultado");
    setTimeout(() => imprimirCupom(r), 400);
    if (resetRef.current) clearTimeout(resetRef.current);
    if (r.peso > 0) {
      // Pesou: espera a balança zerar (prato retirado).
      precisaZerar.current = true;
    } else {
      // Livre direto / virada de livre (sem prato na balança): volta por tempo.
      resetRef.current = setTimeout(() => {
        refPeso.current = 0;
        estavelDesde.current = 0;
        setPesoBruto(0);
        setEst("aguardando");
      }, RESET_MS);
    }
  }

  // Botão touch: BUFFET LIVRE direto (sem pesar) — imprime na hora.
  async function livreDireto() {
    if (estadoRef.current === "processando") return;
    setEst("processando");
    try {
      const r = await gerarComandaLivreKiosk();
      if (r.ok) concluir({ id: r.id, numero: r.numero, valor: r.valor, liquido: 0, peso: 0, tara: 0, livre: true });
      else { setErro(r.mensagem ?? ""); setEst("aguardando"); setTimeout(() => setErro(""), 4000); }
    } catch {
      const ok = await capturarViaAgente({ livre_direto: true });
      if (!ok) setEst("aguardando");
    }
  }

  // Leitor QR (age como teclado): comanda pesada vira LIVRE (substitui o valor).
  async function virarLivre(comandaId: string) {
    if (estadoRef.current === "processando") return;
    setEst("processando");
    try {
      const r = await virarLivreKiosk(comandaId);
      if (r.ok) { setVirarAberto(false); concluir({ id: r.id, numero: r.numero, valor: r.valor, liquido: 0, peso: 0, tara: 0, livre: true, viradaLivre: true, antes: r.antes }); }
      else { setErro(r.mensagem ?? "Não deu certo."); setEst("aguardando"); setTimeout(() => setErro(""), 5000); }
    } catch {
      setEst("aguardando");
    }
  }

  // Captura o QR lido pelo leitor USB: rajada de teclas rápidas terminando em
  // Enter. Extrai o id da comanda da URL do cupom.
  const qrBuf = useRef({ txt: "", ts: 0 });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const agora = Date.now();
      if (agora - qrBuf.current.ts > 120) qrBuf.current.txt = "";
      qrBuf.current.ts = agora;
      if (e.key === "Enter") {
        const m =
          qrBuf.current.txt.match(/comandas\/([0-9a-f-]{36})/i) ||
          qrBuf.current.txt.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (m) virarLivre(m[1]);
        qrBuf.current.txt = "";
      } else if (e.key.length === 1) {
        qrBuf.current.txt += e.key;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Processa cada leitura de peso (máquina de estados).
  function processar(bruto: number) {
    setPesoBruto(bruto);
    const agora = Date.now();
    if (Math.abs(bruto - refPeso.current) > TOL_ESTAVEL) {
      refPeso.current = bruto;
      estavelDesde.current = agora;
    }
    const liquido = netDe(bruto, taraBalancaRef.current);
    const est = estadoRef.current;
    if (est === "processando") return;
    if (est === "resultado") {
      if (liquido <= LIMIAR) {
        if (resetRef.current) clearTimeout(resetRef.current);
        precisaZerar.current = false;
        refPeso.current = 0;
        estavelDesde.current = 0;
        setEst("aguardando"); // prato retirado → próximo cliente
      }
      return;
    }
    if (liquido <= LIMIAR) {
      precisaZerar.current = false;
      if (est !== "aguardando") setEst("aguardando");
      return;
    }
    // Ainda é o prato da pesagem anterior (a balança não zerou): não pesa de novo.
    if (precisaZerar.current) return;
    // Tem prato com comida.
    if (est !== "pesando") {
      setEst("pesando");
      estavelDesde.current = agora;
      return;
    }
    // Estabilizou? → fecha a comanda.
    if (agora - estavelDesde.current >= ESTAVEL_MS) {
      capturar(bruto);
    }
  }

  async function conectar() {
    setErro("");
    const serial = (navigator as any).serial;
    if (!serial) {
      setErro("Abra no Google Chrome do PC (a leitura da balança não funciona no celular).");
      return;
    }
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      try {
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      } catch {}
      portRef.current = port;
      setEst("aguardando");
      lerLoop(port);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => enviarEnq().catch(() => {}), 500);
    } catch (e: any) {
      setErro("Não conectou: " + (e?.message || String(e)));
    }
  }

  async function enviarEnq() {
    const writer = portRef.current?.writable?.getWriter();
    if (!writer) return;
    try {
      await writer.write(new Uint8Array([0x05]));
    } finally {
      writer.releaseLock();
    }
  }

  async function lerLoop(port: any) {
    const decoder = new TextDecoder();
    let buf = "";
    try {
      const reader = port.readable.getReader();
      readerRef.current = reader;
      let tot = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        tot += value?.length ?? 0;
        buf += decoder.decode(value, { stream: true });
        if (buf.length > 800) buf = buf.slice(-800);
        setDiag({ bytes: tot, raw: buf.slice(-120) });
        // Tara feita na própria balança (campo TARA do rótulo).
        const t = [...buf.matchAll(/TARA[:\s]*(-?\d+[.,]\d+)/gi)];
        if (t.length) {
          const tb = parseFloat(t[t.length - 1][1].replace(",", "."));
          taraBalancaRef.current = tb;
          setTaraBalanca(tb);
        }
        const m = [...buf.matchAll(/PESO\s*L[:\s]*(-?\d+[.,]\d+)/gi)];
        if (m.length) processar(parseFloat(m[m.length - 1][1].replace(",", ".")));
      }
    } catch {
      /* leitura cancelada */
    }
  }

  // ---- UI ----
  const badge =
    estado === "resultado"
      ? "bg-green-500 text-white"
      : estado === "pesando" || estado === "processando"
        ? "bg-[#C78340] text-white"
        : "bg-white text-[#211915] shadow-md";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#f6efe6] text-[#211915]">
      {/* topo */}
      <div className="flex shrink-0 items-center justify-between px-8 py-[clamp(0.5rem,2vh,1.25rem)]">
        <div className="flex items-center gap-[clamp(0.75rem,2vw,1.5rem)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-[clamp(4rem,15vh,11rem)] w-auto" />
          <div>
            <p className="text-[clamp(1.4rem,4vw,3rem)] font-black leading-tight text-[#211915]">{cupom.nome || "Brasa Pizzaria e Restaurante"}</p>
            <p className="text-[clamp(0.8rem,1.8vw,1.2rem)] text-[#211915]/50">Autoatendimento · pese o prato e pegue seu cupom</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {agente && (
            <button onClick={abrirConfig} className="text-3xl text-[#211915]/40 hover:text-[#211915]/80" title="Impressora do cupom">⚙️</button>
          )}
          <Link
            href="/salao/balanca"
            className="text-4xl text-[#211915]/40 hover:text-[#211915]/80"
            title="Sair do modo quiosque"
          >
            ✕
          </Link>
        </div>
      </div>

      {configAberta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6" onClick={() => setConfigAberta(false)}>
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 text-[#211915] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-2xl font-bold">🖨️ Impressora do cupom</h2>
            <p className="mb-4 text-sm text-[#211915]/60">Impressoras deste PC (o agente imprime direto, sem janela).</p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              <button
                onClick={() => escolherImpressora("")}
                className={`block w-full rounded-xl border px-4 py-3 text-left text-lg ${impressoraCupom === "" ? "border-[#C78340] bg-[#C78340]/30" : "border-[#211915]/15 hover:bg-[#211915]/5"}`}
              >
                Padrão do Windows
              </button>
              {impressoras.map((p) => (
                <button
                  key={p.nome}
                  onClick={() => escolherImpressora(p.nome)}
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-lg ${impressoraCupom === p.nome ? "border-[#C78340] bg-[#C78340]/30" : "border-[#211915]/15 hover:bg-[#211915]/5"}`}
                >
                  {p.nome}{p.padrao ? <span className="ml-2 text-xs text-[#211915]/50">(padrão)</span> : null}
                </button>
              ))}
              {impressoras.length === 0 && !msgConfig && <p className="text-[#211915]/50">Procurando impressoras…</p>}
            </div>
            {msgConfig && <p className="mt-3 text-sm text-[#C78340]">{msgConfig}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={testarImpressora} className="flex-1 rounded-xl border border-[#211915]/20 py-3 text-lg hover:bg-[#211915]/5">🧾 Imprimir teste</button>
              <button onClick={() => setConfigAberta(false)} className="flex-1 rounded-xl bg-[#C78340] py-3 text-lg font-bold">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {virarAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onClick={() => setVirarAberto(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 text-center text-[#211915] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[clamp(1.5rem,4vw,2.5rem)] font-black text-[#C78340]">🔄 Virar buffet livre</h2>
            <p className="mt-2 text-[clamp(1rem,2.5vw,1.5rem)] text-[#211915]/80">
              Passe o <b>QR do seu cupom</b> no leitor. A comanda pesada vira <b>BUFFET LIVRE ({moeda(buffetLivre)})</b> e sai um cupom novo.
            </p>
            <div className="my-5 text-[clamp(3rem,10vw,6rem)]">📷</div>
            <p className="mb-2 text-sm text-[#211915]/50">Não leu? Digite o número da comanda que está no cupom:</p>
            <div className="flex justify-center gap-2">
              <input
                inputMode="numeric"
                value={numeroVirar}
                onChange={(e) => setNumeroVirar(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") virarPorNumero(); }}
                placeholder="Nº"
                className="w-40 rounded-2xl border-2 border-[#211915]/20 px-4 py-3 text-center text-3xl font-black outline-none focus:border-[#C78340]"
              />
              <button onClick={virarPorNumero} disabled={virando || !numeroVirar.trim()} className="rounded-2xl bg-[#C78340] px-6 py-3 text-2xl font-bold text-white disabled:opacity-40">
                {virando ? "..." : "Virar livre"}
              </button>
            </div>
            {erro && <p className="mt-3 text-lg text-red-600">{erro}</p>}
            <button onClick={() => setVirarAberto(false)} className="mt-6 text-lg text-[#211915]/50 underline">Cancelar</button>
          </div>
        </div>
      )}

      {estado === "conectar" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <p className="max-w-2xl text-[clamp(1.25rem,4vw,2.5rem)] font-medium text-[#211915]/80">
            Modo balança / autoatendimento
          </p>
          <button
            onClick={conectar}
            className="rounded-3xl bg-[#C78340] px-[clamp(2rem,7vw,4rem)] py-[clamp(1rem,3vh,2rem)] text-[clamp(1.25rem,4vw,2.5rem)] font-bold text-white shadow-lg hover:brightness-110"
          >
            Conectar balança
          </button>
          <p className="text-[clamp(0.8rem,2vw,1.25rem)] text-[#211915]/40">
            Clique uma vez e escolha a porta da balança na lista
            (<b>Prolific</b> ou <b>USB-Serial</b>) — pode ser COM3, COM5, COM7... Depois deixe rodando.
          </p>
          {erro && <p className="max-w-lg text-lg text-red-600">{erro}</p>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
         <div className="m-auto flex w-full flex-col items-center py-3">
          {/* instrução / resultado */}
          {estado === "resultado" && resultado ? (
            <div className="text-center">
              <div className={`mb-6 inline-block rounded-full px-[clamp(1rem,5vw,3rem)] py-[clamp(0.5rem,2vh,1.25rem)] text-[clamp(1.5rem,5vw,3.5rem)] font-black text-white shadow-lg ${resultado.codigoOffline ? "bg-amber-500" : "bg-green-500"}`}>
                {resultado.codigoOffline
                  ? `✓ REGISTRADO · ${resultado.codigoOffline}`
                  : resultado.viradaLivre
                    ? `✓ COMANDA Nº ${resultado.numero} AGORA É LIVRE`
                    : `✓ COMANDA Nº ${resultado.numero}`}
              </div>
              {resultado.codigoOffline && (
                <p className="mb-2 text-[clamp(0.9rem,2.5vw,1.4rem)] text-amber-700">
                  Sem internet agora — a comanda entra no sistema sozinha quando a conexão voltar.
                </p>
              )}
              {resultado.peso > 0 ? (
                <div className="mx-auto max-w-3xl rounded-3xl border-4 border-amber-400 bg-amber-100 px-8 py-4">
                  <p className="text-[clamp(1.75rem,6vw,4rem)] font-black text-amber-700">⬆ RETIRE O PRATO</p>
                  <p className="mt-1 text-[clamp(0.9rem,2.5vw,1.5rem)] text-[#211915]/70">Pegue seu cupom · a próxima pesagem começa quando a balança zerar</p>
                </div>
              ) : (
                <p className="text-[clamp(1.25rem,4vw,2.5rem)] text-[#211915]/80">Pegue seu cupom · bom apetite!</p>
              )}
              <p className="mt-6 text-[clamp(3rem,13vw,8rem)] font-black leading-none text-green-600">{moeda(resultado.valor)}</p>
              <p className="mt-3 text-[clamp(1rem,3vw,2rem)] text-[#211915]/50">
                {resultado.liquido.toFixed(3).replace(".", ",")} kg
                {resultado.livre ? " · Buffet livre" : ""}
              </p>
              <button
                onClick={() => imprimirCupom(resultado)}
                className="nao-imprimir mt-6 rounded-xl border border-[#211915]/20 px-6 py-3 text-xl text-[#211915]/70 hover:bg-[#211915]/5"
              >
                🖨️ Imprimir de novo
              </button>
              {erroImpressao && (
                <p className="mt-3 text-[clamp(0.9rem,2.2vw,1.3rem)] text-red-600">Impressora: {erroImpressao} — confira em ⚙️</p>
              )}
            </div>
          ) : (
            <>
              <div className={`mb-6 rounded-3xl px-[clamp(1rem,5vw,3rem)] py-[clamp(0.5rem,2vh,1.5rem)] text-[clamp(1.25rem,5vw,3rem)] font-black uppercase tracking-wide ${badge}`}>
                {estado === "processando"
                  ? "Gerando comanda..."
                  : estado === "pesando"
                    ? "Pesando..."
                    : "Coloque o prato na balança"}
              </div>
              {estado === "aguardando" && (
                <div className="mb-4 animate-bounce text-[clamp(2rem,6vw,4rem)] text-[#211915]/40">⌄</div>
              )}
              {/* peso grande */}
              <div className="rounded-[2rem] border-4 border-[#C78340]/40 bg-white shadow-xl px-[clamp(1.5rem,8vw,6rem)] py-[clamp(0.75rem,3vh,2.5rem)] text-center">
                <p className="text-[clamp(3.5rem,16vw,10rem)] font-black leading-none tabular-nums">
                  {liq.toFixed(3).replace(".", ",")}
                  <span className="ml-3 text-[clamp(1.5rem,5vw,3.5rem)] font-light text-[#211915]/50">kg</span>
                </p>
              </div>

              {/* Botões touch: LIVRE direto + Marmita */}
              {/* Botões lado a lado: LIVRE direto · virar livre · marmita */}
              <div className="mt-[clamp(1rem,3vh,2rem)] flex w-full max-w-6xl flex-wrap items-stretch justify-center gap-[clamp(0.5rem,1.5vw,1rem)]">
                {buffetLivre > 0 && liq <= LIMIAR && (
                  <button
                    onClick={livreDireto}
                    className="min-w-[14rem] flex-1 rounded-3xl bg-[#C78340] px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3.5vh,2.25rem)] text-[clamp(1.2rem,3vw,2.2rem)] font-black leading-tight text-white shadow-lg active:brightness-90"
                  >
                    🍽️ QUERO O BUFFET LIVRE
                    <span className="block text-[clamp(1rem,2.4vw,1.6rem)] font-bold opacity-90">{moeda(buffetLivre)}</span>
                  </button>
                )}
                {buffetLivre > 0 && liq <= LIMIAR && (
                  <button
                    onClick={() => { setVirarAberto(true); setNumeroVirar(""); }}
                    className="min-w-[14rem] flex-1 rounded-3xl border-4 border-[#C78340] bg-white px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3.5vh,2.25rem)] text-[clamp(1.1rem,2.6vw,1.9rem)] font-black leading-tight text-[#C78340] shadow-md active:brightness-95"
                  >
                    🔄 JÁ PESEI, QUERO VIRAR LIVRE
                    <span className="block text-[clamp(0.85rem,1.8vw,1.2rem)] font-medium text-[#211915]/50">passe o cupom no leitor</span>
                  </button>
                )}
                <button
                  onClick={toggleSoKg}
                  className={`min-w-[12rem] flex-1 rounded-3xl px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3.5vh,2.25rem)] text-[clamp(1.1rem,2.6vw,1.9rem)] font-black leading-tight shadow-md transition ${
                    soKg ? "bg-yellow-400 text-black" : "border-4 border-[#211915]/15 bg-white text-[#211915]/70 hover:bg-[#211915]/5"
                  }`}
                >
                  🍱 {soKg ? "MARMITA — ativa" : "É MARMITA?"}
                  <span className="block text-[clamp(0.85rem,1.8vw,1.2rem)] font-medium opacity-70">{soKg ? "cobra só por kg nesta pesagem" : "cobra só por kg"}</span>
                </button>
              </div>
              {erro && <p className="mt-3 max-w-xl text-center text-xl text-red-600">{erro}</p>}
              {taraBalanca > 0.001 && (
                <p className="mt-2 text-sm text-[#211915]/40">
                  Tara na balança: {taraBalanca.toFixed(3).replace(".", ",")} kg (peso já líquido)
                </p>
              )}
              {/* Botão manual — garante gerar a comanda se a balança oscilar muito */}
              {liq > LIMIAR && (
                <button
                  onClick={() => capturar(pesoBruto)}
                  className="mt-[clamp(0.75rem,2vh,1.5rem)] rounded-2xl bg-emerald-600 px-[clamp(1.5rem,5vw,3rem)] py-[clamp(0.5rem,2vh,1.25rem)] text-[clamp(1.1rem,3.2vw,2rem)] font-bold text-white hover:bg-emerald-700"
                >
                  ✓ Gerar comanda
                </button>
              )}
            </>
          )}
         </div>
        </div>
      )}

      {/* Aviso só quando a balança conectou mas não manda dados (não some pro cliente). */}
      {estado !== "conectar" && diag.bytes === 0 && (
        <div className="px-4 py-1 text-center text-[11px] text-amber-400/70">
          Balança conectada, mas sem dados — verifique o cabo/porta. Lembre: o peso mostrado
          é <b>líquido</b> (desconta a tara).
        </div>
      )}

      {filaAgente > 0 && (
        <div className="px-4 py-1 text-center text-[12px] font-bold text-amber-700">
          ⚠️ {filaAgente} pesagem(ns) na fila offline — sincronizam sozinhas quando a internet voltar.
        </div>
      )}
      {agente && (
        <div className="px-4 py-0.5 text-center text-[10px] text-white/25">balança via agente local ✓</div>
      )}

      {/* rodapé: preços de HOJE */}
      <div className="grid shrink-0 grid-cols-3 items-center gap-2 border-t border-white/10 bg-black/30 px-4 py-[clamp(0.4rem,1.6vh,1.25rem)] text-center">
        <div>
          <p className="text-[clamp(1.25rem,4.5vw,3rem)] font-black text-white">{buffetLivre > 0 ? moeda(buffetLivre) : "—"}</p>
          <p className="mt-1 text-[clamp(0.6rem,1.4vw,1rem)] uppercase tracking-wide text-[#211915]/40">Valor livre (à vontade)</p>
        </div>
        <div>
          <p className="text-[clamp(2rem,8vw,5.5rem)] font-black leading-none text-[#C78340]">
            {moeda(estado === "resultado" && resultado ? resultado.valor : valorAtual)}
          </p>
          <p className="mt-1 text-[clamp(0.7rem,1.6vw,1.1rem)] uppercase tracking-wide text-[#211915]/50">Valor a pagar</p>
        </div>
        <div>
          <p className="text-[clamp(1.25rem,4.5vw,3rem)] font-black text-[#211915]">{precoKg > 0 ? moeda(precoKg) : "—"}</p>
          <p className="mt-1 text-[clamp(0.6rem,1.4vw,1rem)] uppercase tracking-wide text-[#211915]/40">Valor por kg</p>
        </div>
      </div>

      {/* Cupom da impressora térmica — igual ao da comanda normal */}
      <div className="cupom-print" style={{ textAlign: "center" }}>
        {resultado && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-brasa.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain", margin: "0 auto 1mm" }} />
            <div style={{ fontSize: "13pt", fontWeight: "bold", textTransform: "uppercase" }}>
              {cupom.nome}
            </div>
            {(cupom.endereco || cupom.telefone) && (
              <div style={{ fontSize: "8pt" }}>
                {[cupom.endereco, cupom.telefone].filter(Boolean).join(" · ")}
              </div>
            )}
            <div style={{ fontSize: "8pt", textTransform: "uppercase", marginTop: "1mm" }}>Comanda · Balança</div>
            <div style={{ fontSize: "26pt", fontWeight: "bold", lineHeight: 1 }}>{resultado.codigoOffline ? resultado.codigoOffline : `#${resultado.numero}`}</div>

            {resultado.peso > 0 ? (
              <div style={{ display: "flex", justifyContent: "center", gap: "4mm", marginTop: "2mm", fontSize: "9pt" }}>
                <div>
                  <div style={{ fontSize: "7pt" }}>PESO</div>
                  <b>{resultado.peso.toFixed(3).replace(".", ",")} kg</b>
                </div>
                <div>
                  <div style={{ fontSize: "7pt" }}>TARA</div>
                  <b>{resultado.tara.toFixed(3).replace(".", ",")} kg</b>
                </div>
                <div>
                  <div style={{ fontSize: "7pt" }}>VALOR</div>
                  <b>{moeda(resultado.valor)}</b>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "2mm", fontSize: "9pt" }}>
                <div style={{ fontSize: "7pt" }}>VALOR</div>
                <b>{moeda(resultado.valor)}</b>
              </div>
            )}
            {resultado.livre && (
              <div style={{ fontSize: "11pt", fontWeight: "bold", marginTop: "1mm" }}>
                {resultado.viradaLivre ? "★ AGORA É BUFFET LIVRE ★" : "BUFFET LIVRE"}
              </div>
            )}
            {resultado.viradaLivre && resultado.antes != null && (
              <div style={{ fontSize: "8pt" }}>era {moeda(resultado.antes)} por peso</div>
            )}

            {resultado.codigoOffline ? (
              <div style={{ fontSize: "9pt", fontWeight: "bold", border: "1px solid #000", padding: "2mm", margin: "2mm 0" }}>
                SEM INTERNET NO MOMENTO<br />Guarde este cupom — código {resultado.codigoOffline}.<br />A comanda entra no sistema automaticamente.
              </div>
            ) : (
              <CupomQR id={resultado.id} />
            )}
            <div style={{ fontSize: "8pt", marginTop: "1mm" }}>{new Date().toLocaleString("pt-BR")}</div>
            {cupom.msg && <div style={{ fontSize: "9pt", marginTop: "1mm" }}>{cupom.msg}</div>}

            <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt" }}>
              <span>{resultado.peso > 0 ? `Buffet (${resultado.liquido.toFixed(3).replace(".", ",")} kg)` : "Buffet livre (à vontade)"}</span>
              <span>{moeda(resultado.valor)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13pt", fontWeight: "bold", marginTop: "1mm" }}>
              <span>TOTAL</span>
              <span>{moeda(resultado.valor)}</span>
            </div>
          </>
        )}
      </div>
      <style>{`
        .cupom-print { display: none; }
        @media print {
          @page { size: 72mm auto; margin: 0; }
          html, body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .cupom-print, .cupom-print * { visibility: visible; color: #000 !important; background: transparent !important; }
          .cupom-print {
            display: block; position: absolute; left: 0; top: 0;
            width: 72mm; box-sizing: border-box; padding: 3mm 3mm;
            font-family: 'Courier New', monospace; font-size: 11pt; line-height: 1.3;
          }
          /* Logo laranja vira preto sólido para sair nítida na térmica */
          .cupom-print img { filter: brightness(0) !important; }
        }
      `}</style>
    </div>
  );
}
