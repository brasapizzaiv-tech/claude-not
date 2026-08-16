"use client";

import { useRef, useState } from "react";

// Prova de conceito: lê a balança Urano POP-31 pela porta serial (USB) usando
// a WebSerial API do Chrome. Mostra os bytes crus para a gente decodificar o
// formato do peso. Não salva nada — é só um teste de hardware.

type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
};
type SerialPortLike = {
  open: (o: { baudRate: number; dataBits: number; stopBits: number; parity: string }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  close: () => Promise<void>;
};

const hex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
const ascii = (b: Uint8Array) =>
  [...b].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : "·")).join("");

export default function BalancaTeste() {
  const [baud, setBaud] = useState(9600);
  const [conectado, setConectado] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [ultimo, setUltimo] = useState<string>("—");
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const addLog = (s: string) => setLog((l) => [s, ...l].slice(0, 200));

  const suportado =
    typeof navigator !== "undefined" && "serial" in navigator;

  async function conectar() {
    try {
      const serial = (navigator as unknown as { serial: SerialLike }).serial;
      const port = await serial.requestPort();
      await port.open({ baudRate: baud, dataBits: 8, stopBits: 2, parity: "none" });
      portRef.current = port;
      setConectado(true);
      addLog(`✓ Conectado a ${baud} bps, 8-2-N. Pese um prato na balança...`);
      lerLoop(port);
    } catch (e) {
      addLog("❌ " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function lerLoop(port: SerialPortLike) {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          const a = ascii(value);
          addLog(`HEX: ${hex(value)}   TXT: ${a}`);
          const m = a.match(/\d+[.,]?\d*/g);
          if (m && m.length) setUltimo(m.join(" | "));
        }
      }
    } catch (e) {
      addLog("leitura parou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      reader.releaseLock();
    }
  }

  // Alguns protocolos só respondem quando a gente pede (envia ENQ 0x05).
  async function pedir(byte: number) {
    const port = portRef.current;
    if (!port?.writable) return addLog("sem canal de escrita");
    const w = port.writable.getWriter();
    await w.write(new Uint8Array([byte]));
    w.releaseLock();
    addLog(`→ enviei byte 0x${byte.toString(16)}`);
  }

  async function desconectar() {
    try {
      await readerRef.current?.cancel();
    } catch {}
    try {
      await portRef.current?.close();
    } catch {}
    setConectado(false);
    addLog("desconectado");
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Teste da balança (Urano POP-31)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Abra no <b>Chrome do PC da balança</b>. Conecte e pese um prato — vamos
        ver os dados chegando.
      </p>

      {!suportado && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Este navegador não tem WebSerial. Use o <b>Google Chrome</b> (ou Edge)
          no computador.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Velocidade</label>
          <select
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            disabled={conectado}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {[9600, 4800, 2400, 19200].map((b) => (
              <option key={b} value={b}>
                {b} bps
              </option>
            ))}
          </select>
        </div>
        {!conectado ? (
          <button
            onClick={conectar}
            disabled={!suportado}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Conectar balança
          </button>
        ) : (
          <>
            <button
              onClick={() => pedir(0x05)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Pedir peso (ENQ)
            </button>
            <button
              onClick={desconectar}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-red-600 dark:border-zinc-700"
            >
              Desconectar
            </button>
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">Números detectados (provável peso):</p>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{ultimo}</p>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs text-zinc-500">Dados crus (mais recente em cima):</p>
        <div className="h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 font-mono text-xs text-green-400 dark:border-zinc-800">
          {log.length === 0 ? (
            <span className="text-zinc-500">aguardando...</span>
          ) : (
            log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Se não aparecer nada ao pesar, tente “Pedir peso (ENQ)” ou troque a
        velocidade. Me mande o que aparecer em “Dados crus” que eu decodifico o
        formato.
      </p>
    </div>
  );
}
