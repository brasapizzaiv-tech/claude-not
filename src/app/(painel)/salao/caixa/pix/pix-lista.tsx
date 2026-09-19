"use client";

import { Icone } from "@/components/icone";
import { confirmar as perguntarSeOk } from "@/components/dialogo";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { estornarPix } from "../../pix-actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type PixLinha = {
  txid: string;
  valor: number;
  origem: string;
  status: string;
  descricao: string | null;
  ordem: string; // ISO, só pra ordenar
  criadoEm: string; // já formatado (SP)
  pagoEm: string | null;
  valorDevolvido: number;
  devolucoes: { id: string; valor: number; motivo: string; por: string | null; em: string; status: string }[];
};

export function PixLista({ linhas }: { linhas: PixLinha[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();

  function abrir(l: PixLinha) {
    setAberto(l.txid);
    setValor((l.valor - l.valorDevolvido).toFixed(2).replace(".", ","));
    setMotivo("");
    setMsg(null);
  }

  async function confirmar(l: PixLinha) {
    const v = Math.round(num(valor) * 100) / 100;
    const resta = Math.round((l.valor - l.valorDevolvido) * 100) / 100;
    if (!(v > 0) || v > resta + 0.005) { setMsg(`Valor inválido. Dá pra devolver até ${brl(resta)}.`); return; }
    if (motivo.trim().length < 3) { setMsg("Escreva o motivo (mín. 3 letras)."); return; }
    if (!await perguntarSeOk(`Devolver ${brl(v)} pro cliente que pagou este Pix? Não dá pra desfazer.`)) return;
    start(async () => {
      try {
        const r = await estornarPix(l.txid, v, motivo.trim());
        if (r.ok) {
          setMsg(`Devolução enviada (${r.status}). O dinheiro volta pra conta de quem pagou.`);
          setAberto(null);
          router.refresh();
        } else {
          setMsg(r.erro);
        }
      } catch {
        setMsg("Sem conexão. Atualize a página e veja se a devolução saiu antes de tentar de novo.");
      }
    });
  }

  if (linhas.length === 0) {
    return <p className="rounded-cartao bg-painel-cartao p-8 text-center text-sm text-texto-suave">Nenhum Pix nesse período.</p>;
  }

  return (
    <div className="space-y-2">
      {msg && <p className="rounded-controle bg-superficie-suave px-3 py-2 text-sm">{msg}</p>}
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Referência</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((l) => {
              const resta = Math.round((l.valor - l.valorDevolvido) * 100) / 100;
              const podeEstornar = l.status === "pago" && resta > 0.005;
              return (
                <tr key={l.txid} className="bg-painel-cartao align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{l.pagoEm ?? l.criadoEm}</td>
                  <td className="px-3 py-2">{l.origem === "pdv" ? "Balcão" : l.origem === "delivery" ? "Delivery" : "Caixa"}</td>
                  <td className="px-3 py-2 text-texto-suave">{l.descricao ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{brl(l.valor)}</td>
                  <td className="px-3 py-2">
                    {l.status === "pago" ? (
                      l.valorDevolvido > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600"><Icone nome="desfazer" tamanho={12} /> devolvido {brl(l.valorDevolvido)}</span>
                      ) : (
                        <span className="text-emerald-600">✓ pago</span>
                      )
                    ) : l.status === "cancelado" ? (
                      <span className="text-texto-fraco">cancelado</span>
                    ) : (
                      <span className="text-texto-fraco">aguardando</span>
                    )}
                    {l.devolucoes.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-mini text-texto-suave">
                        {l.devolucoes.map((d) => (
                          <li key={d.id}>{d.em} · {brl(d.valor)} · {d.motivo} · {d.status}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {podeEstornar && aberto !== l.txid && (
                      <button onClick={() => abrir(l)} className="rounded-controle border border-amber-500 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Estornar
                      </button>
                    )}
                    {aberto === l.txid && (
                      <div className="flex flex-col items-end gap-1.5">
                        <input
                          value={valor}
                          onChange={(e) => setValor(e.target.value)}
                          inputMode="decimal"
                          className="w-28 rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-right text-sm"
                        />
                        <input
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Motivo (ex.: cobrado errado)"
                          className="w-56 rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-sm"
                        />
                        <div className="flex gap-1.5">
                          <button onClick={() => setAberto(null)} className="rounded-controle px-3 py-1 text-xs text-texto-suave">Cancelar</button>
                          <button onClick={() => confirmar(l)} disabled={pend} className="rounded-controle bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                            {pend ? "Devolvendo…" : "Devolver"}
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
