"use client";
import { Icone } from "@/components/icone";

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
    <div className="mb-6 rounded-cartao border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-texto">
            <Icone nome="documento" tamanho={15} className="mr-1.5" /> Manifestar em lote
          </p>
          <p className="text-xs text-texto-suave">
            {notas.length} nota(s) em resumo — marque e manifeste várias de uma vez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={completar}
            disabled={proc}
            title="Puxa da SEFAZ o XML completo (com os itens) das notas já manifestadas"
            className="rounded-controle border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {proc ? "Buscando..." : "Buscar itens agora"}
          </button>
          <button
            onClick={() => setAberto((v) => !v)}
            className="rounded-controle border border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {aberto ? "Fechar" : "Selecionar notas"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              <input type="checkbox" checked={todos} onChange={toggleTodos} />
              Selecionar todas
            </label>
            {sel.size > 0 && (
              <button
                onClick={manifestar}
                disabled={proc}
                className="rounded-controle bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {proc ? "Manifestando..." : `Manifestar ${sel.size} selecionada(s)`}
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-controle border border-borda bg-painel-cartao">
            {notas.map((n) => (
              <label
                key={n.id}
                className="flex items-center gap-3 border-b border-borda px-3 py-2 text-sm last:border-0 hover:bg-superficie-suave /60"
              >
                <input
                  type="checkbox"
                  checked={sel.has(n.id)}
                  onChange={() => toggle(n.id)}
                />
                <span className="flex-1 text-texto">
                  {n.emit_nome ?? "—"}
                </span>
                <span className="text-xs text-texto-fraco">
                  NF {n.numero ?? "—"} ·{" "}
                  {n.data_emissao ? dataBR(n.data_emissao) : "—"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-texto-suave">{msg}</p>}
    </div>
  );
}
