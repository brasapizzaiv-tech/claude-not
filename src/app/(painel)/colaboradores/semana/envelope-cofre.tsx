"use client";

import { useEffect, useState } from "react";
import { ContagemNotas } from "@/components/contagem-notas";
import { valorDe, type Quantidades } from "@/lib/cofre";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Janela pra conferir/ajustar as notas que saem do cofre pra uma pessoa (acerto
// da semana ou adiantamento). O sistema sugere; aqui a pessoa troca as notas.
// Só deixa salvar quando fecha o valor exato.
export function EnvelopeCofre({
  titulo,
  alvo,
  inicial,
  saldo,
  aoSalvar,
  aoFechar,
}: {
  titulo: string;
  /** Valor que o envelope tem que fechar, em reais. */
  alvo: number;
  inicial: Quantidades | null;
  /** O que tem no cofre (pra mostrar e não deixar passar do saldo). */
  saldo: Quantidades;
  aoSalvar: (q: Quantidades) => void;
  aoFechar: () => void;
}) {
  const [q, setQ] = useState<Quantidades>(inicial ?? {});
  const [erroDigitado, setErroDigitado] = useState(false);
  const total = valorDe(q);
  const fecha = Math.abs(total - alvo) < 0.005;
  const passa = Object.entries(q).some(([k, v]) => v > (saldo[k] ?? 0));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 cursor-default bg-black/50" />
      <div role="dialog" aria-modal="true" aria-label={titulo} className="cartao relative max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5">
        <p className="rotulo">Envelope do cofre</p>
        <h2 className="mt-1 font-numero text-xl font-bold text-texto">{titulo}</h2>
        <p className="mt-1 text-sm text-texto-suave">
          Tem que fechar <b className="font-numero text-texto">{brl(alvo)}</b>. Agora: <b className={`font-numero ${fecha ? "text-ok-texto" : "text-urgente-texto"}`}>{brl(total)}</b>
          {!fecha && ` (${total > alvo ? "passa" : "falta"} ${brl(Math.abs(total - alvo))})`}
        </p>
        <div className="mt-4">
          <ContagemNotas valor={q} onChange={setQ} saldo={saldo} mostrarSaldo lado focoInicial aoMudarErro={setErroDigitado} />
        </div>
        {passa && <p role="alert" className="mt-2 text-sm text-urgente-texto">Tem nota a mais do que o cofre tem.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className="btn-secundario text-sm">Voltar</button>
          <button
            type="button"
            disabled={!fecha || passa || erroDigitado}
            onClick={() => aoSalvar(q)}
            className="btn-principal text-sm disabled:opacity-40"
          >
            Usar estas notas
          </button>
        </div>
      </div>
    </div>
  );
}
