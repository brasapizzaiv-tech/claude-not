"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { conectarWhatsappMeta } from "../actions";

// Botão "Conectar WhatsApp": cadastro incorporado da Meta no modo coexistência
// (featureType whatsapp_business_app_onboarding). O número continua no
// WhatsApp Business do celular e passa a valer também pro sistema. A Meta
// devolve o código pelo FB.login e os IDs (WABA + número) por postMessage;
// quando chegam os dois, o servidor grava (conectarWhatsappMeta).
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "2564086317384633";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_WPP_CONFIG_ID || "1634535068110961";

type FB = {
  init: (o: Record<string, unknown>) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>) => void;
};
declare global { interface Window { FB?: FB; fbAsyncInit?: () => void } }

export type ContaWpp = { telefone: string | null; nome: string | null; conectadoEm: string } | null;

export function ConectarWhatsapp({ conta }: { conta: ContaWpp }) {
  const [pronto, setPronto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [proc, start] = useTransition();
  const codigo = useRef<string | null | undefined>(undefined); // undefined = ainda não veio
  const ids = useRef<{ wabaId: string; phoneId: string } | null>(null);

  useEffect(() => {
    if (window.FB) { setPronto(true); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
      setPronto(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk"; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/pt_BR/sdk.js";
      document.body.appendChild(s);
    }
  }, []);

  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      if (!ev.origin.endsWith("facebook.com")) return;
      let d: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string; error_message?: string } };
      try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch { return; }
      if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (d.event?.startsWith("FINISH") && d.data?.waba_id && d.data?.phone_number_id) {
        ids.current = { wabaId: d.data.waba_id, phoneId: d.data.phone_number_id };
        talvezGravar();
      } else if (d.event === "CANCEL") {
        setMsg({ ok: false, texto: `Conexão interrompida${d.data?.current_step ? ` (na etapa ${d.data.current_step})` : ""}. Pode tentar de novo.` });
      } else if (d.event === "ERROR") {
        setMsg({ ok: false, texto: `A Meta deu erro: ${d.data?.error_message ?? "sem detalhe"}` });
      }
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function talvezGravar() {
    if (!ids.current || codigo.current === undefined) return;
    const dados = { code: codigo.current, ...ids.current };
    ids.current = null; codigo.current = undefined;
    start(async () => {
      const r = await conectarWhatsappMeta(dados);
      if (!r.ok) { setMsg({ ok: false, texto: r.mensagem }); return; }
      setMsg({
        ok: true,
        texto: `Conectado: ${r.nome ?? "WhatsApp"} ${r.telefone ?? ""}. Faça um teste de envio abaixo.${r.avisoWebhook ? ` (Aviso: webhooks não ligaram — ${r.avisoWebhook})` : ""}`,
      });
    });
  }

  function conectar() {
    setMsg(null);
    codigo.current = undefined; ids.current = null;
    window.FB?.login((resp) => {
      codigo.current = resp.authResponse?.code ?? null;
      if (!resp.authResponse) { setMsg({ ok: false, texto: "A janela da Meta foi fechada antes de terminar." }); return; }
      talvezGravar();
    }, {
      config_id: CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  }

  const quando = conta ? new Date(conta.conectadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  return (
    <div className="cartao mb-4 space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-texto"><Icone nome="zap" tamanho={15} /> WhatsApp do celular</span>
        {conta ? <span className="pilula pilula-ok">conectado em {quando}</span> : <span className="pilula pilula-neutra">não conectado</span>}
      </div>
      {conta && <p className="text-texto-suave">{conta.nome ?? "WhatsApp"} · <span className="font-numero">{conta.telefone}</span></p>}
      <p className="text-texto-suave">
        Liga o número do WhatsApp Business do celular ao sistema, sem tirar ele do celular. Abre a janela da Meta: entre com o Facebook da empresa,
        escolha a conta e, quando aparecer o QR, abra o WhatsApp Business no celular e leia o código.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={conectar} disabled={!pronto || proc} className="btn-principal text-sm disabled:opacity-50">
          {proc ? "Gravando..." : conta ? "Conectar de novo" : "Conectar WhatsApp"}
        </button>
        {!pronto && <span className="text-xs text-texto-fraco">carregando a Meta...</span>}
      </div>
      {msg && <p className={`rounded-controle px-3 py-2 ${msg.ok ? "pilula-ok" : "pilula-urgente"}`}>{msg.texto}</p>}
      <p className="text-xs text-texto-fraco">
        Depois de conectado: o WhatsApp Web e os computadores ligados ao celular desconectam uma vez (é só ler o QR de novo), o WhatsApp de Windows deixa de funcionar
        e as listas de transmissão do celular ficam só leitura.
      </p>
    </div>
  );
}
