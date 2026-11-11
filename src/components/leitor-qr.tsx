"use client";

import { Icone } from "@/components/icone";
import { useCallback, useEffect, useRef, useState } from "react";

// O leitor de câmera do sistema (VIS-15): tela cheia, câmera traseira principal,
// lanterna, troca de câmera e o plano B de tirar uma foto (foca de perto).
// Quem usa decide o que fazer com o texto lido (`aoLer`) e encaixa o resto:
// `acima` (ex.: Usada/Descartada), `acoes` (botões ao lado do "Tirar foto"),
// `children` (lista que rola) e `rodape` (botão fixo embaixo).
// Motor: ZXing (roda no Android e no iPhone/Safari), carregado só ao abrir.

// Prefere a câmera traseira principal (não a ultra-wide/tele) quando o aparelho tem várias.
function escolherCamera(devs: MediaDeviceInfo[]) {
  const tras = devs.filter((d) => /back|tras|rear|environment/i.test(d.label));
  const principal = tras.find((d) => !/ultra|wide|tele|0[.,]5|macro/i.test(d.label));
  return principal ?? tras[0] ?? devs[devs.length - 1] ?? null;
}

async function criarLeitor(formatos: "qr" | "todos", atraso?: number) {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
  const hints = new Map();
  // Só QR e "tentar mais forte": lê QR pequeno (16 mm) com mais facilidade.
  if (formatos === "qr") hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return { reader: new BrowserMultiFormatReader(hints, atraso ? { delayBetweenScanAttempts: atraso } : undefined), BrowserMultiFormatReader };
}

export function LeitorQr({
  titulo,
  aoLer,
  fechar,
  voltar,
  aviso,
  mensagem = "Aponte para o QR da etiqueta…",
  formatos = "qr",
  acima,
  acoes,
  rodape,
  children,
}: {
  titulo: string;
  /** Texto lido. O componente segura repetições do mesmo código por 3 s. */
  aoLer: (texto: string) => void;
  /** Botão "← Voltar" (ou passe `voltar` pra trocar por um link). */
  fechar?: () => void;
  voltar?: React.ReactNode;
  /** Mensagem curta sobre a câmera (ex.: "+ Queijo · nº 128"). */
  aviso?: string | null;
  /** Texto embaixo da câmera enquanto procura. */
  mensagem?: string;
  /** "todos" lê também código de barras (cartão da comanda). */
  formatos?: "qr" | "todos";
  acima?: React.ReactNode;
  acoes?: React.ReactNode;
  rodape?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [devs, setDevs] = useState<MediaDeviceInfo[]>([]);
  const [devId, setDevId] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const ultimoRef = useRef<{ t: string; em: number } | null>(null);
  // aoLer pode mudar a cada render de quem usa: guardar em ref evita reabrir a câmera.
  const aoLerRef = useRef(aoLer);
  useEffect(() => { aoLerRef.current = aoLer; }, [aoLer]);

  const lido = useCallback((texto: string) => {
    const agora = Date.now();
    if (ultimoRef.current && ultimoRef.current.t === texto && agora - ultimoRef.current.em < 3000) return;
    ultimoRef.current = { t: texto, em: agora };
    aoLerRef.current(texto);
  }, []);

  useEffect(() => {
    let cancelado = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      let leitor;
      try {
        leitor = await criarLeitor(formatos, 120);
      } catch {
        setErro("Não foi possível carregar o leitor.");
        return;
      }
      const video = videoRef.current;
      if (!video || cancelado) return;
      // Resolução alta: no iPhone o padrão vem baixo e o QR fica borrado.
      const constraints: MediaStreamConstraints = {
        video: {
          ...(devId ? { deviceId: { exact: devId } } : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      try {
        controls = await leitor.reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) lido(String(result.getText()));
        });
      } catch {
        setErro("Não foi possível abrir a câmera. Autorize o acesso nas configurações do navegador.");
        return;
      }
      if (cancelado) { controls.stop(); return; }
      // Depois de abrir: lista as câmeras (os nomes só aparecem após a permissão),
      // tenta foco contínuo e vê se tem lanterna.
      try {
        const lista = await leitor.BrowserMultiFormatReader.listVideoInputDevices();
        setDevs(lista);
        if (!devId) { const pref = escolherCamera(lista); if (pref && lista.length > 1) setDevId(pref.deviceId); }
      } catch { /* sem lista de câmeras */ }
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      if (track) {
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }); } catch { /* sem foco contínuo */ }
        const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
        setTorchOk(!!caps.torch);
      }
    })();
    return () => { cancelado = true; controls?.stop(); trackRef.current = null; };
  }, [lido, devId, formatos]);

  async function alternarTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setAvisoFoto("Lanterna não disponível neste aparelho."); }
  }
  function trocarCamera() {
    if (devs.length < 2) return;
    const i = devs.findIndex((d) => d.deviceId === devId);
    setDevId(devs[(i + 1) % devs.length].deviceId);
    setTorch(false);
  }
  // Plano B: foto pela câmera nativa (foca de perto, alta resolução) e lê o código da imagem.
  async function lerFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendoFoto(true);
    setAvisoFoto(null);
    const url = URL.createObjectURL(arquivo);
    try {
      const { reader } = await criarLeitor(formatos);
      // Foto de celular é grande demais pro leitor: reduz pra ~1400px antes de decodificar.
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("imagem")); img.src = url; });
      const esc = Math.min(1, 1400 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      const r = await reader.decodeFromCanvas(cv);
      ultimoRef.current = null;
      lido(String(r.getText()));
    } catch {
      setAvisoFoto("Não achei o código na foto — tenta mais perto e com luz.");
    } finally {
      setLendoFoto(false);
      URL.revokeObjectURL(url);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  }

  const textoAviso = aviso ?? avisoFoto;
  return (
    <div className="area-segura fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        {voltar ?? (
          <button onClick={fechar} className="min-h-11 text-sm text-zinc-300">← Voltar</button>
        )}
        <span className="text-sm font-semibold">{titulo}</span>
      </div>
      {acima && <div className="px-3 pb-2">{acima}</div>}
      <div className="relative h-[42vh] min-h-56 shrink-0 overflow-hidden bg-zinc-900">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 rounded-cartao border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        <div className="absolute right-2 top-2 flex gap-1.5">
          {torchOk && (
            <button onClick={alternarTorch} aria-pressed={torch} className={`min-h-11 rounded-full px-3 text-xs font-semibold ${torch ? "bg-amber-400 text-black" : "bg-black/60"}`}>
              <Icone nome="lanterna" tamanho={14} titulo="Lanterna" />
            </button>
          )}
          {devs.length > 1 && (
            <button onClick={trocarCamera} className="min-h-11 rounded-full bg-black/60 px-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1"><Icone nome="trocarcamera" tamanho={13} /> câmera</span>
            </button>
          )}
        </div>
        {textoAviso && (
          <div role="status" className="absolute inset-x-0 bottom-2 text-center">
            <span className="rounded-full bg-black/70 px-3 py-1 text-sm font-semibold">{textoAviso}</span>
          </div>
        )}
      </div>
      <p role={erro ? "alert" : undefined} className="py-1 text-center text-xs text-zinc-400">
        {erro ?? <>{mensagem} · segure a uns <b>15–20 cm</b></>}
      </p>
      <div className="flex gap-2 px-3 pb-2">
        <button onClick={() => fotoRef.current?.click()} disabled={lendoFoto} className="min-h-11 flex-1 rounded-controle bg-zinc-800 text-sm font-semibold disabled:opacity-50">
          {lendoFoto ? "Lendo a foto…" : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="camera" tamanho={14} /> Tirar foto do código</span>}
        </button>
        {acoes}
        <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => lerFoto(e.target.files?.[0])} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">{children}</div>
      {rodape && <div className="border-t border-zinc-800 p-3">{rodape}</div>}
    </div>
  );
}
