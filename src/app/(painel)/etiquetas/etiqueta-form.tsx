"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarEtiqueta, criarItemEtiqueta } from "./actions";
import { SeletorItem, PreviewEtiqueta, Copias, type ItemEtq, type CatEtq, type NovoItemDados } from "@/components/etiqueta-ui";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function EtiquetaForm({
  itens: itensIniciais,
  categorias,
  recentes,
  colaboradores,
  impressoras,
}: {
  itens: ItemEtq[];
  categorias: CatEtq[];
  recentes: string[];
  colaboradores: { nome: string }[];
  impressoras: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [gerando, start] = useTransition();
  const [itens, setItens] = useState(itensIniciais);
  const [itemId, setItemId] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [colaborador, setColaborador] = useState("");
  const [validade, setValidade] = useState("");
  const [copias, setCopias] = useState(1);
  const [impressoraId, setImpressoraId] = useState(impressoras[0]?.id ?? "");

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
    const criado = await criarItemEtiqueta(d);
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
      const r = await criarEtiqueta({
        item_id: itemId,
        colaborador_nome: colaborador,
        validade,
        conservacao,
        quantidade,
        unidade,
        impressora_id: impressoraId || undefined,
        copias,
      });
      if (r?.ok && r.id) router.push(`/etiquetas/${r.id}`);
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-50">Nova etiqueta</h2>
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
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

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Conservação</label>
            <select
              value={conservacao}
              onChange={(e) => { setConservacao(e.target.value); recalc(itemId, e.target.value); }}
              className={input}
            >
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
            <label className="mb-1 block text-xs text-zinc-500">Quem manipulou</label>
            <input list="colabs" value={colaborador} onChange={(e) => setColaborador(e.target.value)} placeholder="nome" className={input} />
            <datalist id="colabs">
              {colaboradores.map((c) => (
                <option key={c.nome} value={c.nome} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Validade</label>
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={input} />
            {item && !diasDe(item, conservacao) && (
              <p className="mt-1 text-[11px] text-amber-600">Este item não tem validade cadastrada pra {conservacao} — informe a data.</p>
            )}
          </div>

          {impressoras.length > 1 && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-500">Imprimir na</label>
              <select value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)} className={input}>
                {impressoras.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Pré-visualização</p>
          <PreviewEtiqueta produto={item?.nome ?? ""} conservacao={conservacao} quantidade={quantidade} unidade={unidade} validade={validade} colaborador={colaborador} />
          <Copias value={copias} onChange={setCopias} />
        </div>
      </div>
      <button
        onClick={gerar}
        disabled={gerando || !itemId}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {gerando ? "Gerando..." : copias > 1 ? `Gerar e imprimir ${copias}×` : "Gerar etiqueta"}
      </button>
    </div>
  );
}
