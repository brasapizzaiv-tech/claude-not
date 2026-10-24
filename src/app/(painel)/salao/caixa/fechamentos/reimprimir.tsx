"use client";

// Reimprime o cupom do fechamento Z na impressora da nota (Central de Impressões).
import { BotaoAcao } from "@/components/enviar";
import { avisar } from "@/components/dialogo";
import { reimprimirFechamento } from "../../actions";

export function ReimprimirZ({ caixaId }: { caixaId: string }) {
  return (
    <BotaoAcao
      aoClicar={async () => {
        const r = (await reimprimirFechamento(caixaId)) as { ok?: boolean; mensagem?: string } | undefined;
        void avisar(r && r.ok === false ? r.mensagem ?? "Não consegui mandar pra impressora." : "Fechamento enviado pra impressora.");
      }}
      className="ml-3 text-xs font-semibold text-texto-suave hover:text-texto"
    >
      reimprimir Z
    </BotaoAcao>
  );
}
