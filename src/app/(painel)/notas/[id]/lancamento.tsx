"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lancarNota, estornarNota, vincularFornecedorNota } from "../actions";

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function LancamentoNota({
  notaId,
  situacao,
  fornecedorId,
  fornecedorNome,
  emitCnpj,
  vencimento,
  competenciaInicial,
  fornecedores,
}: {
  notaId: string;
  situacao: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  emitCnpj: string | null;
  vencimento: string | null;
  competenciaInicial: string;
  fornecedores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [venc, setVenc] = useState(vencimento ?? "");
  const [comp, setComp] = useState(competenciaInicial);
  const [fornSel, setFornSel] = useState(fornecedorId ?? "");
  const [trocando, setTrocando] = useState(false);

  const lancada = situacao === "lancada";

  function vincularForn() {
    start(async () => {
      await vincularFornecedorNota(notaId, fornSel || null);
      setTrocando(false);
      router.refresh();
    });
  }
  function lancar() {
    start(async () => {
      await lancarNota(notaId, { vencimento: venc || null, competencia: comp || null });
      router.refresh();
    });
  }
  function estornar() {
    start(async () => {
      await estornarNota(notaId);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Lançar no financeiro
      </h2>

      {/* Fornecedor */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Fornecedor</label>
        {fornecedorId && !trocando ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓ {fornecedorNome}
            </span>
            <button
              onClick={() => setTrocando(true)}
              className="text-xs text-zinc-400 hover:text-orange-600"
            >
              trocar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!fornecedorId && (
              <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Não reconheci o fornecedor pelo CNPJ ({emitCnpj || "?"}). Escolha
                abaixo (e cadastre esse CNPJ no fornecedor para reconhecer as
                próximas).
              </p>
            )}
            <select
              value={fornSel}
              onChange={(e) => setFornSel(e.target.value)}
              className={`${campo} min-w-56 flex-1`}
            >
              <option value="">Selecione o fornecedor...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <button
              onClick={vincularForn}
              disabled={proc}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
            >
              Vincular
            </button>
          </div>
        )}
      </div>

      {/* Vencimento + Competência */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Vencimento do boleto</label>
          <input
            type="date"
            value={venc}
            disabled={lancada}
            onChange={(e) => setVenc(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Competência (mês)</label>
          <input
            type="month"
            value={comp}
            disabled={lancada}
            onChange={(e) => setComp(e.target.value)}
            className={campo}
          />
        </div>
      </div>

      {/* Ação */}
      <div className="flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {lancada ? (
          <>
            <span className="text-sm font-medium text-green-600">✓ Lançada no financeiro</span>
            <button
              onClick={estornar}
              disabled={proc}
              className="text-sm text-zinc-400 hover:text-amber-600 disabled:opacity-60"
            >
              Estornar
            </button>
          </>
        ) : (
          <button
            onClick={lancar}
            disabled={proc || !fornecedorId}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            title={!fornecedorId ? "Vincule o fornecedor primeiro" : ""}
          >
            {proc ? "Lançando..." : "Lançar no financeiro"}
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-400">
        Dica: vincule cada item ao produto certo (abaixo) para o CMV cair na
        categoria do DRE. Sem vínculo, vai tudo para “Compras”.
      </p>
    </div>
  );
}
