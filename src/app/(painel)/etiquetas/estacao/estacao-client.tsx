"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EtiquetaLabel, ESTILO_IMPRESSAO, type DadosEtiqueta } from "../[id]/impressao";
import { proximaEtiquetaParaImprimir, marcarEtiquetaImpressa } from "../actions";

export function EstacaoClient({ impressoraId, nome }: { impressoraId: string; nome: string }) {
  const [ativa, setAtiva] = useState(true);
  const [atual, setAtual] = useState<DadosEtiqueta | null>(null);
  const [contador, setContador] = useState(0);
  const [ultimo, setUltimo] = useState<string | null>(null);

  const ativaRef = useRef(ativa);
  const ocupadoRef = useRef(false);
  const impressoRef = useRef<string | null>(null);
  useEffect(() => { ativaRef.current = ativa; }, [ativa]);

  // Busca a próxima etiqueta pendente desta impressora quando está livre.
  useEffect(() => {
    const t = setInterval(async () => {
      if (!ativaRef.current || ocupadoRef.current || atual) return;
      ocupadoRef.current = true;
      try {
        const prox = await proximaEtiquetaParaImprimir(impressoraId);
        if (prox) { impressoRef.current = null; setAtual(prox); }
      } catch {
        /* ignora falha de rede; tenta de novo no próximo ciclo */
      } finally {
        ocupadoRef.current = false;
      }
    }, 2500);
    return () => clearInterval(t);
  }, [atual, impressoraId]);

  // Quando a etiqueta terminou de renderizar (QR pronto), imprime e dá baixa.
  const aoRenderizar = useCallback(async () => {
    if (!atual || impressoRef.current === atual.id) return;
    impressoRef.current = atual.id;
    ocupadoRef.current = true;
    await new Promise((r) => setTimeout(r, 250));
    try {
      window.print();
      await marcarEtiquetaImpressa(atual.id);
      setContador((c) => c + 1);
      setUltimo(`${atual.produto} · Nº ${atual.numero}`);
    } catch {
      /* se falhar, deixa para reimprimir manualmente */
    } finally {
      setAtual(null);
      ocupadoRef.current = false;
    }
  }, [atual]);

  return (
    <div className="mx-auto max-w-lg p-6">
      <style>{ESTILO_IMPRESSAO}</style>

      <div className="print:hidden">
        <Link href="/etiquetas/estacao" className="text-sm text-zinc-500 hover:text-orange-600">← Estações</Link>

        <div className="mt-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-400">Estação de impressão</div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">🖨️ {nome}</h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${ativa ? "bg-emerald-500/15 text-emerald-600" : "bg-zinc-500/15 text-zinc-500"}`}>
              {ativa ? (atual ? "Imprimindo…" : "Ativa") : "Pausada"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-zinc-400">Impressas nesta sessão</div>
              <div className="text-xl font-bold">{contador}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-zinc-400">Última</div>
              <div className="truncate font-medium">{ultimo ?? "—"}</div>
            </div>
          </div>

          <button
            onClick={() => setAtiva((v) => !v)}
            className={`mt-4 w-full rounded-xl py-3 text-sm font-bold text-white ${ativa ? "bg-zinc-700" : "bg-emerald-600"}`}
          >
            {ativa ? "Pausar impressão" : "Retomar impressão"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-zinc-600 dark:text-zinc-300">
          <p className="mb-1 font-semibold text-amber-700 dark:text-amber-400">Para imprimir sozinho (sem a janela toda vez):</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>Deixe a <b>Elgin</b> como impressora <b>padrão</b> deste PC.</li>
            <li>Abra esta página no <b>Chrome</b> iniciado com a opção <b>--kiosk-printing</b> (imprime direto).</li>
            <li>Deixe esta aba <b>aberta</b> nesse PC. Pode minimizar.</li>
          </ol>
          <p className="mt-2 text-xs text-zinc-400">Sem o modo de impressão direta, vai aparecer a janela do Chrome a cada etiqueta.</p>
        </div>
      </div>

      {/* Etiqueta atual (é o que a impressora imprime) */}
      {atual && (
        <div className="mt-4 flex justify-center print:mt-0">
          <div className="border border-zinc-200 print:border-0 dark:border-zinc-800">
            <EtiquetaLabel d={atual} onReady={aoRenderizar} />
          </div>
        </div>
      )}
    </div>
  );
}
