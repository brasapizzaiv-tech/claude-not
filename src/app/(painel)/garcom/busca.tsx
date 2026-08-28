"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acharComanda } from "./actions";

// Busca rápida do garçom: digitar o número da comanda/cartão OU ler o QR do
// cupom / código de barras do cartão pela câmera do celular. Ao achar, abre o
// cardápio da mesa já com a comanda selecionada.
export function BuscaComanda() {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [scan, setScan] = useState(false);

  const abrir = useCallback(
    (valor: string) => {
      const v = (valor || "").trim();
      if (!v) return;
      setErro(null);
      start(async () => {
        const r = await acharComanda(v);
        if (r.ok) {
          router.push(`/garcom/mesa/${encodeURIComponent(r.mesa)}?comanda=${r.comandaId}`);
        } else {
          setErro("Comanda não encontrada. Confira o número.");
          setTimeout(() => setErro(null), 3500);
        }
      });
    },
    [router],
  );

  const onLido = useCallback(
    (v: string) => { setScan(false); setCodigo(v); abrir(v); },
    [abrir],
  );

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && abrir(codigo)}
          inputMode="numeric"
          placeholder="Nº da comanda / cartão"
          className="h-11 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          onClick={() => abrir(codigo)}
          disabled={proc || !codigo.trim()}
          className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {proc ? "..." : "Abrir"}
        </button>
        <button
          onClick={() => { setErro(null); setScan(true); }}
          title="Ler QR / código de barras"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-xl"
        >
          📷
        </button>
      </div>
      {erro && <p className="mb-2 px-1 text-sm text-red-400">{erro}</p>}
      {scan && (
        <Scanner onClose={() => setScan(false)} onLido={onLido} />
      )}
    </>
  );
}

function Scanner({ onClose, onLido }: { onClose: () => void; onLido: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [msg, setMsg] = useState("Aponte para o QR do cupom ou o código do cartão…");

  useEffect(() => {
    let cancelado = false;
    let jaLeu = false;
    // controls do ZXing (para parar a câmera ao sair)
    let controls: { stop: () => void } | null = null;

    (async () => {
      // ZXing: leitor de QR + código de barras que roda em qualquer navegador
      // (Android, iPhone/Safari). Carregado só quando abre a câmera.
      let BrowserMultiFormatReader;
      try {
        ({ BrowserMultiFormatReader } = await import("@zxing/browser"));
      } catch {
        setMsg("Não foi possível carregar o leitor. Digite o número.");
        return;
      }
      const video = videoRef.current;
      if (!video || cancelado) return;
      const reader = new BrowserMultiFormatReader();
      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (result && !jaLeu) {
              jaLeu = true;
              controls?.stop();
              onLido(String(result.getText()));
            }
          },
        );
      } catch {
        setMsg("Não foi possível abrir a câmera. Autorize o acesso ou digite o número.");
        return;
      }
      if (cancelado) controls.stop();
    })();

    return () => {
      cancelado = true;
      controls?.stop();
    };
  }, [onLido]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-zinc-100">
        <span className="font-bold">Ler comanda</span>
        <button onClick={onClose} className="text-2xl leading-none text-zinc-300">✕</button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
      </div>
      <p className="p-3 text-center text-sm text-zinc-300">{msg}</p>
    </div>
  );
}
