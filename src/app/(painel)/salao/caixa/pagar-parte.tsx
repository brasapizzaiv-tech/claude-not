"use client";

// "Pagar parte" do caixa (modelo do Suitable): divide o que falta da comanda
// por pessoas (2 a 12) ou por um valor digitado, e cada parte escolhe se
// considera a taxa de serviço — numa conta dividida um paga os 10% e o outro
// não. A parte vai pro pagamento normal; a comanda fica aberta com o resto.
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type ParteEscolhida = { valor: number; comServico: boolean; pessoas: number | null };

export function PagarParte({
  totalBase,
  pagoDinheiro,
  faltaBase,
  servPercent,
  onCancelar,
  onSalvar,
}: {
  /** Preço de tudo o que foi consumido (sem serviço). */
  totalBase: number;
  /** Dinheiro que já entrou nessas comandas. */
  pagoDinheiro: number;
  /** O que falta do preço (sem serviço). */
  faltaBase: number;
  servPercent: number;
  onCancelar: () => void;
  onSalvar: (p: ParteEscolhida) => void;
}) {
  const temServico = servPercent > 0;
  const [comServico, setComServico] = useState(temServico);
  const [pessoas, setPessoas] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const fator = comServico ? 1 + servPercent / 100 : 1;
  const total = r2(totalBase * fator);
  const pendente = r2(faltaBase * fator);
  const v = num(valor);
  const grande = v > pendente + 0.009;

  function dividir(n: number) {
    setPessoas(n);
    setValor(r2(pendente / n).toFixed(2).replace(".", ","));
  }
  function trocarServico(sim: boolean) {
    setComServico(sim);
    // Já tinha escolhido "por pessoas": refaz a conta com o novo pendente.
    if (pessoas) {
      const p = r2(faltaBase * (sim ? 1 + servPercent / 100 : 1));
      setValor(r2(p / pessoas).toFixed(2).replace(".", ","));
    }
  }

  const caixa = "rounded-controle border border-borda-forte px-3 pb-2 pt-1";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancelar}>
      <div role="dialog" aria-modal="true" aria-label="Pagar parte" className="cartao w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-numero text-lg font-bold text-texto">Dividir para pagamento</h2>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className={caixa}><p className="rotulo">Total</p><p className="font-numero text-xl font-bold text-texto">{brl(total)}</p></div>
          <div className={caixa}><p className="rotulo">Já pago</p><p className="font-numero text-xl font-bold text-texto">{brl(pagoDinheiro)}</p></div>
          <div className={`${caixa} bg-destaque`}><p className="rotulo">Pendente</p><p className="font-numero text-xl font-bold text-texto">{brl(pendente)}</p></div>
        </div>

        <p className="mt-4 text-sm text-texto-suave">Dividir o pendente por quantas pessoas?</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => dividir(n)}
              aria-pressed={pessoas === n}
              className={`min-h-11 rounded-full font-numero text-base font-bold ${pessoas === n ? "bg-primaria text-marca-sobre-primaria" : "bg-superficie-suave text-texto"}`}
            >
              {n}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-sm text-texto-suave">Valor desta parte</span>
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => { setValor(e.target.value); setPessoas(null); }}
            placeholder="0,00"
            className="mt-1 min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 text-right font-numero text-lg text-texto"
          />
        </label>
        {pessoas && <p className="mt-1 text-xs text-texto-suave">{pessoas} pessoas: {brl(r2(pendente / pessoas))} cada.</p>}
        {grande && <p className="mt-1 text-sm text-urgente-texto">Maior do que o pendente ({brl(pendente)}).</p>}

        {temServico && (
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-controle bg-superficie-suave px-3 text-sm text-texto">
            <input type="checkbox" checked={comServico} onChange={(e) => trocarServico(e.target.checked)} className="h-5 w-5 accent-[var(--marca-primaria)]" />
            Considerar a taxa de serviço ({servPercent}%)
            {v > 0 && comServico && <span className="ml-auto text-texto-suave">{servPercent}% desta parte: {brl(r2(v - v / fator))}</span>}
          </label>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancelar} className="btn-secundario">Cancelar</button>
          <button
            type="button"
            disabled={!(v > 0) || grande}
            onClick={() => onSalvar({ valor: r2(v), comServico, pessoas })}
            className="btn-principal"
          >
            Pagar esta parte
          </button>
        </div>
      </div>
    </div>
  );
}
