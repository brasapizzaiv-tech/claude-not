"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dataBR } from "@/lib/format";

type Resultado = {
  ok: boolean;
  erro?: string;
  numero?: number;
  produto?: string;
  validade?: string | null;
  status?: string;
};

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lidasRef = useRef<Set<string>>(new Set());
  const travadoRef = useRef(false);

  const [ligado, setLigado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"usada" | "descartada">("usada");
  const [ultima, setUltima] = useState<Resultado | null>(null);
  const [contagem, setContagem] = useState(0);
  const modoRef = useRef(modo);
  useEffect(() => { modoRef.current = modo; }, [modo]);

  function beep(ok: boolean) {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 300;
      o.start();
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o.stop(ctx.currentTime + 0.16);
    } catch {
      /* sem som, tudo bem */
    }
  }

  async function processar(id: string) {
    if (travadoRef.current) return;
    if (lidasRef.current.has(id)) return;
    travadoRef.current = true;
    lidasRef.current.add(id);

    const supabase = createClient();
    const { data } = await supabase.rpc("etiqueta_baixa_scan", {
      p_id: id,
      p_status: modoRef.current,
    });
    const res = (data as Resultado) ?? { ok: false, erro: "falha" };
    setUltima(res);
    if (res.ok) {
      setContagem((c) => c + 1);
      beep(true);
    } else {
      beep(false);
    }
    setTimeout(() => {
      travadoRef.current = false;
    }, 1500);
  }

  async function ligar() {
    setErro(null);
    const BD = (window as unknown as { BarcodeDetector?: unknown })
      .BarcodeDetector;
    if (!BD) {
      setErro(
        "Este aparelho não suporta leitura de QR pela página. Use a câmera do aparelho para escanear a etiqueta e toque em 'Dar baixa' na tela que abrir.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLigado(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (BD as any)({ formats: ["qr_code"] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              const raw = String(codes[0].rawValue || "");
              const m = raw.match(UUID);
              if (m) await processar(m[1]);
            }
          }
        } catch {
          /* ignora frame ruim */
        }
        if (streamRef.current) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setErro("Não foi possível acessar a câmera. Verifique a permissão.");
    }
  }

  function desligar() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLigado(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Leitor de etiquetas
        </h1>
        <Link href="/etiquetas" className="text-sm text-orange-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      {/* Modo */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setModo("usada")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
            modo === "usada"
              ? "bg-green-600 text-white"
              : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          }`}
        >
          Dar baixa (usada)
        </button>
        <button
          onClick={() => setModo("descartada")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
            modo === "descartada"
              ? "bg-red-600 text-white"
              : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          }`}
        >
          Descartar
        </button>
      </div>

      {/* Câmera */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-black dark:border-zinc-800">
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-square w-full object-cover"
        />
        {!ligado && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={ligar}
              className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
            >
              Ligar câmera
            </button>
          </div>
        )}
        {ligado && (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
        )}
      </div>

      {erro && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {erro}
        </p>
      )}

      {ligado && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            {contagem} baixa(s) nesta sessão
          </span>
          <button onClick={desligar} className="text-sm text-zinc-400 hover:text-red-600">
            Desligar câmera
          </button>
        </div>
      )}

      {/* Última leitura */}
      {ultima && (
        <div
          className={`mt-4 rounded-2xl p-4 ${
            ultima.ok
              ? "bg-green-50 dark:bg-green-950"
              : "bg-red-50 dark:bg-red-950"
          }`}
        >
          {ultima.ok ? (
            <>
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                ✓ Baixa registrada · #{ultima.numero}
              </p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {ultima.produto}
              </p>
              <p className="text-sm text-zinc-500">
                {ultima.status === "descartada" ? "Descartada" : "Usada"}
                {ultima.validade ? ` · validade ${dataBR(ultima.validade)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {ultima.erro === "nao encontrada"
                ? "Etiqueta não encontrada."
                : "Não foi possível dar baixa."}
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-zinc-400">
        Aponte a câmera para o QR Code da etiqueta. A baixa é automática.
      </p>
    </div>
  );
}
