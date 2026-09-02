"use client";

import { useState, useTransition } from "react";
import { criarEtiquetaColab, criarItemEtiquetaColab } from "../etiqueta-actions";
import { SeletorItem, PreviewEtiqueta, Copias, type ItemEtq, type CatEtq, type NovoItemDados } from "@/components/etiqueta-ui";

const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function EtiquetaColabForm({
  token,
  nome,
  itens: itensIniciais,
  categorias,
  recentes,
}: {
  token: string;
  nome: string;
  itens: ItemEtq[];
  categorias: CatEtq[];
  recentes: string[];
}) {
  const [proc, start] = useTransition();
  const [itens, setItens] = useState(itensIniciais);
  const [itemId, setItemId] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [validade, setValidade] = useState("");
  const [copias, setCopias] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const item = itens.find((i) => i.id === itemId);

  function diasDe(p: ItemEtq | undefined, cons: string) {
    if (!p) return null;
    return cons === "congelado" ? p.validade_congelado : cons === "ambiente" ? p.validade_ambiente : p.validade_resfriado;
  }
  function recalc(id: string, cons: string) {
    const d = diasDe(itens.find((x) => x.id === id), cons);
    if (d) setValidade(emDias(d));
  }
  async function novoItem(d: NovoItemDados) {
    const criado = await criarItemEtiquetaColab(token, d);
    if (!criado) return null;
    const it = criado as ItemEtq;
    setItens((s) => [...s, it].sort((a, b) => a.nome.localeCompare(b.nome)));
    // o item ainda não está na lista do render atual — calcula a validade direto dele
    const dias = diasDe(it, conservacao);
    if (dias) setValidade(emDias(dias));
    return it;
  }

  function gerar() {
    if (!itemId) return;
    start(async () => {
      const r = await criarEtiquetaColab(token, { item_id: itemId, conservacao, quantidade, unidade, validade, copias });
      if (r.ok) {
        setToast(copias > 1 ? `${copias} etiquetas saindo na impressora 🖨️` : "Etiqueta gerada! Saindo na impressora 🖨️");
        setItemId(""); setQuantidade(""); setValidade(""); setCopias(1);
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
        <label className="mb-1 block text-xs text-zinc-500">Item</label>
        <SeletorItem
          itens={itens}
          categorias={categorias}
          recentes={recentes}
          value={itemId}
          onChange={(v) => { setItemId(v); recalc(v, conservacao); }}
          onNovo={novoItem}
        />
      </div>

      {itemId && (
        <>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Conservação</label>
            <div className="grid grid-cols-3 gap-2">
              {[["resfriado", "🧊 Resfriado"], ["congelado", "❄️ Congelado"], ["ambiente", "🌡️ Ambiente"]].map(([v, lab]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setConservacao(v); recalc(itemId, v); }}
                  className={`rounded-xl border py-2.5 text-sm font-semibold ${conservacao === v ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"}`}
                >
                  {lab}
                </button>
              ))}
            </div>
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
            {item && !diasDe(item, conservacao) && (
              <p className="mt-1 text-[11px] text-amber-600">Este item não tem validade cadastrada pra {conservacao} — informe a data.</p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Assim vai sair</p>
            <PreviewEtiqueta produto={item?.nome ?? ""} conservacao={conservacao} quantidade={quantidade} unidade={unidade} validade={validade} colaborador={nome} />
            <div className="mt-3 flex justify-center">
              <Copias value={copias} onChange={setCopias} />
            </div>
          </div>

          <button
            onClick={gerar}
            disabled={proc || !itemId}
            className="w-full rounded-xl bg-orange-500 py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {proc ? "Gerando..." : copias > 1 ? `🖨️ Imprimir ${copias} etiquetas` : "🖨️ Imprimir etiqueta"}
          </button>
        </>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
