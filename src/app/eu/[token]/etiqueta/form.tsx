"use client";

import { useState, useTransition } from "react";
import { Combobox } from "@/components/combobox";
import { criarEtiquetaColab } from "../etiqueta-actions";

export type ProdEtq = {
  id: string;
  nome: string;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
};

const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function EtiquetaColabForm({ token, produtos }: { token: string; produtos: ProdEtq[] }) {
  const [proc, start] = useTransition();
  const [produtoId, setProdutoId] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [validade, setValidade] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function diasDe(p: ProdEtq | undefined, cons: string) {
    if (!p) return null;
    return cons === "congelado" ? p.validade_congelado : cons === "ambiente" ? p.validade_ambiente : p.validade_resfriado;
  }
  function recalc(pid: string, cons: string) {
    const dias = diasDe(produtos.find((x) => x.id === pid), cons);
    if (dias) setValidade(emDias(dias));
  }

  function gerar() {
    if (!produtoId) return;
    start(async () => {
      const r = await criarEtiquetaColab(token, { produto_id: produtoId, conservacao, quantidade, unidade, validade });
      if (r.ok) {
        setToast("Etiqueta gerada! Saindo na impressora 🖨️");
        setProdutoId(""); setQuantidade(""); setValidade("");
        setTimeout(() => setToast(null), 2500);
      } else {
        setToast(r.mensagem || "Não foi possível.");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Produto</label>
        <Combobox
          options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
          value={produtoId}
          onChange={(v) => { setProdutoId(v); recalc(v, conservacao); }}
          placeholder="Buscar produto..."
          className={input}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Conservação</label>
        <select value={conservacao} onChange={(e) => { setConservacao(e.target.value); recalc(produtoId, e.target.value); }} className={input}>
          <option value="congelado">Congelado</option>
          <option value="resfriado">Resfriado</option>
          <option value="ambiente">Ambiente</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Quantidade</label>
          <input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="opcional" className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={input}>
            <option value="un">und</option>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Validade</label>
        <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={input} />
      </div>
      <button
        onClick={gerar}
        disabled={proc || !produtoId}
        className="w-full rounded-xl bg-orange-500 py-3 text-base font-bold text-white disabled:opacity-50"
      >
        {proc ? "Gerando..." : "🖨️ Gerar etiqueta"}
      </button>

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
