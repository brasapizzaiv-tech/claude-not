"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarEtiqueta, criarItemEtiqueta } from "./actions";
import {
  SeletorItem, PreviewEtiqueta, Copias, TipoSelector, CamposExtras, EXTRAS_VAZIO, emDias, diasPadrao, conservacaoPadrao,
  type Extras, type ItemEtq, type CatEtq, type NovoItemDados,
} from "@/components/etiqueta-ui";
import type { EtiquetaConfig, EtiquetaDados, TipoEtiqueta } from "@/lib/etiqueta-tipos";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export type Imp = { id: string; nome: string; etiqueta_config: EtiquetaConfig | null };

export function EtiquetaForm({
  itens: itensIniciais,
  categorias,
  recentes,
  impressoras,
  responsavel,
}: {
  itens: ItemEtq[];
  categorias: CatEtq[];
  recentes: string[];
  impressoras: Imp[];
  responsavel: string;
}) {
  const router = useRouter();
  const [gerando, start] = useTransition();
  const [itens, setItens] = useState(itensIniciais);
  const [tipo, setTipo] = useState<TipoEtiqueta>("manipulacao");
  const [itemId, setItemId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  // Sempre o usuário logado (o servidor também ignora qualquer outro nome).
  const colaborador = responsavel;
  const [validade, setValidade] = useState("");
  const [extras, setExtras] = useState<Extras>(EXTRAS_VAZIO);
  const [copias, setCopias] = useState(1);
  const [impressoraId, setImpressoraId] = useState(impressoras[0]?.id ?? "");

  const livre = tipo === "livre";
  const item = itens.find((i) => i.id === itemId);
  const config = impressoras.find((i) => i.id === impressoraId)?.etiqueta_config ?? null;

  function recalc(id: string, cons: string, t: TipoEtiqueta = tipo) {
    const d = diasPadrao(itens.find((x) => x.id === id), cons, t);
    if (d) setValidade(emDias(d));
  }
  function mudarTipo(t: TipoEtiqueta) {
    setTipo(t);
    const cons = t === "descongelamento" ? "resfriado" : conservacao;
    if (t === "descongelamento") setConservacao("resfriado");
    if (t === "livre") { setValidade(""); return; }
    recalc(itemId, cons, t);
  }
  async function novoItem(d: NovoItemDados) {
    const criado = await criarItemEtiqueta(d);
    if (!criado) return null;
    const it = criado as ItemEtq;
    setItens((s) => [...s, it].sort((a, b) => a.nome.localeCompare(b.nome)));
    // o item ainda não está na lista do render atual — calcula a validade direto dele
    const dias = diasPadrao(it, conservacao, tipo);
    if (dias) setValidade(emDias(dias));
    return it;
  }

  const preview: EtiquetaDados = {
    id: "",
    numero: 0,
    produto: livre ? titulo : (item?.nome ?? ""),
    colaborador: colaborador || null,
    manipuladoEm: new Date().toISOString(),
    validade: validade || null,
    conservacao: livre ? null : conservacao,
    quantidade: !livre && quantidade.trim() ? Number(quantidade.replace(",", ".")) || null : null,
    unidade,
    tipo,
    categoria: categorias.find((c) => c.id === item?.categoria_id)?.nome ?? null,
    marca: extras.marca || null,
    lote: extras.lote || null,
    validadeOriginal: extras.validadeOriginal || null,
    sif: extras.sif || null,
    texto: livre ? texto : null,
  };
  const pronto = livre ? !!titulo.trim() : !!itemId;

  function gerar() {
    if (!pronto) return;
    start(async () => {
      const r = await criarEtiqueta({
        tipo,
        item_id: livre ? undefined : itemId,
        titulo,
        texto,
        colaborador_nome: colaborador,
        validade,
        conservacao: livre ? "" : conservacao,
        quantidade: livre ? "" : quantidade,
        unidade,
        marca: extras.marca,
        lote: extras.lote,
        validade_original: extras.validadeOriginal,
        sif: extras.sif,
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
            <label className="mb-1 block text-xs text-zinc-500">Tipo</label>
            <TipoSelector value={tipo} onChange={mudarTipo} />
          </div>

          {livre ? (
            <>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">Título</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reservado — evento sábado" className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">Texto (opcional)</label>
                <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 200))} placeholder="Até 200 caracteres" className={input} />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-500">Item</label>
              <SeletorItem
                itens={itens}
                categorias={categorias}
                recentes={recentes}
                value={itemId}
                onChange={(v) => {
                  setItemId(v);
                  const it = itens.find((x) => x.id === v);
                  if (it?.unidade) setUnidade(it.unidade);
                  const cons = tipo === "descongelamento" ? "resfriado" : conservacaoPadrao(it, conservacao);
                  setConservacao(cons);
                  recalc(v, cons);
                }}
                onNovo={novoItem}
              />
            </div>
          )}

          {!livre && (
            <>
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
            </>
          )}

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Responsável (usuário logado)</label>
            <div className={`${input} cursor-not-allowed bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300`} title="Sempre quem está logado">
              🔒 {colaborador || "—"}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{tipo === "descongelamento" ? "Usar até" : livre ? "Válido até (opcional)" : "Validade"}</label>
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={input} />
            {!livre && item && !diasPadrao(item, conservacao, tipo) && (
              <p className="mt-1 text-[11px] text-amber-600">Este item não tem validade cadastrada pra {conservacao} — informe a data.</p>
            )}
          </div>

          {!livre && (
            <div className="sm:col-span-2">
              <CamposExtras value={extras} onChange={setExtras} />
            </div>
          )}

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
          <PreviewEtiqueta d={preview} config={config} />
          <Copias value={copias} onChange={setCopias} />
        </div>
      </div>
      <button
        onClick={gerar}
        disabled={gerando || !pronto}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {gerando ? "Gerando..." : copias > 1 ? `Gerar e imprimir ${copias}×` : "Gerar etiqueta"}
      </button>
    </div>
  );
}
