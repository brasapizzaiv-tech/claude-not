"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { dataBR } from "@/lib/format";
import { responderEntregaColab } from "./actions";
import { PedidoCard, type PedidoColab } from "./pedidos";

// PERGUNTA OBRIGATÓRIA DO DIA DA ENTREGA (migration 0228)
//
// Pra quem faz contagem: no dia previsto da entrega de um pedido, o app abre
// com esta tela por cima de tudo e só sai respondendo. "Chegou" abre a
// conferência; "Ainda não chegou" pergunta de novo em 2 h; "Não veio" vai pro
// mural do escritório. Pedido do Rafael (11/10/2026): ninguém respondia a
// conferência e os pedidos sumiam sem saber se tinham chegado.
//
// Quem entra aqui já vem filtrado pelo servidor (page.tsx): cobrado, sem
// conferência, sem "não veio", dia da entrega até hoje e fora do adiamento.
export function EntregaObrigatoria({
  token,
  pedidos,
  produtos,
  hoje,
}: {
  token: string;
  pedidos: PedidoColab[];
  produtos: { id: string; nome: string }[];
  hoje: string;
}) {
  const router = useRouter();
  const [respondidos, setRespondidos] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"pergunta" | "conferir" | "nao_veio">("pergunta");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const fila = pedidos.filter((p) => !respondidos.has(p.id));
  const p = fila[0];
  if (!p) return null;

  function proximo() {
    setRespondidos((s) => new Set(s).add(p.id));
    setModo("pergunta");
    setObs("");
    setErro(null);
    router.refresh();
  }
  async function responder(resposta: "adiar" | "nao_veio") {
    setErro(null);
    const r = await responderEntregaColab(token, p.id, resposta, resposta === "nao_veio" ? obs : undefined);
    if (r.ok) proximo();
    else setErro("Não foi possível salvar. Confira a internet e tente de novo.");
  }

  const atrasado = !!p.entrega && p.entrega < hoje;
  const quando = !p.entrega ? "" : p.entrega === hoje ? "hoje" : `${dataBR(p.entrega)}${atrasado ? " (atrasado)" : ""}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entrega-titulo"
      className="fixed inset-0 z-50 overflow-y-auto bg-painel-fundo"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-md p-4">
        <p className="text-xs font-medium text-texto-fraco">
          Entrega de pedido{fila.length > 1 ? ` · 1 de ${fila.length}` : ""}
        </p>
        <h2 id="entrega-titulo" className="mt-1 text-2xl font-bold text-texto">
          Chegou o pedido de {p.fornecedor || "fornecedor"}?
        </h2>
        <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${atrasado ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>
          <Icone nome="caminhao" tamanho={15} /> entrega prevista {quando}
        </p>

        {modo === "pergunta" && (
          <>
            <div className="mt-4 cartao p-3">
              <p className="mb-1 text-xs text-texto-fraco">Pedido de {dataBR(p.data)} · {p.itens.length} {p.itens.length === 1 ? "item" : "itens"}</p>
              <ul className="space-y-0.5 text-sm text-texto-suave">
                {p.itens.slice(0, 8).map((i) => (
                  <li key={i.id}>{i.nome}</li>
                ))}
                {p.itens.length > 8 && <li className="text-texto-fraco">e mais {p.itens.length - 8}…</li>}
              </ul>
            </div>
            <div className="mt-4 grid gap-2">
              <button onClick={() => setModo("conferir")} className="w-full rounded-cartao bg-emerald-600 py-3.5 text-base font-bold text-white">
                Chegou — conferir agora
              </button>
              <BotaoAcao aoClicar={() => responder("adiar")} className="w-full rounded-cartao bg-superficie-suave py-3.5 text-base font-semibold text-texto">
                Ainda não chegou (pergunta de novo em 2 h)
              </BotaoAcao>
              <button onClick={() => setModo("nao_veio")} className="w-full rounded-cartao border border-red-300 py-3.5 text-base font-semibold text-red-700 dark:border-red-800 dark:text-red-300">
                Não veio
              </button>
            </div>
          </>
        )}

        {modo === "conferir" && (
          <div className="mt-4">
            <PedidoCard token={token} pedido={p} produtos={produtos} abertoInicial onConfirmado={proximo} />
            <button onClick={() => setModo("pergunta")} className="mt-3 w-full py-2 text-sm text-texto-fraco">voltar</button>
          </div>
        )}

        {modo === "nao_veio" && (
          <div className="mt-4 cartao p-3">
            <p className="text-sm text-texto">O escritório vai ser avisado pra falar com o fornecedor.</p>
            <label htmlFor="obs-nao-veio" className="mt-3 block text-xs text-texto-fraco">Alguma observação? (opcional)</label>
            <textarea
              id="obs-nao-veio"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Ex.: veio só metade, ligaram dizendo que chega amanhã…"
              className="mt-1 w-full rounded-controle border border-borda-forte bg-painel-fundo px-3 py-2 text-sm text-texto"
            />
            <BotaoAcao aoClicar={() => responder("nao_veio")} className="mt-3 w-full rounded-cartao bg-red-600 py-3 text-base font-bold text-white">
              Confirmar: não veio
            </BotaoAcao>
            <button onClick={() => setModo("pergunta")} className="mt-2 w-full py-2 text-sm text-texto-fraco">voltar</button>
          </div>
        )}

        {erro && <p className="mt-3 rounded-controle bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
      </div>
    </div>
  );
}
