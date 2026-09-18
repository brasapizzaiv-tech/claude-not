"use client";

// Cadastro dos modelos de checklist: setores (lista editável), listas por setor
// e momento, e os itens de cada lista (arrastar pra reordenar).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DIAS_CURTO, MOMENTOS, ROTULO_MOMENTO, ROTULO_SERVICO, ROTULO_TIPO, SERVICOS, TIPOS_ITEM,
  type Modelo, type ModeloItem, type Momento, type Setor, type TipoItem,
} from "@/lib/checklists-core";
import {
  alternarModelo, alternarSetor, excluirItemModelo, excluirModelo, moverSetor,
  reordenarItens, salvarItemModelo, salvarModelo, salvarSetor,
} from "../actions";

const inputCls = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const btnSec = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`;

export function ModelosClient({ setores, modelos, itens }: { setores: Setor[]; modelos: Modelo[]; itens: ModeloItem[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [verSetores, setVerSetores] = useState(false);
  const [editando, setEditando] = useState<Modelo | "novo" | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const ativos = setores.filter((s) => s.ativo);
  const itensDe = (modeloId: string) => itens.filter((i) => i.modelo_id === modeloId).sort((a, b) => a.ordem - b.ordem);

  function agir<T>(fn: () => Promise<T & { ok?: boolean; mensagem?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r && r.ok === false) { setMsg(r.mensagem ?? "Não consegui salvar."); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}

      {/* Setores */}
      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Setores</p>
          <button onClick={() => setVerSetores((v) => !v)} className="text-xs text-zinc-500 underline">
            {verSetores ? "fechar" : "editar setores"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {setores.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${s.ativo ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400 line-through"}`} style={{ background: (s.cor ?? "#888") + "22", border: `2px solid ${s.cor ?? "#888"}` }}>
              {s.nome}
              {verSetores && (
                <>
                  <button onClick={() => agir(() => moverSetor(s.id, -1))} disabled={proc} className="text-xs text-zinc-400 hover:text-zinc-700">↑</button>
                  <button onClick={() => agir(() => moverSetor(s.id, 1))} disabled={proc} className="text-xs text-zinc-400 hover:text-zinc-700">↓</button>
                  <button onClick={() => agir(() => alternarSetor(s.id, !s.ativo))} disabled={proc} className="text-xs text-zinc-400 hover:text-orange-600">
                    {s.ativo ? "desativar" : "ativar"}
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        {verSetores && <NovoSetor onSalvar={(nome, cor) => agir(() => salvarSetor({ nome, cor }))} proc={proc} />}
      </div>

      {/* Listas por setor */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Listas</p>
        <button onClick={() => setEditando("novo")} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          + Nova lista
        </button>
      </div>

      {ativos.map((s) => {
        const doSetor = modelos.filter((m) => m.setor_id === s.id);
        if (doSetor.length === 0) return null;
        return (
          <div key={s.id}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: s.cor ?? "#888" }}>{s.nome}</p>
            <div className="space-y-2">
              {MOMENTOS.flatMap((mom) => doSetor.filter((m) => m.momento === mom)).map((m) => {
                const lista = itensDe(m.id);
                const obrig = lista.filter((i) => i.obrigatorio).length;
                const fotos = lista.filter((i) => i.exige_foto).length;
                return (
                  <div key={m.id} className={`rounded-2xl border p-4 ${m.ativo ? "border-zinc-200 dark:border-zinc-800" : "border-dashed border-zinc-300 opacity-60 dark:border-zinc-700"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {m.nome}
                          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {ROTULO_MOMENTO[m.momento]}
                          </span>
                          {!m.ativo && <span className="ml-2 text-xs text-zinc-400">inativa</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {lista.length} item(ns) · {obrig} obrigatório(s) · {fotos} com foto ·{" "}
                          {m.dias.length === 0 && m.servicos.length === 0
                            ? "todo dia"
                            : [
                                m.dias.length > 0 ? m.dias.sort().map((d) => DIAS_CURTO[d]).join(", ") : "",
                                m.servicos.length > 0 ? m.servicos.map((x) => ROTULO_SERVICO[x as keyof typeof ROTULO_SERVICO] ?? x).join(", ") : "",
                              ].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => setAberto(aberto === m.id ? null : m.id)} className={btnSec}>
                          {aberto === m.id ? "fechar itens" : `itens (${lista.length})`}
                        </button>
                        <button onClick={() => setEditando(m)} className={btnSec}>Editar</button>
                        <button onClick={() => agir(() => alternarModelo(m.id, !m.ativo))} disabled={proc} className={btnSec}>
                          {m.ativo ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Apagar a lista "${m.nome}"?`)) agir(() => excluirModelo(m.id)); }}
                          disabled={proc}
                          className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-red-600"
                        >
                          Apagar
                        </button>
                      </div>
                    </div>
                    {aberto === m.id && <ItensDoModelo modeloId={m.id} itens={lista} proc={proc} agir={agir} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {editando && (
        <ModeloModal
          modelo={editando === "novo" ? null : editando}
          setores={ativos}
          onClose={() => setEditando(null)}
          onSalvar={(input) => { agir(() => salvarModelo(input)); setEditando(null); }}
          proc={proc}
        />
      )}
    </div>
  );
}

function NovoSetor({ onSalvar, proc }: { onSalvar: (nome: string, cor: string) => void; proc: boolean }) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#C78340");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Novo setor</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Forno" className={`${inputCls} w-40`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Cor</label>
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-14 rounded border border-zinc-300 dark:border-zinc-700" />
      </div>
      <button
        onClick={() => { if (nome.trim().length >= 2) { onSalvar(nome, cor); setNome(""); } }}
        disabled={proc || nome.trim().length < 2}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-zinc-700"
      >
        Adicionar
      </button>
    </div>
  );
}

// Itens: lista arrastável + formulário de novo item.
function ItensDoModelo({
  modeloId, itens, proc, agir,
}: {
  modeloId: string; itens: ModeloItem[]; proc: boolean;
  agir: <T>(fn: () => Promise<T & { ok?: boolean; mensagem?: string }>) => void;
}) {
  const [ordem, setOrdem] = useState<string[]>(itens.map((i) => i.id));
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ModeloItem | "novo" | null>(null);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const atual = ordem.filter((id) => porId.has(id));
  for (const i of itens) if (!atual.includes(i.id)) atual.push(i.id);

  function soltar(alvoId: string) {
    if (!arrastando || arrastando === alvoId) return;
    const nova = atual.filter((id) => id !== arrastando);
    const pos = nova.indexOf(alvoId);
    nova.splice(pos, 0, arrastando);
    setOrdem(nova);
    setArrastando(null);
    agir(() => reordenarItens(modeloId, nova));
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <ul className="space-y-1">
        {atual.map((id, n) => {
          const i = porId.get(id)!;
          return (
            <li
              key={id}
              draggable
              onDragStart={() => setArrastando(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(id)}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${arrastando === id ? "opacity-40" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
            >
              <span className="cursor-grab select-none pt-0.5 text-zinc-300 dark:text-zinc-600" title="Arraste para reordenar">⠿</span>
              <span className="w-5 pt-0.5 text-right text-xs text-zinc-400">{n + 1}</span>
              <span className="flex-1">
                {i.secao && <span className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">{i.secao}</span>}
                <span className="text-zinc-800 dark:text-zinc-100">{i.texto}</span>
                <span className="ml-2 text-[11px] text-zinc-400">{ROTULO_TIPO[i.tipo]}</span>
                {i.obrigatorio && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">obrigatório</span>}
                {i.exige_foto && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">foto</span>}
                {i.instrucao && <span className="block text-xs text-zinc-400">{i.instrucao}</span>}
              </span>
              <button onClick={() => setEditItem(i)} className="text-xs text-orange-600 hover:underline">editar</button>
              <button
                onClick={() => { if (confirm(`Tirar "${i.texto}" da lista?`)) agir(() => excluirItemModelo(i.id)); }}
                disabled={proc}
                className="text-xs text-zinc-300 hover:text-red-600 dark:text-zinc-600"
              >
                ✕
              </button>
            </li>
          );
        })}
        {atual.length === 0 && <li className="px-2 py-3 text-sm text-zinc-400">Nenhum item ainda.</li>}
      </ul>
      <button onClick={() => setEditItem("novo")} className="mt-2 text-sm font-medium text-orange-600 hover:underline">+ adicionar item</button>
      {editItem && (
        <ItemModal
          item={editItem === "novo" ? null : editItem}
          onClose={() => setEditItem(null)}
          onSalvar={(input) => { agir(() => salvarItemModelo({ ...input, modelo_id: modeloId })); setEditItem(null); }}
          proc={proc}
        />
      )}
    </div>
  );
}

function ModeloModal({
  modelo, setores, onClose, onSalvar, proc,
}: {
  modelo: Modelo | null; setores: Setor[]; onClose: () => void;
  onSalvar: (input: { id?: string; nome: string; setor_id: string; momento: Momento; dias: number[]; servicos: string[] }) => void;
  proc: boolean;
}) {
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [setorId, setSetorId] = useState(modelo?.setor_id ?? setores[0]?.id ?? "");
  const [momento, setMomento] = useState<Momento>(modelo?.momento ?? "abertura");
  const [dias, setDias] = useState<number[]>(modelo?.dias ?? []);
  const [servicos, setServicos] = useState<string[]>(modelo?.servicos ?? []);
  const alternar = <T,>(lista: T[], v: T, set: (x: T[]) => void) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-50">{modelo ? "Editar lista" : "Nova lista"}</h2>
        <label className="mb-1 block text-xs text-zinc-500">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fechamento do salão" className={`${inputCls} w-full`} autoFocus />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Setor</label>
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} className={`${inputCls} w-full`}>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Momento</label>
            <select value={momento} onChange={(e) => setMomento(e.target.value as Momento)} className={`${inputCls} w-full`}>
              {MOMENTOS.map((m) => <option key={m} value={m}>{ROTULO_MOMENTO[m]}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-500">Quando vale (sem marcar nada, vale todo dia)</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DIAS_CURTO.map((d, n) => (
            <button key={n} type="button" onClick={() => alternar(dias, n, setDias)} className={chip(dias.includes(n))}>{d}</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SERVICOS.map((s) => (
            <button key={s} type="button" onClick={() => alternar(servicos, s as string, setServicos)} className={chip(servicos.includes(s))}>
              {ROTULO_SERVICO[s]}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Cancelar</button>
          <button
            onClick={() => onSalvar({ id: modelo?.id, nome, setor_id: setorId, momento, dias, servicos })}
            disabled={proc || nome.trim().length < 2 || !setorId}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemModal({
  item, onClose, onSalvar, proc,
}: {
  item: ModeloItem | null; onClose: () => void;
  onSalvar: (input: { id?: string; texto: string; instrucao: string | null; secao: string | null; tipo: TipoItem; exige_foto: boolean; obrigatorio: boolean }) => void;
  proc: boolean;
}) {
  const [texto, setTexto] = useState(item?.texto ?? "");
  const [secao, setSecao] = useState(item?.secao ?? "");
  const [instrucao, setInstrucao] = useState(item?.instrucao ?? "");
  const [tipo, setTipo] = useState<TipoItem>(item?.tipo ?? "feito");
  const [foto, setFoto] = useState(item?.exige_foto ?? false);
  const [obrig, setObrig] = useState(item?.obrigatorio ?? false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-50">{item ? "Editar item" : "Novo item"}</h2>
        <label className="mb-1 block text-xs text-zinc-500">Item</label>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Conferir banheiros" className={`${inputCls} w-full`} autoFocus />
        <label className="mt-3 mb-1 block text-xs text-zinc-500">Bloco (opcional — agrupa os itens, ex.: PREPARO)</label>
        <input value={secao} onChange={(e) => setSecao(e.target.value)} placeholder="Ex.: ANTES DE COMEÇAR" className={`${inputCls} w-full`} />
        <label className="mt-3 mb-1 block text-xs text-zinc-500">Instrução (opcional, aparece abaixo do item)</label>
        <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: conferir papel e sabonete" className={`${inputCls} w-full`} />
        <label className="mt-3 mb-1 block text-xs text-zinc-500">Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoItem)} className={`${inputCls} w-full`}>
          {TIPOS_ITEM.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" checked={foto} onChange={(e) => setFoto(e.target.checked)} /> Exigir foto
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} /> Obrigatório (precisa ser preenchido pra concluir)
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Cancelar</button>
          <button
            onClick={() => onSalvar({ id: item?.id, texto, instrucao: instrucao || null, secao: secao || null, tipo, exige_foto: foto, obrigatorio: obrig })}
            disabled={proc || texto.trim().length < 2}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
