"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fecharCaixaZ } from "../actions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export function FechamentoZ({
  caixaId,
  nome,
  abertoHora,
  saldoInicial,
  vendasPorForma,
  suprimentos,
  sangrias,
  totalVendas,
  esperado,
}: {
  caixaId: string;
  nome: string;
  abertoHora: string;
  saldoInicial: number;
  vendasPorForma: [string, number][];
  suprimentos: number;
  sangrias: number;
  totalVendas: number;
  esperado: number; // dinheiro esperado na gaveta
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [contadoStr, setContadoStr] = useState("");
  const [obs, setObs] = useState("");
  const [feito, setFeito] = useState<{ esperado: number; contado: number; quebra: number } | null>(null);

  const contado = num(contadoStr);
  const quebra = Math.round((contado - esperado) * 100) / 100;

  function confirmar() {
    if (!confirm("Fechar o caixa agora? Depois de fechado não entra mais venda nele.")) return;
    start(async () => {
      const r = await fecharCaixaZ(caixaId, contado, obs);
      if (r.ok) {
        setFeito({ esperado: r.esperado, contado: r.contado, quebra: r.quebra });
        setTimeout(() => {
          try {
            window.print();
          } catch {}
        }, 400);
        router.refresh();
      }
    });
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const agora = new Date().toLocaleString("pt-BR");

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-zinc-700 dark:hover:bg-zinc-600"
      >
        🔒 Fechar caixa (Z)
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Fechamento Z</h2>
              <button onClick={() => setAberto(false)} className="text-zinc-400 hover:text-zinc-700">
                ✕
              </button>
            </div>

            <div className="space-y-1 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="flex justify-between text-zinc-500">
                <span>Saldo inicial (troco)</span>
                <span>{brl(saldoInicial)}</span>
              </div>
              {vendasPorForma.map(([f, v]) => (
                <div key={f} className="flex justify-between text-zinc-700 dark:text-zinc-300">
                  <span>Vendas · {f}</span>
                  <span>{brl(v)}</span>
                </div>
              ))}
              <div className="flex justify-between text-blue-600">
                <span>Suprimentos</span>
                <span>+ {brl(suprimentos)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Sangrias</span>
                <span>− {brl(sangrias)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
                <span>Total de vendas</span>
                <span>{brl(totalVendas)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <span className="font-medium text-zinc-700 dark:text-zinc-200">💵 Dinheiro esperado na gaveta</span>
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{brl(esperado)}</span>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Dinheiro contado (R$)
              </label>
              <input
                autoFocus
                inputMode="decimal"
                value={contadoStr}
                onChange={(e) => setContadoStr(e.target.value)}
                placeholder="Conte a gaveta e digite aqui"
                className={`${inputCls} w-full text-right text-lg`}
              />
            </div>

            {contadoStr.trim() !== "" && (
              <div
                className={`mt-2 rounded-xl p-3 text-center text-sm font-bold ${
                  Math.abs(quebra) < 0.01
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : quebra > 0
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                }`}
              >
                {Math.abs(quebra) < 0.01
                  ? "✓ Caixa bateu certinho"
                  : quebra > 0
                    ? `Sobra de ${brl(quebra)}`
                    : `Falta ${brl(-quebra)}`}
              </div>
            )}

            <div className="mt-3">
              <label className="mb-1 block text-xs text-zinc-500">Observação (opcional)</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                placeholder="Ex.: faltou porque paguei o motoboy sem sangria"
                className={`${inputCls} w-full`}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAberto(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={proc || contadoStr.trim() === ""}
                className="rounded-lg bg-zinc-800 px-5 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-zinc-700"
              >
                {proc ? "Fechando..." : "Fechar e imprimir Z"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cupom Z (só na impressão — térmica) */}
      {feito && (
        <div className="cupom-z">
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14pt" }}>FECHAMENTO Z</div>
          <div style={{ textAlign: "center" }}>{nome}</div>
          <div>Abertura: {abertoHora}</div>
          <div>Fechamento: {agora}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Saldo inicial</span>
            <span>{brl(saldoInicial)}</span>
          </div>
          {vendasPorForma.map(([f, v]) => (
            <div key={f} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Vendas {f}</span>
              <span>{brl(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Suprimentos</span>
            <span>+ {brl(suprimentos)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Sangrias</span>
            <span>- {brl(sangrias)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
            <span>Total vendas</span>
            <span>{brl(totalVendas)}</span>
          </div>
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Dinheiro esperado</span>
            <span>{brl(feito.esperado)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Dinheiro contado</span>
            <span>{brl(feito.contado)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14pt", fontWeight: "bold" }}>
            <span>{feito.quebra < 0 ? "FALTA" : feito.quebra > 0 ? "SOBRA" : "QUEBRA"}</span>
            <span>{brl(Math.abs(feito.quebra))}</span>
          </div>
          {obs && <div style={{ marginTop: "2mm" }}>Obs: {obs}</div>}
        </div>
      )}
      <style>{`
        .cupom-z { display: none; }
        @media print {
          @page { size: 72mm auto; margin: 0; }
          html, body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .cupom-z, .cupom-z * { visibility: visible; color: #000 !important; }
          .cupom-z {
            display: block; position: absolute; left: 0; top: 0;
            width: 72mm; box-sizing: border-box; padding: 3mm 3mm;
            font-family: 'Courier New', monospace; font-size: 11pt; line-height: 1.3;
          }
        }
      `}</style>
    </>
  );
}
