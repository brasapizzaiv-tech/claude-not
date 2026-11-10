"use client";

import { useState } from "react";
import { Enviar } from "@/components/enviar";
import { ContagemNotas } from "@/components/contagem-notas";
import { valorDe, type Quantidades } from "@/lib/cofre";
import { abrirCaixa } from "../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Abertura do caixa com o troco contado do mesmo jeito do fechamento: nota por
// nota (a saída já entra contada no Cofre) ou só o total (o Cofre pergunta as
// notas depois). Pedido do Rafael, 10/11/2026.
export function AbrirCaixaForm() {
  const [modo, setModo] = useState<"notas" | "total">("notas");
  const [notas, setNotas] = useState<Quantidades>({});
  const [erroNotas, setErroNotas] = useState(false);
  const porNotas = modo === "notas";
  const total = valorDe(notas);

  return (
    // Cartão de foco (VIS-04): a peça pronta, com o anel do teclado na cor do cartão.
    <form action={abrirCaixa} className="cartao-foco mt-6 space-y-4 p-5" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
      <div>
        <label htmlFor="caixa-nome" className="mb-1 block text-xs text-painel-foco-rotulo">Nome / turno</label>
        <input
          id="caixa-nome"
          name="nome"
          defaultValue="Noite"
          className="min-h-11 w-full rounded-controle border border-current/30 bg-transparent px-3 text-sm placeholder:opacity-60"
        />
      </div>

      <div>
        <p className="mb-2 text-xs text-painel-foco-rotulo">Troco inicial / saldo anterior</p>
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Como contar o troco">
          {([["notas", "Nota por nota"], ["total", "Só o total"]] as const).map(([k, rotulo]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={modo === k}
              onClick={() => setModo(k)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${modo === k ? "bg-painel-foco-texto text-painel-foco-fundo" : "border border-current/30"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {porNotas ? (
          <div className="rounded-controle bg-painel-cartao p-3 text-texto">
            <p className="mb-2 text-xs text-texto-suave">Quantidade ou valor de cada nota e moeda do troco. A saída já vai contada para o Cofre.</p>
            <ContagemNotas valor={notas} onChange={setNotas} aoMudarErro={setErroNotas} />
            <div className="mt-3 flex items-center justify-between text-sm font-medium text-texto-suave">
              <span>Troco contado</span>
              <span className="font-numero text-lg font-bold text-texto">{brl(total)}</span>
            </div>
            <input type="hidden" name="notas" value={JSON.stringify(notas)} />
          </div>
        ) : (
          <>
            <label htmlFor="caixa-saldo" className="sr-only">Troco inicial (R$)</label>
            <input
              id="caixa-saldo"
              name="saldo_inicial"
              inputMode="decimal"
              placeholder="0,00"
              className="min-h-11 w-40 rounded-controle border border-current/30 bg-transparent px-3 font-numero text-sm"
            />
            <p className="mt-1 text-xs opacity-80">Só com o total, o Cofre vai pedir a contagem das notas depois.</p>
          </>
        )}
      </div>

      <Enviar
        disabled={porNotas && erroNotas}
        className="btn-principal min-h-11 px-5 text-sm"
      >
        Abrir caixa
      </Enviar>
    </form>
  );
}
