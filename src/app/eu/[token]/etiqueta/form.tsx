"use client";

import { useState, useTransition } from "react";
import { criarEtiquetaColab, criarItemEtiquetaColab } from "../etiqueta-actions";
import {
  SeletorItem, PreviewEtiqueta, Copias, TipoSelector, CamposExtras, EXTRAS_VAZIO, emDias, diasPadrao, conservacaoPadrao, ValidadePresets, qtdValida,
  type Extras, type ItemEtq, type CatEtq, type NovoItemDados,
} from "@/components/etiqueta-ui";
import type { EtiquetaConfig, EtiquetaDados, TipoEtiqueta } from "@/lib/etiqueta-tipos";

const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function EtiquetaColabForm({
  token,
  nome,
  itens: itensIniciais,
  categorias,
  recentes,
  config,
}: {
  token: string;
  nome: string;
  itens: ItemEtq[];
  categorias: CatEtq[];
  recentes: string[];
  config: EtiquetaConfig | null;
}) {
  const [proc, start] = useTransition();
  const [itens, setItens] = useState(itensIniciais);
  const [tipo, setTipo] = useState<TipoEtiqueta>("manipulacao");
  const [itemId, setItemId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [conservacao, setConservacao] = useState("resfriado");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [validade, setValidade] = useState("");
  const [extras, setExtras] = useState<Extras>(EXTRAS_VAZIO);
  const [copias, setCopias] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const livre = tipo === "livre";
  const item = itens.find((i) => i.id === itemId);

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
    const criado = await criarItemEtiquetaColab(token, d);
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
    colaborador: nome,
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
  const pronto = livre ? !!titulo.trim() : !!itemId && qtdValida(quantidade) && !!validade;

  function gerar() {
    if (!pronto) return;
    start(async () => {
      const r = await criarEtiquetaColab(token, {
        tipo,
        item_id: livre ? "" : itemId,
        titulo,
        texto,
        conservacao: livre ? "" : conservacao,
        quantidade: livre ? "" : quantidade,
        unidade,
        validade,
        marca: extras.marca,
        lote: extras.lote,
        validade_original: extras.validadeOriginal,
        sif: extras.sif,
        copias,
      });
      if (r.ok) {
        setToast(copias > 1 ? `${copias} etiquetas saindo na impressora 🖨️` : "Etiqueta gerada! Saindo na impressora 🖨️");
        setItemId(""); setTitulo(""); setTexto(""); setQuantidade(""); setValidade(""); setExtras(EXTRAS_VAZIO); setCopias(1);
        setTimeout(() => setToast(null), 2500);
      } else {
        setToast(r.mensagem || "Não foi possível.");
        setTimeout(() => setToast(null), 3000);
      }
    });
  }

  const mostrarResto = livre ? !!titulo.trim() : !!itemId;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Tipo</label>
        <TipoSelector value={tipo} onChange={mudarTipo} />
      </div>

      {livre ? (
        <>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reservado — evento sábado" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Texto (opcional)</label>
            <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 200))} placeholder="Até 200 caracteres" className={input} />
          </div>
        </>
      ) : (
        <div>
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

      {mostrarResto && (
        <>
          {!livre && (
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
                  <label className="mb-1 block text-xs text-zinc-500">Quantidade *</label>
                  <input
                    inputMode="decimal"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    placeholder="ex.: 1,5"
                    className={`${input} ${quantidade && !qtdValida(quantidade) ? "border-red-400" : ""}`}
                  />
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
            <label className="mb-1 block text-xs text-zinc-500">{tipo === "descongelamento" ? "Usar até *" : livre ? "Válido até (opcional)" : "Validade *"}</label>
            <ValidadePresets value={validade} onChange={setValidade} />
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={`${input} mt-2`} />
            {!livre && item && !diasPadrao(item, conservacao, tipo) && !validade && (
              <p className="mt-1 text-[11px] text-amber-600">Este item não tem validade cadastrada pra {conservacao} — escolha acima.</p>
            )}
          </div>
          {!livre && <CamposExtras value={extras} onChange={setExtras} />}

          <div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Assim vai sair</p>
            <PreviewEtiqueta d={preview} config={config} />
            <div className="mt-3 flex justify-center">
              <Copias value={copias} onChange={setCopias} />
            </div>
          </div>

          <button
            onClick={gerar}
            disabled={proc || !pronto}
            className="w-full rounded-xl bg-orange-500 py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {proc ? "Gerando..." : copias > 1 ? `🖨️ Imprimir ${copias} etiquetas` : "🖨️ Imprimir etiqueta"}
          </button>
          {!pronto && !livre && (
            <p className="text-center text-xs text-zinc-500">Falta: {[!qtdValida(quantidade) && "quantidade", !validade && "validade"].filter(Boolean).join(" e ")}.</p>
          )}
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
