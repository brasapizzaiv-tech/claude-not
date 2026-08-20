"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { manifestarVarias, completarItensAgora } from "./sefaz-actions";

type NotaResumo = {
  id: string;
  emit_nome: string | null;
  numero: string | null;
  data_emissao: string | null;
};

export function ManifestarLote({ notas }: { notas: NotaResumo[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  if (notas.length === 0) return null;

  const todos = notas.length > 0 && notas.every((n) => sel.has(n.id));
  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSel(todos ? new Set() : new Set(notas.map((n) => n.id)));
  }
  function manifestar() {
    const ids = [...sel];
    if (ids.length === 0) return;
    setMsg(null);
    start(async () => {
      const r = await manifestarVarias(ids);
      setMsg(
        `✓ ${r.manifestadas} manifestada(s)${r.erros ? `, ${r.erros} com erro` : ""}. ` +
          `${r.importadas} já vieram completas. A SEFAZ libera o XML (com os itens) aos poucos — ` +
          `o resto entra sozinho nos próximos minutos, ou clique em "Buscar itens agora".`,
      );
      setSel(new Set());
      router.refresh();
    });
  }
  function completar() {
    setMsg(null);
    start(async () => {
      const r = await completarItensAgora();
      if (r.erro) setMsg(`SEFAZ: ${r.erro}`);
      else
        setMsg(
          `✓ Busca feita: ${r.importadas ?? 0} nota(s) completa(s) e ${r.resumos ?? 0} resumo(s). ` +
            `Se ainda faltar item, a SEFAZ pode não ter liberado — tente de novo em alguns minutos.`,
        );
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            📄 Manifestar em lote
          </p>
          <p className="text-xs text-zinc-500">
            {notas.length} nota(s) em resumo — marque e manifeste várias de uma vez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={completar}
            disabled={proc}
            title="Puxa da SEFAZ o XML completo (com os itens) das notas já manifestadas"
            className="rounded-lg border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {proc ? "Buscando..." : "Buscar itens agora"}
          </button>
          <button
            onClick={() => setAberto((v) => !v)}
            className="rounded-lg border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {aberto ? "Fechar" : "Selecionar notas"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <input type="checkbox" checked={todos} onChange={toggleTodos} />
              Selecionar todas
            </label>
            {sel.size > 0 && (
              <button
                onClick={manifestar}
                disabled={proc}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {proc ? "Manifestando..." : `Manifestar ${sel.size} selecionada(s)`}
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            {notas.map((n) => (
              <label
                key={n.id}
                className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={sel.has(n.id)}
                  onChange={() => toggle(n.id)}
                />
                <span className="flex-1 text-zinc-800 dark:text-zinc-200">
                  {n.emit_nome ?? "—"}
                </span>
                <span className="text-xs text-zinc-400">
                  NF {n.numero ?? "—"} ·{" "}
                  {n.data_emissao ? dataBR(n.data_emissao) : "—"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
