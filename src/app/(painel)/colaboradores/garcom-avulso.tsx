"use client";

// Garçom AVULSO (migration 0249): o link da noite pra garçom esporádico. Quem
// abre digita o nome e entra no app do garçom até as 03:00, sem cadastro.
import { useState } from "react";
import QRCode from "qrcode";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { Icone } from "@/components/icone";
import { textoValidade } from "@/lib/garcom-avulso";
import { encerrarLinkGarcomAvulso, gerarLinkGarcomAvulso, linkGarcomAvulso } from "./actions";

export function GarcomAvulso() {
  const [aberto, setAberto] = useState(false);
  const [link, setLink] = useState<{ token: string; valido_ate: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const url = link ? `${window.location.origin}/garcom-avulso/${link.token}` : "";

  async function mostrar(l: { token: string; valido_ate: string } | null) {
    setLink(l);
    setQr(l ? await QRCode.toDataURL(`${window.location.origin}/garcom-avulso/${l.token}`, { margin: 1, width: 240 }).catch(() => null) : null);
  }
  async function abrir() {
    setAberto(true);
    await mostrar(await linkGarcomAvulso());
  }
  async function gerar() {
    if (link && !(await confirmar("Gerar um link novo? O de agora para de funcionar pra quem ainda não entrou."))) return;
    const r = await gerarLinkGarcomAvulso();
    if (!r.ok) { void avisar(r.mensagem); return; }
    await mostrar({ token: r.token, valido_ate: r.valido_ate });
  }
  async function encerrar() {
    if (!(await confirmar("Encerrar o link agora? Quem entrou por ele sai do app do garçom.", { perigo: true, okTexto: "Encerrar" }))) return;
    await encerrarLinkGarcomAvulso();
    await mostrar(null);
  }
  const textoZap = link ? `Oi! Este é o link do garçom de hoje na Brasa: ${url}\nAbra, digite o seu nome e pronto. Vale até ${textoValidade(link.valido_ate)}.` : "";

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
      >
        <span className="inline-flex items-center gap-1.5"><Icone nome="garcom" tamanho={14} /> Garçom avulso</span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setAberto(false)}>
          <div className="cartao my-8 w-full max-w-md p-5" role="dialog" aria-label="Link do garçom avulso" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-numero text-lg font-bold text-texto">Garçom avulso</h2>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center text-texto-fraco"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p className="text-sm text-texto-suave">
              Pra garçom de uma noite, sem cadastro: ele abre o link, digita o nome e já lança pedidos (saem com o nome dele). O link vale até as 03:00.
            </p>
            {link ? (
              <div className="mt-4 flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr ? <img src={qr} alt="QR do link do garçom" width={240} height={240} className="rounded-controle bg-white p-2" /> : <span className="block h-[240px] w-[240px]" />}
                <p className="text-xs text-texto-suave">Vale até <b className="text-texto">{textoValidade(link.valido_ate)}</b></p>
                <p className="w-full break-all rounded-controle bg-superficie-suave px-3 py-2 text-center text-xs text-texto">{url}</p>
                <div className="flex w-full flex-wrap gap-2">
                  <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })} className="btn-secundario !min-h-11 flex-1 text-sm">
                    {copiado ? "Copiado ✓" : "Copiar link"}
                  </button>
                  <a href={`https://web.whatsapp.com/send?text=${encodeURIComponent(textoZap)}`} target="_blank" rel="noopener noreferrer" className="btn-principal !min-h-11 flex-1 text-sm">WhatsApp</a>
                </div>
                <div className="flex w-full flex-wrap gap-2 border-t border-borda pt-3">
                  <BotaoAcao aoClicar={gerar} className="btn-secundario !min-h-11 flex-1 text-sm">Gerar link novo</BotaoAcao>
                  <BotaoAcao aoClicar={encerrar} className="btn-secundario !min-h-11 flex-1 text-sm !text-urgente-texto">Encerrar agora</BotaoAcao>
                </div>
              </div>
            ) : (
              <BotaoAcao aoClicar={gerar} className="btn-principal mt-4 w-full text-sm">Gerar o link de hoje</BotaoAcao>
            )}
          </div>
        </div>
      )}
    </>
  );
}
