"use client";

// Cadastro dos modelos de checklist: setores (lista editável), listas por setor
// e momento, e os itens de cada lista (arrastar pra reordenar).
import { useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import {
  DIAS_CURTO, MOMENTOS, ROTULO_MOMENTO, ROTULO_SERVICO, ROTULO_TIPO, SERVICOS, TIPOS_ITEM,
  type Modelo, type ModeloItem, type Momento, type Setor, type TipoItem,
} from "@/lib/checklists-core";
import {
  alternarModelo, alternarSetor, excluirItemModelo, excluirModelo, moverSetor,
  reordenarItens, salvarItemModelo, salvarModelo, salvarSetor,
} from "../actions";

const inputCls = "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";
const btnSec = "rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte  ";
// Valor literal porque <input type="color"> não aceita variável de CSS.
// Etapa 3: passa a vir da cor da empresa.
const COR_PRIMARIA = "#c78340"; // <input type="color"> não aceita variável de CSS; é só o valor inicial do seletor
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-orange-500 bg-orange-500 text-white" : "border-borda-forte text-texto-suave  "}`;

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
      {msg && <p className="rounded-controle bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}

      {/* Setores */}
      <div className="rounded-cartao border border-borda p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Setores</p>
          <button onClick={() => setVerSetores((v) => !v)} className="text-xs text-texto-suave underline">
            {verSetores ? "fechar" : "editar setores"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {setores.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${s.ativo ? "text-zinc-800 dark:text-zinc-100" : "text-texto-fraco line-through"}`} style={{ background: (s.cor ?? "#888") + "22", border: `2px solid ${s.cor ?? "#888"}` }}>
              {s.nome}
              {verSetores && (
                <>
                  <button onClick={() => agir(() => moverSetor(s.id, -1))} disabled={proc} className="text-xs text-texto-fraco hover:text-texto-suave">↑</button>
                  <button onClick={() => agir(() => moverSetor(s.id, 1))} disabled={proc} className="text-xs text-texto-fraco hover:text-texto-suave">↓</button>
                  <button onClick={() => agir(() => alternarSetor(s.id, !s.ativo))} disabled={proc} className="text-xs text-texto-fraco hover:text-orange-600">
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
        <button onClick={() => setEditando("novo")} className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
          + Nova lista
        </button>
      </div>

      {ativos.map((s) => {
        const doSetor = modelos.filter((m) => m.setor_id === s.id);
        if (doSetor.length === 0) return null;
        return (
          <div key={s.id}>
            <p className="mb-2 text-xs font-bold" style={{ color: s.cor ?? "#888" }}>{s.nome}</p>
            <div className="space-y-2">
              {MOMENTOS.flatMap((mom) => doSetor.filter((m) => m.momento === mom)).map((m) => {
                const lista = itensDe(m.id);
                const obrig = lista.filter((i) => i.obrigatorio).length;
                const fotos = lista.filter((i) => i.exige_foto).length;
                return (
                  <div key={m.id} className={`rounded-cartao border p-4 ${m.ativo ? "border-borda" : "border-dashed border-borda-forte opacity-60 "}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-texto">
                          {m.nome}
                          <span className="ml-2 rounded-full bg-superficie-suave px-2 py-0.5 text-mini font-medium text-texto-suave">
                            {ROTULO_MOMENTO[m.momento]}
                          </span>
                          {!m.ativo && <span className="ml-2 text-xs text-texto-fraco">inativa</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-texto-suave">
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
                          onClick={async () => { if (await confirmar(`Apagar a lista "${m.nome}"?`)) agir(() => excluirModelo(m.id)); }}
                          disabled={proc}
                          className="rounded-controle px-3 py-1.5 text-xs text-texto-fraco hover:text-red-600"
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
  // Sugestão inicial no seletor de cor: a primária da marca.
  const [cor, setCor] = useState(COR_PRIMARIA);
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-borda pt-3">
      <div>
        <label className="mb-1 block text-xs text-texto-suave">Novo setor</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Forno" className={`${inputCls} w-40`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-texto-suave">Cor</label>
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-14 rounded border border-borda-forte" />
      </div>
      <button
        onClick={() => { if (nome.trim().length >= 2) { onSalvar(nome, cor); setNome(""); } }}
        disabled={proc || nome.trim().length < 2}
        className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-semibold disabled:opacity-40"
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
    <div className="mt-3 border-t border-borda pt-3">
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
              className={`flex items-start gap-2 rounded-controle px-2 py-1.5 text-sm ${arrastando === id ? "opacity-40" : "hover:bg-superficie-suave "}`}
            >
              <span className="cursor-grab select-none pt-0.5 text-zinc-300 dark:text-zinc-600" title="Arraste para reordenar">⠿</span>
              <span className="w-5 pt-0.5 text-right text-xs text-texto-fraco">{n + 1}</span>
              <span className="flex-1">
                {i.secao && <span className="mr-1.5 rounded bg-superficie-suave px-1.5 py-0.5 text-mini font-bold text-texto-suave">{i.secao}</span>}
                <span className="text-zinc-800 dark:text-zinc-100">{i.texto}</span>
                <span className="ml-2 text-mini text-texto-fraco">{ROTULO_TIPO[i.tipo]}</span>
                {i.obrigatorio && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-mini font-medium text-red-700 dark:bg-red-950 dark:text-red-300">obrigatório</span>}
                {i.exige_foto && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-mini font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">foto</span>}
                {i.instrucao && <span className="block text-xs text-texto-fraco">{i.instrucao}</span>}
              </span>
              <button onClick={() => setEditItem(i)} className="text-xs text-orange-600 hover:underline">editar</button>
              <button
                onClick={async () => { if (await confirmar(`Tirar "${i.texto}" da lista?`)) agir(() => excluirItemModelo(i.id)); }}
                disabled={proc}
                className="text-xs text-zinc-300 hover:text-red-600 dark:text-zinc-600"
              >
                ✕
              </button>
            </li>
          );
        })}
        {atual.length === 0 && <li className="px-2 py-3 text-sm text-texto-fraco">Nenhum item ainda.</li>}
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
      <div className="w-full max-w-lg rounded-cartao bg-painel-cartao p-5">
        <h2 className="mb-3 text-lg font-bold text-texto">{modelo ? "Editar lista" : "Nova lista"}</h2>
        <label className="mb-1 block text-xs text-texto-suave">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fechamento do salão" className={`${inputCls} w-full`} autoFocus />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Setor</label>
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} className={`${inputCls} w-full`}>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Momento</label>
            <select value={momento} onChange={(e) => setMomento(e.target.value as Momento)} className={`${inputCls} w-full`}>
              {MOMENTOS.map((m) => <option key={m} value={m}>{ROTULO_MOMENTO[m]}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-4 text-xs text-texto-suave">Quando vale (sem marcar nada, vale todo dia)</p>
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
          <button onClick={onClose} className="rounded-controle border border-borda-forte px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={() => onSalvar({ id: modelo?.id, nome, setor_id: setorId, momento, dias, servicos })}
            disabled={proc || nome.trim().length < 2 || !setorId}
            className="rounded-controle bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
      <div className="w-full max-w-md rounded-cartao bg-painel-cartao p-5">
        <h2 className="mb-3 text-lg font-bold text-texto">{item ? "Editar item" : "Novo item"}</h2>
        <label className="mb-1 block text-xs text-texto-suave">Item</label>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Conferir banheiros" className={`${inputCls} w-full`} autoFocus />
        <label className="mt-3 mb-1 block text-xs text-texto-suave">Bloco (opcional — agrupa os itens, ex.: PREPARO)</label>
        <input value={secao} onChange={(e) => setSecao(e.target.value)} placeholder="Ex.: ANTES DE COMEÇAR" className={`${inputCls} w-full`} />
        <label className="mt-3 mb-1 block text-xs text-texto-suave">Instrução (opcional, aparece abaixo do item)</label>
        <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: conferir papel e sabonete" className={`${inputCls} w-full`} />
        <label className="mt-3 mb-1 block text-xs text-texto-suave">Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoItem)} className={`${inputCls} w-full`}>
          {TIPOS_ITEM.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={foto} onChange={(e) => setFoto(e.target.checked)} /> Exigir foto
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} /> Obrigatório (precisa ser preenchido pra concluir)
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-controle border border-borda-forte px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={() => onSalvar({ id: item?.id, texto, instrucao: instrucao || null, secao: secao || null, tipo, exige_foto: foto, obrigatorio: obrig })}
            disabled={proc || texto.trim().length < 2}
            className="rounded-controle bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
