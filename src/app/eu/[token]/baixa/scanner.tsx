"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { consultarEtiquetaColab, consultarEtiquetaPorNumeroColab, darBaixaLoteColab } from "../etiqueta-actions";

type Item = { id: string; produto: string; numero: number };
type Consulta = { ok: true; id: string; numero: number; produto: string; status: string } | { ok: false; mensagem: string };

// Prefere a câmera traseira principal (não a ultra-wide/tele) quando o aparelho tem várias.
function escolherCamera(devs: MediaDeviceInfo[]) {
  const tras = devs.filter((d) => /back|tras|rear|environment/i.test(d.label));
  const principal = tras.find((d) => !/ultra|wide|tele|0[.,]5|macro/i.test(d.label));
  return principal ?? tras[0] ?? devs[devs.length - 1] ?? null;
}

export function BaixaScanner({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"usada" | "descartada">("usada");
  const [msg, setMsg] = useState("Aponte para o QR da etiqueta…");
  const [flash, setFlash] = useState<string | null>(null);
  const [lista, setLista] = useState<Item[]>([]);
  const [proc, start] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);
  const [devs, setDevs] = useState<MediaDeviceInfo[]>([]);
  const [devId, setDevId] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);
  const [numero, setNumero] = useState("");
  const [manual, setManual] = useState(false);

  const listaRef = useRef<Item[]>([]);
  useEffect(() => { listaRef.current = lista; }, [lista]);
  const ocupadoRef = useRef(false);
  const ultimoRef = useRef<{ id: string; t: number } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  function aviso(txt: string) {
    setFlash(txt);
    setTimeout(() => setFlash(null), 1500);
  }

  const tratar = useCallback((r: Consulta) => {
    if (r.ok && r.status === "ativa") {
      setLista((l) => (l.some((x) => x.id === r.id) ? l : [{ id: r.id, produto: r.produto, numero: r.numero }, ...l]));
      aviso(`+ ${r.produto}`);
      if (navigator.vibrate) navigator.vibrate(90);
    } else if (r.ok) {
      aviso(`Nº ${r.numero} já estava "${r.status}"`);
    } else {
      aviso(r.mensagem || "Não encontrada");
    }
  }, []);

  const aoLer = useCallback((valor: string) => {
    const id = valor.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!id) return;
    const agora = new Date().getTime();
    if (ocupadoRef.current) return;
    if (ultimoRef.current && ultimoRef.current.id === id && agora - ultimoRef.current.t < 3000) return;
    ultimoRef.current = { id, t: agora };
    if (listaRef.current.some((x) => x.id === id)) { aviso("Já está na lista"); return; }
    ocupadoRef.current = true;
    (async () => {
      tratar(await consultarEtiquetaColab(token, id));
      setTimeout(() => { ocupadoRef.current = false; }, 600);
    })();
  }, [token, tratar]);

  useEffect(() => {
    let cancelado = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      let BrowserMultiFormatReader, BarcodeFormat, DecodeHintType;
      try {
        ({ BrowserMultiFormatReader } = await import("@zxing/browser"));
        ({ BarcodeFormat, DecodeHintType } = await import("@zxing/library"));
      } catch {
        setMsg("Não foi possível carregar o leitor.");
        return;
      }
      const video = videoRef.current;
      if (!video || cancelado) return;
      // Só QR e "tentar mais forte": lê QR pequeno (16 mm) com mais facilidade.
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      // Resolução alta: no iPhone o padrão vem baixo e o QR fica borrado.
      const constraints: MediaStreamConstraints = {
        video: {
          ...(devId ? { deviceId: { exact: devId } } : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      try {
        controls = await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) aoLer(String(result.getText()));
        });
      } catch {
        setMsg("Não foi possível abrir a câmera. Autorize o acesso nas configurações do navegador.");
        return;
      }
      if (cancelado) { controls.stop(); return; }
      // Depois de abrir: lista as câmeras (os nomes só aparecem após a permissão),
      // tenta foco contínuo e vê se tem lanterna.
      try {
        const lista = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevs(lista);
        if (!devId) { const pref = escolherCamera(lista); if (pref && lista.length > 1) setDevId(pref.deviceId); }
      } catch {}
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      if (track) {
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }); } catch {}
        const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
        setTorchOk(!!caps.torch);
      }
    })();
    return () => { cancelado = true; controls?.stop(); trackRef.current = null; };
  }, [aoLer, devId]);

  async function alternarTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { aviso("Lanterna não disponível"); }
  }
  function trocarCamera() {
    if (devs.length < 2) return;
    const i = devs.findIndex((d) => d.deviceId === devId);
    setDevId(devs[(i + 1) % devs.length].deviceId);
    setTorch(false);
  }
  function adicionarPorNumero() {
    const n = Number(numero.replace(/\D/g, ""));
    if (!n) return;
    start(async () => {
      tratar(await consultarEtiquetaPorNumeroColab(token, n));
      setNumero("");
    });
  }

  const remover = (id: string) => setLista((l) => l.filter((x) => x.id !== id));

  function darBaixa() {
    if (!lista.length) return;
    const ids = lista.map((x) => x.id);
    start(async () => {
      const r = await darBaixaLoteColab(token, ids, status);
      if (r.ok) {
        setFeito(`✓ ${r.quantidade} etiqueta(s) marcada(s) como ${status}!`);
        setLista([]);
        setTimeout(() => setFeito(null), 3000);
      } else {
        aviso(r.mensagem || "Erro");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <Link href={`/eu/${token}`} className="text-sm text-zinc-300">← Voltar</Link>
        <span className="text-sm font-semibold">Dar baixa em lote</span>
      </div>

      <div className="flex gap-2 px-3 pb-2">
        <button onClick={() => setStatus("usada")} className={`flex-1 rounded-lg py-2 text-sm font-bold ${status === "usada" ? "bg-emerald-600" : "bg-zinc-800"}`}>Usada</button>
        <button onClick={() => setStatus("descartada")} className={`flex-1 rounded-lg py-2 text-sm font-bold ${status === "descartada" ? "bg-red-600" : "bg-zinc-800"}`}>Descartada</button>
      </div>

      {/* Câmera */}
      <div className="relative h-[42vh] min-h-56 shrink-0 overflow-hidden bg-zinc-900">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        <div className="absolute right-2 top-2 flex gap-1.5">
          {torchOk && (
            <button onClick={alternarTorch} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${torch ? "bg-amber-400 text-black" : "bg-black/60"}`}>🔦</button>
          )}
          {devs.length > 1 && (
            <button onClick={trocarCamera} className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold">🔄 câmera</button>
          )}
        </div>
        {flash && (
          <div className="absolute inset-x-0 bottom-2 text-center">
            <span className="rounded-full bg-black/70 px-3 py-1 text-sm font-semibold">{flash}</span>
          </div>
        )}
      </div>
      <p className="py-1 text-center text-xs text-zinc-400">
        {lista.length === 0 ? msg : "Continue lendo as etiquetas…"} ·{" "}
        <button onClick={() => setManual((v) => !v)} className="underline">digitar o nº</button>
      </p>
      {manual && (
        <div className="flex gap-2 px-3 pb-2">
          <input
            inputMode="numeric"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") adicionarPorNumero(); }}
            placeholder="Nº da etiqueta"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
          />
          <button onClick={adicionarPorNumero} disabled={proc || !numero.trim()} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold disabled:opacity-50">Adicionar</button>
        </div>
      )}

      {/* Lista acumulada */}
      <div className="flex-1 overflow-y-auto px-3">
        {lista.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">Nenhuma etiqueta lida ainda.</p>
        ) : (
          <ul className="space-y-1.5 py-2">
            {lista.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{it.produto} <span className="text-zinc-500">· Nº {it.numero}</span></span>
                <button onClick={() => remover(it.id)} className="shrink-0 text-zinc-400">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rodapé: dar baixa */}
      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={darBaixa}
          disabled={proc || lista.length === 0}
          className={`w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-40 ${status === "descartada" ? "bg-red-600" : "bg-emerald-600"}`}
        >
          {proc ? "Dando baixa..." : `✓ Dar baixa em ${lista.length} (${status})`}
        </button>
      </div>

      {feito && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl bg-zinc-800 px-8 py-6 text-center">
            <div className="mb-2 text-4xl">✅</div>
            <p className="font-semibold">{feito}</p>
          </div>
        </div>
      )}
    </div>
  );
}
