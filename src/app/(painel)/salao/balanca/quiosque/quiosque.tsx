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

  const calcValor = (bruto: number) => {
    const liquido = Math.max(0, bruto - taraPadrao);
    let valor = liquido * precoKg;
    let livre = false;
    if (buffetLivre > 0 && valor >= buffetLivre) {
      valor = buffetLivre;
      livre = true;
    }
    return { liquido, valor: Math.round(valor * 100) / 100, livre };
  };

  const liq = Math.max(0, pesoBruto - taraPadrao);
  const { valor: valorAtual } = calcValor(pesoBruto);

  async function capturar(bruto: number) {
    setEst("processando");
    try {
      const r = await gerarComandaBuffetKiosk(bruto);
      if (r.ok) {
        setResultado({ numero: r.numero, valor: r.valor, liquido: r.liquido, livre: r.livre });
        setEst("resultado");
      } else {
        setEst("aguardando");
      }
    } catch {
      setEst("aguardando");
    }
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
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-2xl font-black tracking-tight text-[#C78340]">
          BRASA <span className="font-light text-white/70">Buffet</span>
        </span>
        <Link href="/salao/balanca" className="text-white/40 hover:text-white/80" title="Sair do modo quiosque">
          ✕
        </Link>
      </div>

      {estado === "conectar" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="max-w-xl text-2xl font-medium text-white/80">
            Modo balança / autoatendimento
          </p>
          <button
            onClick={conectar}
            className="rounded-2xl bg-[#C78340] px-10 py-5 text-2xl font-bold text-white shadow-lg hover:brightness-110"
          >
            Conectar balança
          </button>
          <p className="text-sm text-white/40">
            Clique uma vez, escolha a porta <b>COM5 (Prolific)</b> e deixe rodando.
          </p>
          {erro && <p className="max-w-md text-sm text-red-300">{erro}</p>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* instrução / resultado */}
          {estado === "resultado" && resultado ? (
            <div className="text-center">
              <div className="mb-4 inline-block rounded-full bg-green-500 px-8 py-3 text-3xl font-black">
                ✓ COMANDA Nº {resultado.numero}
              </div>
              <p className="text-2xl text-white/80">Retire o prato e pague no caixa</p>
              <p className="mt-6 text-7xl font-black text-green-400">{moeda(resultado.valor)}</p>
              <p className="mt-2 text-xl text-white/50">
                {resultado.liquido.toFixed(3).replace(".", ",")} kg
                {resultado.livre ? " · à vontade (livre)" : ""}
              </p>
            </div>
          ) : (
            <>
              <div className={`mb-6 rounded-2xl px-8 py-4 text-3xl font-black uppercase tracking-wide ${badge}`}>
                {estado === "processando"
                  ? "Gerando comanda..."
                  : estado === "pesando"
                    ? "Pesando..."
                    : "Coloque o prato na balança"}
              </div>
              {estado === "aguardando" && (
                <div className="mb-4 animate-bounce text-5xl text-white/40">⌄</div>
              )}
              {/* peso grande */}
              <div className="rounded-3xl border-4 border-white/15 bg-black/30 px-16 py-8 text-center">
                <p className="text-8xl font-black tabular-nums">
                  {liq.toFixed(3).replace(".", ",")}
                  <span className="ml-2 text-4xl font-light text-white/50">kg</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* rodapé: preços */}
      <div className="grid grid-cols-3 items-center gap-2 border-t border-white/10 bg-black/30 px-6 py-5 text-center">
        <div>
          <p className="text-3xl font-black text-white">{buffetLivre > 0 ? moeda(buffetLivre) : "—"}</p>
          <p className="text-xs uppercase tracking-wide text-white/40">Valor livre (à vontade)</p>
        </div>
        <div>
          <p className="text-5xl font-black text-[#C78340]">
            {moeda(estado === "resultado" && resultado ? resultado.valor : valorAtual)}
          </p>
          <p className="text-xs uppercase tracking-wide text-white/50">Valor a pagar</p>
        </div>
        <div>
          <p className="text-3xl font-black text-white">{precoKg > 0 ? moeda(precoKg) : "—"}</p>
          <p className="text-xs uppercase tracking-wide text-white/40">Valor por kg</p>
        </div>
      </div>
    </div>
  );
}
