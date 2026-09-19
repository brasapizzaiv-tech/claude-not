"use client";

import { Icone } from "@/components/icone";
import { avisar, confirmar as perguntarSeOk } from "@/components/dialogo";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fecharCaixaZ, reimprimirFechamento } from "../actions";

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
  // Quantas impressoras receberam o cupom (0 = nenhuma marcada pra NFC-e).
  const [impresso, setImpresso] = useState<number | null>(null);
  const [msgImp, setMsgImp] = useState<string | null>(null);

  const contado = num(contadoStr);
  const quebra = Math.round((contado - esperado) * 100) / 100;

  async function confirmar() {
    if (!await perguntarSeOk("Fechar o caixa agora? Depois de fechado não entra mais venda nele.")) return;
    start(async () => {
      try {
        const r = await fecharCaixaZ(caixaId, contado, obs);
        if (r.ok) {
          setFeito({ esperado: r.esperado, contado: r.contado, quebra: r.quebra });
          // O cupom vai pra fila da Central de Impressões (mesma impressora da
          // NFC-e). Só cai na janela do navegador se não houver impressora.
          setImpresso(r.impressoras ?? 0);
          if (!r.impressoras) setTimeout(() => { try { window.print(); } catch {} }, 400);
          router.refresh();
        } else {
          void avisar("Não consegui fechar o caixa — ele pode já ter sido fechado em outra tela. Atualize a página.");
          router.refresh();
        }
      } catch {
        void avisar("Sem conexão. Atualize a página e confira se o caixa fechou antes de tentar de novo.");
      }
    });
  }

  const inputCls =
    "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";
  const agora = new Date().toLocaleString("pt-BR");

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-controle bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:bg-zinc-700 dark:hover:bg-zinc-600"
      >
        <Icone nome="cadeado" tamanho={15} className="mr-1.5" /> Fechar caixa (Z)
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-cartao bg-painel-cartao p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-texto">Fechamento Z</h2>
              <button onClick={() => setAberto(false)} className="text-texto-fraco hover:text-texto-suave">
                ✕
              </button>
            </div>

            <div className="space-y-1 rounded-cartao bg-superficie-suave p-3 text-sm">
              <div className="flex justify-between text-texto-suave">
                <span>Saldo inicial (troco)</span>
                <span>{brl(saldoInicial)}</span>
              </div>
              {vendasPorForma.map(([f, v]) => (
                <div key={f} className="flex justify-between text-texto-suave">
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
              <div className="mt-1 flex justify-between border-t border-borda pt-1 font-medium text-texto dark:border-borda-forte">
                <span>Total de vendas</span>
                <span>{brl(totalVendas)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-cartao border border-borda p-3 text-sm">
              <span className="font-medium text-texto-suave"><span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Dinheiro esperado na gaveta</span></span>
              <span className="text-lg font-bold text-texto">{brl(esperado)}</span>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-texto-suave">
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
                className={`mt-2 rounded-cartao p-3 text-center text-sm font-bold ${
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
              <label className="mb-1 block text-xs text-texto-suave">Observação (opcional)</label>
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
                className="rounded-controle border border-borda-forte px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={proc || contadoStr.trim() === ""}
                className="rounded-controle bg-zinc-800 px-5 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-zinc-700"
              >
                {proc ? "Fechando..." : "Fechar e imprimir Z"}
              </button>
            </div>

            {impresso !== null && (
              <div className="mt-3 rounded-cartao bg-superficie-suave p-3 text-sm">
                {impresso > 0 ? (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    ✓ Caixa fechado. O cupom saiu na impressora da nota
                    {impresso > 1 ? " (" + impresso + " impressoras)" : ""}.
                  </p>
                ) : (
                  <p className="text-amber-600">
                    Caixa fechado, mas nenhuma impressora está marcada pra NFC-e na Central de
                    Impressões — abri a janela de impressão do navegador.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setMsgImp("Enviando…");
                      start(async () => {
                        const rr = await reimprimirFechamento(caixaId);
                        setMsgImp(rr.ok ? "✓ Enviado de novo." : rr.mensagem);
                      });
                    }}
                    disabled={proc}
                    className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs"
                  >
                    <Icone nome="imprimir" tamanho={15} className="mr-1.5" /> Imprimir de novo
                  </button>
                  <button
                    onClick={() => { try { window.print(); } catch {} }}
                    className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs text-texto-suave"
                  >
                    Imprimir pelo navegador
                  </button>
                  {msgImp && <span className="self-center text-xs text-texto-suave">{msgImp}</span>}
                </div>
              </div>
            )}
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
