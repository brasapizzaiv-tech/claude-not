"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { BotaoAcao } from "@/components/enviar";
import type { LembreteDoApp } from "@/lib/lembretes-server";
import { confirmarLembreteApp } from "./lembretes-actions";

const fData = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const fHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// Cartão "Lembretes de hoje" no topo do app da equipe. O que falta confirmar
// vem primeiro e chama atenção; o confirmado fica apagadinho com a hora.
export function LembretesHoje({ token, itens }: { token: string; itens: LembreteDoApp[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  if (itens.length === 0) return null;
  const pendentes = itens.filter((i) => !i.confirmado);
  const ordenados = [...pendentes, ...itens.filter((i) => i.confirmado)];

  return (
    <div className={`mb-3 rounded-cartao border p-4 ${pendentes.length ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-borda"}`}>
      <p className="mb-2 flex items-center justify-between font-semibold text-texto">
        <span className="inline-flex items-center gap-2"><Icone nome="sino" tamanho={17} /> Lembretes de hoje</span>
        <span className="text-xs font-normal text-texto-suave">{pendentes.length ? `${pendentes.length} pra confirmar` : "tudo confirmado"}</span>
      </p>
      <ul className="space-y-2">
        {ordenados.map(({ lembrete: l, dia, confirmado, atrasado, confirmadoEm }) => (
          <li key={`${l.id}|${dia}`} className={`rounded-controle bg-painel-cartao p-3 ${confirmado ? "opacity-60" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">{l.titulo}</p>
                {l.texto && <p className="mt-0.5 whitespace-pre-wrap text-sm text-texto-suave">{l.texto}</p>}
                <p className="mt-1 text-xs text-texto-fraco">
                  {atrasado ? `desde ${fData(dia)}` : l.hora ? `às ${l.hora}` : "hoje"}
                  {confirmado && confirmadoEm ? ` · ${l.tipo === "tarefa" ? "feito" : "visto"} às ${fHora(confirmadoEm)}` : ""}
                </p>
              </div>
              {confirmado ? (
                <Icone nome="certo" tamanho={22} className="shrink-0 text-emerald-600" titulo="Confirmado" />
              ) : (
                <BotaoAcao
                  aoClicar={async () => {
                    setErro(null);
                    const r = await confirmarLembreteApp(token, l.id, dia);
                    if (!r.ok) setErro(r.mensagem);
                    else router.refresh();
                  }}
                  className="min-h-11 shrink-0 rounded-controle bg-emerald-600 px-4 text-sm font-semibold text-white"
                >
                  {l.tipo === "tarefa" ? "Feito" : "Visto"}
                </BotaoAcao>
              )}
            </div>
          </li>
        ))}
      </ul>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
