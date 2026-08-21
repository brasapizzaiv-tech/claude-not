"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- WebSerial não tem tipos no TS padrão */

import { useRef, useState } from "react";
import { criarComandaBuffet } from "../actions";

// Leitura da balança Urano POP-31 via WebSerial (Chrome no PC, cabo USB).
// Mostra o dado bruto que chega + o peso interpretado, com ajustes p/ calibrar.
export function BalancaLeitor({ taraPadrao }: { taraPadrao: number }) {
  const [conectado, setConectado] = useState(false);
  const [raw, setRaw] = useState("");
  const [bytes, setBytes] = useState(0);
  const [rawNum, setRawNum] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const [baud, setBaud] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [stopBits, setStopBits] = useState(1);
  const [parity, setParity] = useState<"none" | "even" | "odd">("none");
  const [unidade, setUnidade] = useState<"kg" | "g">("kg");
  const [casas, setCasas] = useState(3); // p/ interpretar "1234" como 1.234 kg quando em kg sem ponto

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const peso =
    rawNum == null ? null : unidade === "g" ? rawNum / 1000 : rawNum;

  async function conectar() {
    setErro("");
    const serial = (navigator as any).serial;
    if (!serial) {
      setErro("Este navegador não tem WebSerial. Use o Google Chrome no PC (não funciona no celular).");
      return;
    }
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: baud, dataBits, stopBits, parity, flowControl: "none" });
      try {
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      } catch {
        /* alguns cabos não suportam; ignora */
      }
      portRef.current = port;
      setConectado(true);
      setBytes(0);
      setRaw("");
      lerLoop(port);
      // A POP-31 é computadora: só manda o peso quando recebe ENQ (0x05).
      // Então "pedimos" o peso a cada 500ms.
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        enviar([0x05], "ENQ").catch(() => {});
      }, 500);
    } catch (e: any) {
      setErro("Não conectou: " + (e?.message || String(e)));
    }
  }

  // Envia bytes para a balança (algumas só mandam o peso após um comando).
  async function enviar(arr: number[], label: string) {
    setErro("");
    try {
      const writer = portRef.current.writable.getWriter();
      await writer.write(new Uint8Array(arr));
      writer.releaseLock();
    } catch (e: any) {
      setErro(`Falha ao enviar ${label}: ` + (e?.message || String(e)));
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
        setBytes((b) => b + (value?.length ?? 0));
        buf += decoder.decode(value, { stream: true });
        if (buf.length > 800) buf = buf.slice(-800);
        setRaw(buf);
        // Balança computadora (POP-31) manda um "rótulo" com vários campos.
        // Pegamos o PESO L (peso líquido) especificamente — não o último número
        // (que seria o TOTAL R$). Se não achar, cai no modo genérico.
        const pesoL = [...buf.matchAll(/PESO\s*L[:\s]*(-?\d+[.,]\d+)/gi)];
        if (pesoL.length) {
          setRawNum(parseFloat(pesoL[pesoL.length - 1][1].replace(",", ".")));
        } else {
          const nums = buf.match(/-?\d+[.,]\d+|-?\d+/g);
          if (nums && nums.length) {
            const ultimo = nums[nums.length - 1];
            let n = parseFloat(ultimo.replace(",", "."));
            // número inteiro sem vírgula? interpreta pelas casas (ex.: 1234 -> 1.234)
            if (!/[.,]/.test(ultimo) && casas > 0) n = n / Math.pow(10, casas);
            setRawNum(n);
          }
        }
      }
    } catch {
      /* leitura cancelada ao desconectar */
    }
  }

  async function desconectar() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await readerRef.current?.cancel();
    } catch {}
    try {
      readerRef.current?.releaseLock();
    } catch {}
    try {
      await portRef.current?.close();
    } catch {}
    readerRef.current = null;
    portRef.current = null;
    setConectado(false);
  }

  const selCls =
    "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200">⚖️ Balança (leitura automática)</p>
        {conectado ? (
          <button
            onClick={desconectar}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            Desconectar
          </button>
        ) : (
          <button
            onClick={conectar}
            className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Conectar balança
          </button>
        )}
      </div>

      {erro && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/30">{erro}</p>
      )}

      {/* Peso lido */}
      <div className="rounded-xl bg-zinc-50 p-4 text-center dark:bg-zinc-900">
        <p className="text-[11px] uppercase text-zinc-400">Peso lido</p>
        <p className="text-4xl font-black text-zinc-900 dark:text-zinc-50">
          {peso == null ? "—" : peso.toFixed(3)} <span className="text-lg">kg</span>
        </p>
      </div>

      {/* Ajustes de leitura */}
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500">Ajustes da porta / interpretação</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500">Velocidade</label>
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} className={selCls} disabled={conectado}>
            {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <label className="text-xs text-zinc-500">Dados</label>
          <select value={dataBits} onChange={(e) => setDataBits(Number(e.target.value))} className={selCls} disabled={conectado}>
            <option value={8}>8</option>
            <option value={7}>7</option>
          </select>
          <label className="text-xs text-zinc-500">Parada</label>
          <select value={stopBits} onChange={(e) => setStopBits(Number(e.target.value))} className={selCls} disabled={conectado}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
          <label className="text-xs text-zinc-500">Paridade</label>
          <select value={parity} onChange={(e) => setParity(e.target.value as any)} className={selCls} disabled={conectado}>
            <option value="none">nenhuma</option>
            <option value="even">par</option>
            <option value="odd">ímpar</option>
          </select>
          <label className="text-xs text-zinc-500">Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value as any)} className={selCls}>
            <option value="kg">kg</option>
            <option value="g">gramas</option>
          </select>
          <label className="text-xs text-zinc-500">Casas (nº sem vírgula)</label>
          <select value={casas} onChange={(e) => setCasas(Number(e.target.value))} className={selCls}>
            {[0, 1, 2, 3].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </details>

      {/* Dado bruto + diagnóstico */}
      {conectado && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] uppercase text-zinc-400">Dado bruto da balança</p>
            <p className={`text-[11px] font-medium ${bytes > 0 ? "text-green-600" : "text-amber-600"}`}>
              {bytes} bytes recebidos
            </p>
          </div>
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-2 text-[11px] text-green-400">
            {raw || "aguardando dados... (coloque um prato na balança)"}
          </pre>

          {bytes === 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30">
              <p className="mb-2 font-medium">
                Conectou, mas a balança não está enviando. Tente “cutucar” (a POP-31 às vezes só manda o peso quando recebe um comando):
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => enviar([0x05], "ENQ")} className="rounded bg-white px-2 py-1 font-medium text-amber-800 dark:bg-zinc-900 dark:text-amber-300">Enviar ENQ</button>
                <button onClick={() => enviar([0x0d], "CR")} className="rounded bg-white px-2 py-1 font-medium text-amber-800 dark:bg-zinc-900 dark:text-amber-300">Enviar Enter</button>
                <button onClick={() => enviar([0x50, 0x0d], "P")} className="rounded bg-white px-2 py-1 font-medium text-amber-800 dark:bg-zinc-900 dark:text-amber-300">Enviar P</button>
                <button onClick={() => enviar([0x57, 0x0d], "W")} className="rounded bg-white px-2 py-1 font-medium text-amber-800 dark:bg-zinc-900 dark:text-amber-300">Enviar W</button>
                <button onClick={() => enviar([0x11], "DC1")} className="rounded bg-white px-2 py-1 font-medium text-amber-800 dark:bg-zinc-900 dark:text-amber-300">Enviar DC1</button>
              </div>
              <p className="mt-2">
                Se nada mudar em nenhum, provavelmente a balança está com a **transmissão contínua desligada** (config da própria balança) ou a **velocidade** está diferente — tente 4800 ou 2400 nos ajustes (desconecte e reconecte).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Gerar comanda com o peso lido */}
      <form action={criarComandaBuffet} className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <input type="hidden" name="mesa" value="Balança" />
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Peso (kg)</label>
          <input
            key={peso ?? "vazio"}
            name="peso"
            inputMode="decimal"
            defaultValue={peso != null ? peso.toFixed(3).replace(".", ",") : ""}
            placeholder="0,000"
            className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tara (kg)</label>
          <input
            name="tara"
            inputMode="decimal"
            defaultValue={taraPadrao ? String(taraPadrao).replace(".", ",") : ""}
            placeholder="0,000"
            className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Gerar comanda
        </button>
      </form>
      <p className="text-[11px] text-zinc-400">
        Dica: o campo do peso já vem preenchido com a leitura; se precisar, dá pra corrigir na mão antes de gerar.
      </p>
    </div>
  );
}
