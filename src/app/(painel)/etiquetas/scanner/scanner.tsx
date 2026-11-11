"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dataBR } from "@/lib/format";
import { LeitorQr } from "@/components/leitor-qr";

type Resultado = {
  ok: boolean;
  erro?: string;
  numero?: number;
  produto?: string;
  validade?: string | null;
  status?: string;
};

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Leitor de etiquetas do painel: cada QR lido já dá baixa (usada ou descartada).
// A câmera é o leitor único do sistema (components/leitor-qr), que funciona no
// iPhone também; antes era o BarcodeDetector, que só existe no Chrome/Android.
export function Scanner() {
  const lidasRef = useRef<Set<string>>(new Set());
  const travadoRef = useRef(false);

  const [ligado, setLigado] = useState(false);
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

  async function processar(texto: string) {
    const id = texto.match(UUID)?.[1];
    if (!id) return;
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
      if (navigator.vibrate) navigator.vibrate(90);
    } else {
      beep(false);
    }
    setTimeout(() => {
      travadoRef.current = false;
    }, 1500);
  }

  const botoesModo = (escuro: boolean) => (
    <div className="flex gap-2">
      <button
        onClick={() => setModo("usada")}
        aria-pressed={modo === "usada"}
        className={`min-h-11 flex-1 rounded-controle text-sm font-semibold ${
          modo === "usada" ? (escuro ? "bg-emerald-600 text-white" : "bg-texto text-fundo") : escuro ? "bg-zinc-800 text-white" : "btn-secundario"
        }`}
      >
        Dar baixa (usada)
      </button>
      <button
        onClick={() => setModo("descartada")}
        aria-pressed={modo === "descartada"}
        className={`min-h-11 flex-1 rounded-controle text-sm font-semibold ${
          modo === "descartada" ? "bg-red-600 text-white" : escuro ? "bg-zinc-800 text-white" : "btn-secundario"
        }`}
      >
        Descartar
      </button>
    </div>
  );

  const textoUltima = !ultima
    ? null
    : ultima.ok
      ? `✓ #${ultima.numero} ${ultima.produto ?? ""}`
      : ultima.erro === "nao encontrada" ? "Etiqueta não encontrada" : "Não foi possível dar baixa";

  if (ligado) {
    return (
      <LeitorQr
        titulo="Leitor de etiquetas"
        aoLer={processar}
        fechar={() => setLigado(false)}
        aviso={textoUltima}
        mensagem="Aponte para o QR da etiqueta — a baixa é automática"
        acima={botoesModo(true)}
      >
        <p className="py-2 text-center text-sm text-zinc-300">{contagem} baixa(s) nesta sessão</p>
        {ultima?.ok && (
          <div className="rounded-controle bg-zinc-900 p-3 text-sm">
            <p className="font-semibold text-emerald-400">✓ Baixa registrada · #{ultima.numero}</p>
            <p className="mt-1 text-base font-bold">{ultima.produto}</p>
            <p className="text-zinc-400">
              {ultima.status === "descartada" ? "Descartada" : "Usada"}
              {ultima.validade ? ` · validade ${dataBR(ultima.validade)}` : ""}
            </p>
          </div>
        )}
      </LeitorQr>
    );
  }

  return (
    <div className="pagina max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Leitor de etiquetas</h1>
        <Link href="/etiquetas" className="text-sm text-texto-marca hover:underline">
          ← Voltar
        </Link>
      </div>

      <div className="mb-4">{botoesModo(false)}</div>

      <div className="cartao flex aspect-square items-center justify-center bg-black">
        <button onClick={() => setLigado(true)} className="btn-principal min-h-11 px-5 text-sm">
          Ligar câmera
        </button>
      </div>

      {contagem > 0 && (
        <p className="mt-3 text-sm text-texto-suave">{contagem} baixa(s) nesta sessão</p>
      )}

      <p className="mt-4 text-center text-xs text-texto-fraco">
        Aponte a câmera para o QR Code da etiqueta. A baixa é automática.
      </p>
    </div>
  );
}
