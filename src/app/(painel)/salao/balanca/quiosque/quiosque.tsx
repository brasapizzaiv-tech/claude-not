"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- WebSerial não tem tipos no TS padrão */

import { useRef, useState } from "react";
import Link from "next/link";
import { gerarComandaBuffetKiosk } from "../../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LIMIAR = 0.05; // kg de comida para considerar "prato na balança"
const ESTAVEL_MS = 2000; // peso parado por 2s → fecha a comanda

type Resultado = { numero: number; valor: number; liquido: number; livre: boolean };

export function QuiosqueBalanca({
  precoKg,
  buffetLivre,
  taraPadrao,
}: {
  precoKg: number;
  buffetLivre: number;
  taraPadrao: number;
}) {
  const [estado, setEstado] = useState<
    "conectar" | "aguardando" | "pesando" | "processando" | "resultado"
  >("conectar");
  const [pesoBruto, setPesoBruto] = useState(0);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
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
  const estadoRef = useRef(estado);
  const refPeso = useRef(0);
  const estavelDesde = useRef(0);

  const setEst = (v: typeof estado) => {
    estadoRef.current = v;
    setEstado(v);
  };

  const calcValor = (bruto: number, soKgFlag: boolean) => {
    const liquido = Math.max(0, bruto - taraPadrao);
    let valor = liquido * precoKg;
    let livre = false;
    if (!soKgFlag && buffetLivre > 0 && valor >= buffetLivre) {
      valor = buffetLivre;
      livre = true;
    }
    return { liquido, valor: Math.round(valor * 100) / 100, livre };
  };

  const liq = Math.max(0, pesoBruto - taraPadrao);
  const { valor: valorAtual } = calcValor(pesoBruto, soKg);

  async function capturar(bruto: number) {
    setEst("processando");
    try {
      const r = await gerarComandaBuffetKiosk(bruto, soKgRef.current);
      if (r.ok) {
        setResultado({ numero: r.numero, valor: r.valor, liquido: r.liquido, livre: r.livre });
        setEst("resultado");
        // Imprime o cupom sozinho na impressora térmica (silencioso com Chrome
        // em --kiosk-printing e a POS-80 como impressora padrão).
        setTimeout(() => {
          try {
            window.print();
          } catch {}
        }, 500);
      } else {
        setEst("aguardando");
      }
    } catch {
      setEst("aguardando");
    }
    // Marmita é por pesagem — volta ao normal para o próximo cliente.
    soKgRef.current = false;
    setSoKg(false);
  }

  // Processa cada leitura de peso (máquina de estados).
  function processar(bruto: number) {
    setPesoBruto(bruto);
    const agora = Date.now();
    if (Math.abs(bruto - refPeso.current) > 0.005) {
      refPeso.current = bruto;
      estavelDesde.current = agora;
    }
    const liquido = Math.max(0, bruto - taraPadrao);
    const est = estadoRef.current;
    if (est === "processando") return;
    if (est === "resultado") {
      if (liquido <= LIMIAR) setEst("aguardando"); // prato retirado → próximo cliente
      return;
    }
    if (liquido <= LIMIAR) {
      if (est !== "aguardando") setEst("aguardando");
      return;
    }
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
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.length > 800) buf = buf.slice(-800);
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
        : "bg-white/15 text-white";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-[#2b211b] via-[#211915] to-black text-white">
      {/* topo */}
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-48 w-auto" />
          <span className="text-3xl font-light text-white/60">Buffet</span>
        </div>
        <Link
          href="/salao/balanca"
          className="text-4xl text-white/30 hover:text-white/80"
          title="Sair do modo quiosque"
        >
          ✕
        </Link>
      </div>

      {estado === "conectar" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <p className="max-w-2xl text-4xl font-medium text-white/80">
            Modo balança / autoatendimento
          </p>
          <button
            onClick={conectar}
            className="rounded-3xl bg-[#C78340] px-16 py-8 text-4xl font-bold text-white shadow-lg hover:brightness-110"
          >
            Conectar balança
          </button>
          <p className="text-xl text-white/40">
            Clique uma vez e escolha a porta da balança na lista
            (<b>Prolific</b> ou <b>USB-Serial</b>) — pode ser COM3, COM5, COM7... Depois deixe rodando.
          </p>
          {erro && <p className="max-w-lg text-lg text-red-300">{erro}</p>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* instrução / resultado */}
          {estado === "resultado" && resultado ? (
            <div className="text-center">
              <div className="mb-6 inline-block rounded-full bg-green-500 px-12 py-5 text-6xl font-black">
                ✓ COMANDA Nº {resultado.numero}
              </div>
              <p className="text-4xl text-white/80">Retire o prato e pague no caixa</p>
              <p className="mt-8 text-9xl font-black text-green-400">{moeda(resultado.valor)}</p>
              <p className="mt-3 text-3xl text-white/50">
                {resultado.liquido.toFixed(3).replace(".", ",")} kg
                {resultado.livre ? " · à vontade (livre)" : ""}
              </p>
              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch {}
                }}
                className="nao-imprimir mt-6 rounded-xl border border-white/25 px-6 py-3 text-xl text-white/70 hover:bg-white/10"
              >
                🖨️ Imprimir de novo
              </button>
            </div>
          ) : (
            <>
              <div className={`mb-8 rounded-3xl px-12 py-6 text-5xl font-black uppercase tracking-wide ${badge}`}>
                {estado === "processando"
                  ? "Gerando comanda..."
                  : estado === "pesando"
                    ? "Pesando..."
                    : "Coloque o prato na balança"}
              </div>
              {estado === "aguardando" && (
                <div className="mb-6 animate-bounce text-7xl text-white/40">⌄</div>
              )}
              {/* peso grande */}
              <div className="rounded-[2rem] border-4 border-white/15 bg-black/30 px-24 py-10 text-center">
                <p className="text-[10rem] font-black leading-none tabular-nums">
                  {liq.toFixed(3).replace(".", ",")}
                  <span className="ml-3 text-6xl font-light text-white/50">kg</span>
                </p>
              </div>

              {/* Marmita: só por kg (sem virar livre) */}
              <button
                onClick={toggleSoKg}
                className={`mt-8 rounded-2xl px-10 py-5 text-3xl font-bold transition ${
                  soKg
                    ? "bg-yellow-400 text-black"
                    : "border-2 border-white/25 text-white/70 hover:bg-white/10"
                }`}
              >
                {soKg ? "🍱 MARMITA (só por kg) — ativa" : "🍱 É marmita? (só por kg)"}
              </button>
              {soKg && (
                <p className="mt-2 text-xl text-yellow-300">
                  Esta pesagem cobra por kg, sem virar “à vontade”.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* rodapé: preços de HOJE */}
      <div className="grid grid-cols-3 items-center gap-2 border-t border-white/10 bg-black/30 px-8 py-7 text-center">
        <div>
          <p className="text-5xl font-black text-white">{buffetLivre > 0 ? moeda(buffetLivre) : "—"}</p>
          <p className="mt-1 text-base uppercase tracking-wide text-white/40">Valor livre (à vontade)</p>
        </div>
        <div>
          <p className="text-8xl font-black leading-none text-[#C78340]">
            {moeda(estado === "resultado" && resultado ? resultado.valor : valorAtual)}
          </p>
          <p className="mt-1 text-lg uppercase tracking-wide text-white/50">Valor a pagar</p>
        </div>
        <div>
          <p className="text-5xl font-black text-white">{precoKg > 0 ? moeda(precoKg) : "—"}</p>
          <p className="mt-1 text-base uppercase tracking-wide text-white/40">Valor por kg</p>
        </div>
      </div>

      {/* Cupom da impressora térmica (só aparece na impressão) */}
      <div className="cupom-print">
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14pt" }}>
          BRASA — Buffet
        </div>
        {resultado && (
          <>
            <div style={{ textAlign: "center", fontSize: "20pt", fontWeight: "bold", margin: "2mm 0" }}>
              COMANDA Nº {resultado.numero}
            </div>
            <div>{new Date().toLocaleString("pt-BR")}</div>
            <div>Peso: {resultado.liquido.toFixed(3).replace(".", ",")} kg</div>
            {resultado.livre && <div>À vontade (livre)</div>}
            <div style={{ fontSize: "18pt", fontWeight: "bold", marginTop: "2mm" }}>
              VALOR: {moeda(resultado.valor)}
            </div>
            <div style={{ textAlign: "center", marginTop: "3mm" }}>Pague no caixa</div>
          </>
        )}
      </div>
      <style>{`
        .cupom-print { display: none; }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .cupom-print, .cupom-print * { visibility: visible; color: #000 !important; }
          .cupom-print {
            display: block; position: absolute; left: 0; top: 0;
            width: 80mm; box-sizing: border-box; padding: 4mm 3mm;
            font-family: 'Courier New', monospace; font-size: 12pt; line-height: 1.35;
          }
        }
      `}</style>
    </div>
  );
}
