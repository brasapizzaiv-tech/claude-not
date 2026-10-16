"use client";

// "Avisos no celular" do app Motelli Equipe (etapa 2, 15/10/2026). Só aparece
// dentro do app nativo: no navegador (link /eu) não tem como receber push.
//
// A página vem do site, não do app, então fala com o plugin do Firebase pela
// ponte do Capacitor (nativePromise), como o GPS do entregador faz. No Android
// a ponte às vezes não é injetada na página: a gente carrega
// /app/capacitor-native-bridge.js (mesma cópia que o entregador usa).
import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import { registrarPushColab } from "./actions";

type Cap = { nativePromise?: (plugin: string, metodo: string, opts?: unknown) => Promise<unknown>; getPlatform?: () => string };
const P = "FirebaseMessaging";
export const CHAVE_PUSH = "motelli_push";

function dentroDoApp() {
  const w = window as unknown as { Capacitor?: unknown; androidBridge?: unknown; webkit?: { messageHandlers?: { bridge?: unknown } } };
  return !!(w.Capacitor || w.androidBridge || w.webkit?.messageHandlers?.bridge);
}
function plataforma(): "android" | "ios" {
  const w = window as unknown as { androidBridge?: unknown };
  return w.androidBridge ? "android" : "ios";
}
async function ponte(): Promise<Cap | null> {
  const w = window as unknown as { Capacitor?: Cap };
  if (w.Capacitor?.nativePromise) return w.Capacitor;
  if (!document.querySelector("script[data-ponte-capacitor]")) {
    await new Promise<void>((ok) => {
      const s = document.createElement("script");
      s.src = "/app/capacitor-native-bridge.js";
      s.dataset.ponteCapacitor = "1";
      s.onload = () => ok();
      s.onerror = () => ok();
      document.head.appendChild(s);
    });
  }
  return (window as unknown as { Capacitor?: Cap }).Capacitor?.nativePromise ? (window as unknown as { Capacitor: Cap }).Capacitor : null;
}

export function AvisosCelular({ token }: { token: string }) {
  const [estado, setEstado] = useState<"" | "pedir" | "ligado" | "negado" | "erro">("");
  const [proc, setProc] = useState(false);

  async function registrar(cap: Cap) {
    const r = (await cap.nativePromise!(P, "getToken", {})) as { token?: string };
    if (!r?.token) throw new Error("sem token");
    const g = await registrarPushColab(token, r.token, plataforma());
    if (!g.ok) throw new Error("não registrou");
    try { localStorage.setItem(CHAVE_PUSH, r.token); } catch { /* sem storage */ }
  }

  useEffect(() => {
    if (!dentroDoApp()) return;
    let vivo = true;
    (async () => {
      try {
        const cap = await ponte();
        if (!cap || !vivo) return;
        const p = (await cap.nativePromise!(P, "checkPermissions", {})) as { receive?: string };
        if (!vivo) return;
        if (p?.receive === "granted") { await registrar(cap); if (vivo) setEstado("ligado"); }
        else if (p?.receive === "denied") setEstado("negado");
        else setEstado("pedir");
      } catch {
        // App antigo, sem o plugin: fica quieto (a atualização traz).
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function ativar() {
    setProc(true);
    try {
      const cap = await ponte();
      if (!cap) throw new Error("sem ponte");
      const p = (await cap.nativePromise!(P, "requestPermissions", {})) as { receive?: string };
      if (p?.receive !== "granted") { setEstado("negado"); return; }
      await registrar(cap);
      setEstado("ligado");
    } catch {
      setEstado("erro");
    } finally {
      setProc(false);
    }
  }

  if (estado === "pedir" || estado === "erro") {
    return (
      <div className="mb-3 cartao bg-superficie-suave p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-texto"><Icone nome="campainha" tamanho={15} /> Avisos no celular</p>
        <p className="mt-1 text-xs text-texto-suave">Receba lembretes, resposta de folga, pedidos pra conferir e o pagamento da semana, mesmo com o app fechado.</p>
        <button type="button" onClick={ativar} disabled={proc} className="mt-2 w-full rounded-cartao bg-texto py-2.5 text-sm font-semibold text-fundo disabled:opacity-50">
          {proc ? "Ativando…" : "Ativar avisos"}
        </button>
        {estado === "erro" && <p className="mt-1 text-xs text-red-600">Não consegui ativar agora. Tente de novo daqui a pouco.</p>}
      </div>
    );
  }
  if (estado === "negado") {
    return <p className="mb-3 text-center text-xs text-texto-fraco">Avisos desligados. Pra ligar: Configurações do celular → Apps → Motelli Equipe → Notificações.</p>;
  }
  return null;
}
