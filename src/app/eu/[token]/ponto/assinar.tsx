"use client";

// Botões do espelho fechado: "Está certo, assinar" e "Não concordo".
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar, perguntar } from "@/components/dialogo";
import { responderPonto } from "./actions";

export function AssinarPonto({ token, de, periodo }: { token: string; de: string; periodo: string }) {
  const router = useRouter();

  async function assinar() {
    if (!(await confirmar(`Assinar o seu ponto de ${periodo}?`, { detalhe: "Você confirma que as batidas e as horas estão certas.", okTexto: "Assinar" }))) return;
    const r = await responderPonto(token, de, "assinado", "");
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  async function discordar() {
    const motivo = await perguntar("O que está errado?", "", { detalhe: "Ex.: dia 07/10 eu saí às 15h, não às 14h. A gestão confere e corrige.", obrigatorio: true });
    if (motivo == null) return;
    const r = await responderPonto(token, de, "discorda", motivo);
    if (!r.ok) { void avisar(r.erro); return; }
    void avisar("Enviado pra gestão.", "Quando corrigirem, o ponto aparece aqui de novo pra você assinar.");
    router.refresh();
  }

  return (
    <div className="mt-4 grid gap-2">
      <BotaoAcao aoClicar={assinar} className="btn-principal w-full text-base">Está certo, assinar</BotaoAcao>
      <BotaoAcao aoClicar={discordar} className="btn-foco w-full text-sm">Não concordo</BotaoAcao>
    </div>
  );
}
