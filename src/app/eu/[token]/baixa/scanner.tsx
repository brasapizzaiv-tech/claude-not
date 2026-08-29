"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { darBaixaColab } from "../etiqueta-actions";

type Resultado = { ok: boolean; texto: string };

export function BaixaScanner({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"usada" | "descartada">("usada");
  const [msg, setMsg] = useState("Aponte para o QR da etiqueta…");
  const [ultimo, setUltimo] = useState<Resultado | null>(null);
  const [total, setTotal] = useState(0);

  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const processandoRef = useRef(false);
  const ultimoIdRef = useRef<{ id: string; t: number } | null>(null);

  const aoLer = useCallback((valor: string) => {
    const id = valor.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!id) return;
    const agora = new Date().getTime();
    // evita ler a mesma etiqueta repetidamente
    if (processandoRef.current) return;
    if (ultimoIdRef.current && ultimoIdRef.current.id === id && agora - ultimoIdRef.current.t < 4000) return;
    ultimoIdRef.current = { id, t: agora };
    processandoRef.current = true;
    (async () => {
      const r = await darBaixaColab(token, id, statusRef.current);
      if (r.ok) {
        setUltimo({ ok: true, texto: `✓ ${r.produto} — ${r.status}` });
        setTotal((n) => n + 1);
        if (navigator.vibrate) navigator.vibrate(120);
      } else {
        setUltimo({ ok: false, texto: r.mensagem || "Erro" });
      }
      setTimeout(() => { processandoRef.current = false; }, 800);
    })();
  }, [token]);

  useEffect(() => {
    let cancelado = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      let BrowserMultiFormatReader;
      try {
        ({ BrowserMultiFormatReader } = await import("@zxing/browser"));
      } catch {
        setMsg("Não foi possível carregar o leitor.");
        return;
      }
      const video = videoRef.current;
      if (!video || cancelado) return;
      const reader = new BrowserMultiFormatReader();
      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => { if (result) aoLer(String(result.getText())); },
        );
      } catch {
        setMsg("Não foi possível abrir a câmera. Autorize o acesso.");
        return;
      }
      if (cancelado) controls.stop();
    })();
    return () => { cancelado = true; controls?.stop(); };
  }, [aoLer]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <Link href={`/eu/${token}`} className="text-sm text-zinc-300">← Voltar</Link>
        <span className="text-sm font-semibold">Dar baixa {total > 0 ? `(${total})` : ""}</span>
      </div>

      <div className="flex gap-2 px-3 pb-2">
        <button onClick={() => setStatus("usada")} className={`flex-1 rounded-lg py-2 text-sm font-bold ${status === "usada" ? "bg-emerald-600" : "bg-zinc-800"}`}>Usada</button>
        <button onClick={() => setStatus("descartada")} className={`flex-1 rounded-lg py-2 text-sm font-bold ${status === "descartada" ? "bg-red-600" : "bg-zinc-800"}`}>Descartada</button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-52 w-52 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
      </div>

      <div className="p-3 text-center">
        {ultimo ? (
          <p className={`text-base font-bold ${ultimo.ok ? "text-emerald-400" : "text-amber-400"}`}>{ultimo.texto}</p>
        ) : (
          <p className="text-sm text-zinc-300">{msg}</p>
        )}
        <p className="mt-1 text-xs text-zinc-500">Marcando como: <b>{status}</b>. Aponte para a próxima etiqueta.</p>
      </div>
    </div>
  );
}
