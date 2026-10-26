"use client";

// Abrir o documento e "Li e assino".
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { abrirDocumentoEu, assinarDocumentoEu } from "./actions";

export function BotoesDocumento({ token, docId, nome, soAbrir }: { token: string; docId: string; nome: string; soAbrir?: boolean }) {
  const router = useRouter();
  const [abriu, setAbriu] = useState(false);
  async function abrir() {
    const r = await abrirDocumentoEu(token, docId);
    if (!r.ok) { void avisar(r.erro); return; }
    window.open(r.url, "_blank", "noopener");
    setAbriu(true);
  }
  async function assinar() {
    if (!(await confirmar(`Assinar “${nome}”?`, { detalhe: "Você confirma que leu e concorda com o documento.", okTexto: "Assinar" }))) return;
    const r = await assinarDocumentoEu(token, docId);
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  if (soAbrir) return <BotaoAcao aoClicar={abrir} className="min-h-11 shrink-0 px-2 text-sm font-semibold text-texto-marca">abrir</BotaoAcao>;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <BotaoAcao aoClicar={abrir} className="btn-secundario text-sm">Abrir</BotaoAcao>
      <BotaoAcao aoClicar={assinar} disabled={!abriu} title={abriu ? undefined : "Abra o documento primeiro"} className="btn-principal text-sm">Li e assino</BotaoAcao>
    </div>
  );
}
