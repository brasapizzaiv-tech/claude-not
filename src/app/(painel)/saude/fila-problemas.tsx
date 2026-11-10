"use client";

import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import type { FilaProblema } from "@/lib/saude-painel";
import { imprimirDeNovo, descartarDaFila } from "./actions";

const TIPO: Record<string, string> = {
  comanda: "Comanda da cozinha",
  etiqueta: "Etiqueta",
  marmita: "Etiqueta de marmita",
  nfce: "Cupom da nota",
  tef: "Comprovante do cartão",
  vale: "Vale-presente",
  fechamento: "Fechamento do caixa",
  teste: "Página de teste",
  teste_etiqueta: "Etiqueta de teste",
};

const MOTIVO: Record<FilaProblema["motivo"], { texto: string; classe: string }> = {
  falhando: { texto: "Desistiu depois de 5 falhas", classe: "pilula pilula-urgente" },
  retida: { texto: "Comanda com mais de 1 hora: segurada", classe: "pilula" },
  esperando: { texto: "Esperando", classe: "pilula pilula-neutra" },
};

function quando(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function FilaProblemas({ lista }: { lista: FilaProblema[] }) {
  const router = useRouter();
  if (lista.length === 0) return null;

  async function deNovo(f: FilaProblema) {
    const r = await imprimirDeNovo(f.id);
    if (!r.ok) await avisar(r.erro ?? "Não deu.");
    router.refresh();
  }
  async function descartar(f: FilaProblema) {
    const ok = await confirmar(`Tirar "${TIPO[f.tipo] ?? f.tipo}" da fila sem imprimir?`, {
      detalhe: "Ele não sai mais na impressora. Pra imprimir depois, é preciso mandar de novo pela tela de origem.",
      perigo: true,
      okTexto: "Tirar da fila",
    });
    if (!ok) return;
    const r = await descartarDaFila(f.id);
    if (!r.ok) await avisar(r.erro ?? "Não deu.");
    router.refresh();
  }

  return (
    <section className="cartao p-5">
      <h2 className="font-numero text-lg font-bold text-texto">Fila de impressão</h2>
      <p className="mt-1 text-sm text-texto-suave">
        Itens que não saíram. Comanda da cozinha com mais de 1 hora não sai sozinha: confira se ainda vale antes de mandar.
      </p>
      <ul className="mt-4 divide-y divide-borda">
        {lista.map((f) => {
          const m = MOTIVO[f.motivo];
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  {TIPO[f.tipo] ?? f.tipo}
                  {f.impressora ? <span className="font-normal text-texto-suave"> · {f.impressora}</span> : null}
                </p>
                <p className="text-sm text-texto-suave">
                  pedido {quando(f.solicitado_em)}
                  {f.tentativas > 0 ? ` · ${f.tentativas} tentativa(s)` : ""}
                  {f.ultimo_erro ? ` · ${f.ultimo_erro}` : ""}
                </p>
              </div>
              <span className={m.classe}>{m.texto}</span>
              <div className="flex gap-2">
                {f.motivo !== "esperando" && (
                  <BotaoAcao aoClicar={() => deNovo(f)} className="btn-secundario min-h-11 px-4 text-sm">
                    Imprimir de novo
                  </BotaoAcao>
                )}
                <BotaoAcao aoClicar={() => descartar(f)} className="btn-secundario min-h-11 px-4 text-sm">
                  Tirar da fila
                </BotaoAcao>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
