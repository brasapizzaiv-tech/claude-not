"use client";

import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  salvarConfigPdv,
  salvarItem,
  excluirItem,
  toggleItem,
  toggleDisponivelItem,
  salvarHorarios,
  salvarCanaisCategoria,
  adicionarCategoria,
  toggleCategoria,
  moverCategoria,
  excluirCategoria,
} from "../actions";
import { salvarFotoCardapio, removerFotoCardapio, salvarDetalheCardapio, salvarFatias } from "../../delivery/actions";
import { resumoHorarios, disponivelAgora, type Horarios } from "@/lib/disponibilidade";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

type Item = {
  id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null; ativo: boolean;
  delivery: boolean; canal_garcom: boolean; canal_pdv: boolean; disponivel: boolean;
  horarios: Horarios; foto_url: string | null; descricao: string | null;
};
type Categoria = { id: string; nome: string; ordem: number; disponivel: boolean; horarios: Horarios; canal_app: boolean; canal_garcom: boolean; canal_pdv: boolean };
type Tam = { id: string; nome: string; max_sabores: number; fatias: number | null };
type Sabor = { id: string; nome: string; foto_url: string | null; descricao: string | null; tipo?: "salgada" | "doce" | null; rodizio?: boolean | null };

// ---------- foto ----------
function Foto({ url, tam = "h-12 w-12" }: { url: string | null; tam?: string }) {
  if (!url) return <div className={`flex ${tam} shrink-0 items-center justify-center rounded-controle bg-superficie-suave text-texto-fraco `}><Icone nome="salao" tamanho={18} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${tam} shrink-0 rounded-controle object-cover`} />;
}

function UploadFoto({ tipo, id, temFoto }: { tipo: "item" | "sabor"; id: string; temFoto: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("tipo", tipo); fd.set("id", id); fd.set("foto", f);
          start(async () => {
            const r = await salvarFotoCardapio(fd);
            setMsg(r.ok ? null : r.mensagem ?? "Falhou");
            if (ref.current) ref.current.value = "";
          });
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} disabled={proc} className="rounded-controle border border-borda-forte px-2 py-1 text-xs disabled:opacity-50">
        {proc ? "Enviando..." : <span className="inline-flex items-center gap-1.5"><Icone nome="camera" tamanho={13} /> {temFoto ? "Trocar foto" : "Foto"}</span>}
      </button>
      {temFoto && !proc && (
        <form action={removerFotoCardapio} className="inline">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="id" value={id} />
          <Enviar className="rounded-controle border border-borda-forte px-1.5 py-1 text-xs text-rose-500" title="Remover foto">✕</Enviar>
        </form>
      )}
      {msg && <span className="text-xs text-rose-500">{msg}</span>}
    </span>
  );
}

// ---------- horários (dias + turnos) ----------
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
function HorariosEditor({ inicial }: { inicial: Horarios }) {
  const [modo, setModo] = useState<"sempre" | "especifico">(inicial && ((inicial.dias?.length ?? 0) > 0 || (inicial.turnos?.length ?? 0) > 0) ? "especifico" : "sempre");
  const [dias, setDias] = useState<number[]>(inicial?.dias ?? []);
  const [turnos, setTurnos] = useState<{ ini: string; fim: string }[]>(inicial?.turnos?.length ? inicial.turnos : [{ ini: "00:00", fim: "23:59" }]);

  const valor = modo === "sempre" ? "" : JSON.stringify({ dias, turnos });
  const toggleDia = (d: number) => setDias((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d].sort()));

  return (
    <div className="space-y-2">
      <input type="hidden" name="horarios" value={valor} />
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={modo === "sempre"} onChange={() => setModo("sempre")} /> Sempre disponível
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" checked={modo === "especifico"} onChange={() => setModo("especifico")} /> Dias e horários específicos (no app do cliente)
      </label>
      {modo === "especifico" && (
        <div className="rounded-cartao bg-superficie-suave p-3">
          <div className="mb-2 flex gap-1.5">
            {DIAS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDia(i)} className={`h-8 w-8 rounded-full text-xs font-bold ${dias.includes(i) ? "bg-texto text-fundo" : "bg-zinc-200 text-texto-suave dark:bg-zinc-800"}`}>{d}</button>
            ))}
            <span className="self-center text-xs text-texto-fraco">{dias.length === 0 ? "todos os dias" : ""}</span>
          </div>
          {turnos.map((t, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2 text-sm">
              <span className="text-xs text-texto-suave">{i + 1}º turno</span>
              <input type="time" value={t.ini} onChange={(e) => setTurnos((c) => c.map((x, j) => (j === i ? { ...x, ini: e.target.value } : x)))} className={inputCls} />
              <span>até</span>
              <input type="time" value={t.fim} onChange={(e) => setTurnos((c) => c.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)))} className={inputCls} />
              {turnos.length > 1 && <button type="button" onClick={() => setTurnos((c) => c.filter((_, j) => j !== i))} className="text-rose-500">✕</button>}
            </div>
          ))}
          {turnos.length < 4 && (
            <button type="button" onClick={() => setTurnos((c) => [...c, { ini: "18:00", fim: "23:00" }])} className="text-xs font-semibold text-emerald-600">+ Adicionar turno</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- tela ----------
export function CardapioClient({
  config, itens, categorias, comAdicionais, tamanhos, sabores,
}: {
  config: Record<string, string>;
  itens: Item[];
  categorias: Categoria[];
  comAdicionais: string[];
  tamanhos: Tam[];
  sabores: Sabor[];
}) {
  const [editando, setEditando] = useState<Item | null>(null);
  const [buscaSabor, setBuscaSabor] = useState("");
  const [horariosCat, setHorariosCat] = useState<Categoria | null>(null);
  const setAdic = new Set(comAdicionais);

  const grupos = new Map<string, Item[]>();
  for (const i of itens) {
    const k = i.categoria || "Sem categoria";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const extras = [...grupos.keys()].filter((k) => !categorias.some((c) => c.nome === k));

  return (
    <div className="space-y-6">
      <ConfigForm config={config} />

      <form action={adicionarCategoria} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Nova categoria</label>
          <input name="nome" required placeholder="Ex.: Bebidas" className={inputCls} />
        </div>
        <Enviar className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90">
          + Adicionar categoria
        </Enviar>
      </form>

      {/* Editor completo do item */}
      {editando && (
        <div className="rounded-cartao border border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-950/20">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-texto">Editar produto</h3>
            <div className="flex items-center gap-2">
              <UploadFoto tipo="item" id={editando.id} temFoto={!!editando.foto_url} />
              <button onClick={() => setEditando(null)} className="text-texto-fraco">✕</button>
            </div>
          </div>
          <form
            key={editando.id}
            action={async (fd) => { await salvarItem(fd); setEditando(null); }}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={editando.id} />
            <input type="hidden" name="completo" value="1" />
            <div className="flex flex-wrap items-end gap-3">
              <Foto url={editando.foto_url} tam="h-16 w-16" />
              <div className="min-w-40 flex-1">
                <label className="mb-1 block text-xs text-texto-suave">Item</label>
                <input name="nome" required defaultValue={editando.nome} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Categoria</label>
                <input name="categoria" list="cats" defaultValue={editando.categoria ?? ""} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-texto-suave">Preço</label>
                <input name="preco" inputMode="decimal" defaultValue={String(editando.preco).replace(".", ",")} className={`${inputCls} w-28`} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs text-texto-suave"><Icone nome="fogo" tamanho={13} /> Promoção (R$)</label>
                <input name="promo_preco" inputMode="decimal" defaultValue={editando.promo_preco != null ? String(editando.promo_preco).replace(".", ",") : ""} placeholder="vazio = sem" className={`${inputCls} w-28`} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texto-suave">Descrição (aparece no app do cliente)</label>
              <input name="descricao" maxLength={400} defaultValue={editando.descricao ?? ""} placeholder="Ex.: Costela desfiada com molho de requeijão..." className={`${inputCls} w-full`} />
            </div>
            <div className="flex flex-wrap items-center gap-4 rounded-cartao bg-white/60 p-3 dark:bg-zinc-900/40">
              <span className="text-xs font-semibold text-texto-fraco">Canais:</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_app" defaultChecked={editando.delivery} className="h-4 w-4" /> <Icone nome="celular" tamanho={14} /> App</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_garcom" defaultChecked={editando.canal_garcom} className="h-4 w-4" /> <Icone nome="garcom" tamanho={14} /> Garçom</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_pdv" defaultChecked={editando.canal_pdv} className="h-4 w-4" /> <Icone nome="cupom" tamanho={14} /> PDV</label>
              <span className="mx-2 text-zinc-300">|</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="disponivel" defaultChecked={editando.disponivel} className="h-4 w-4" /> <Icone nome="certo" tamanho={14} /> Disponível (desmarque se esgotou)</label>
            </div>
            <div className="flex gap-2">
              <Enviar className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">Salvar</Enviar>
              <button type="button" onClick={() => setEditando(null)} className="rounded-controle px-3 py-2 text-sm text-texto-suave hover:bg-superficie-suave">Cancelar</button>
            </div>
          </form>
          {/* Horários do item */}
          <form action={async (fd) => { await salvarHorarios(fd); setEditando(null); }} className="mt-3 border-t border-orange-200 pt-3 dark:border-orange-500/30">
            <input type="hidden" name="tipo" value="item" />
            <input type="hidden" name="id" value={editando.id} />
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-texto-fraco"><Icone nome="relogio" tamanho={13} /> Disponibilidade deste produto no app</p>
            <HorariosEditor inicial={editando.horarios} />
            <Enviar className="mt-2 rounded-controle bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-700">Salvar horários</Enviar>
          </form>
        </div>
      )}

      {/* Horários da categoria */}
      {horariosCat && (
        <div className="rounded-cartao border border-sky-300 bg-sky-50 p-4 dark:border-sky-500/40 dark:bg-sky-950/20">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-bold text-texto"><Icone nome="relogio" tamanho={15} /> Disponibilidade da categoria &quot;{horariosCat.nome}&quot; no app</h3>
            <button onClick={() => setHorariosCat(null)} className="text-texto-fraco">✕</button>
          </div>
          <form action={async (fd) => { await salvarHorarios(fd); setHorariosCat(null); }}>
            <input type="hidden" name="tipo" value="categoria" />
            <input type="hidden" name="id" value={horariosCat.id} />
            <HorariosEditor inicial={horariosCat.horarios} />
            <Enviar className="mt-2 rounded-controle bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Salvar horários</Enviar>
          </form>
        </div>
      )}

      <datalist id="cats">
        {categorias.map((c) => (
          <option key={c.id} value={c.nome} />
        ))}
      </datalist>

      {/* Pizzas (tamanhos + sabores) */}
      {tamanhos.length > 0 && (
        <details className="rounded-cartao bg-painel-cartao" open={false}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-texto-suave">
            <Icone nome="pizza" tamanho={16} className="mr-1.5" /> Pizzas — tamanhos e sabores <span className="font-normal text-texto-fraco">({sabores.length} sabores)</span>
          </summary>
          <div className="space-y-4 border-t border-borda p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tamanhos.map((t) => (
                <form key={t.id} action={salvarFatias} className="rounded-cartao border border-borda p-3">
                  <input type="hidden" name="id" value={t.id} />
                  <div className="text-sm font-semibold text-texto">{t.nome}</div>
                  <div className="mb-2 text-xs text-texto-suave">{t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}</div>
                  <div className="flex items-center gap-1.5">
                    <input name="fatias" defaultValue={t.fatias ?? ""} inputMode="numeric" placeholder="Fatias" className={`${inputCls} w-20`} />
                    <Enviar className="rounded-controle bg-texto px-2.5 py-1.5 text-xs font-semibold text-fundo">Ok</Enviar>
                  </div>
                </form>
              ))}
            </div>
            {/* Sabores: o nome vem inteiro (antes era cortado numa coluna fixa)
                e a descrição ocupa a linha de baixo, que é onde se escreve mais. */}
            <div>
              <input
                value={buscaSabor}
                onChange={(e) => setBuscaSabor(e.target.value)}
                placeholder="Buscar sabor…"
                className={`${inputCls} mb-2 w-full sm:w-72`}
              />
              <div className="space-y-2">
                {sabores
                  .filter((s) => !buscaSabor.trim() || s.nome.toLowerCase().includes(buscaSabor.trim().toLowerCase()))
                  .map((s) => (
                    <form
                      key={s.id}
                      action={salvarDetalheCardapio}
                      className="rounded-cartao border border-borda p-3"
                    >
                      <input type="hidden" name="tipo" value="sabor" />
                      <input type="hidden" name="id" value={s.id} />
                      <div className="flex flex-wrap items-center gap-3">
                        <Foto url={s.foto_url} />
                        <div className="min-w-48 flex-1 text-base font-semibold leading-snug text-texto">
                          {s.nome}
                        </div>
                        {/* Quadro do rodízio: salgada ou doce (coluna na TV) e se o sabor entra no rodízio */}
                        <select
                          name="tipo_sabor"
                          defaultValue={s.tipo ?? "salgada"}
                          className={`${inputCls} w-36`}
                          title="Coluna no quadro do rodízio"
                        >
                          <option value="salgada">Salgada</option>
                          <option value="doce">Doce</option>
                        </select>
                        <label
                          className="flex items-center gap-1.5 whitespace-nowrap text-sm text-texto-suave"
                          title="Aparece na busca de sabores do rodízio"
                        >
                          <input type="checkbox" name="rodizio" defaultChecked={s.rodizio !== false} /> rodízio
                        </label>
                        <UploadFoto tipo="sabor" id={s.id} temFoto={!!s.foto_url} />
                        <Enviar className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90">
                          Salvar
                        </Enviar>
                      </div>
                      <input
                        name="descricao"
                        defaultValue={s.descricao ?? ""}
                        maxLength={300}
                        placeholder="Descrição (ingredientes) — aparece no app do cliente"
                        className={`${inputCls} mt-2 w-full`}
                      />
                    </form>
                  ))}
                {sabores.filter((s) => !buscaSabor.trim() || s.nome.toLowerCase().includes(buscaSabor.trim().toLowerCase())).length === 0 && (
                  <p className="py-6 text-center text-sm text-texto-fraco">Nenhum sabor com esse nome.</p>
                )}
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Categorias em ordem */}
      <div className="space-y-4">
        {categorias.map((cat, idx) => (
          <CategoriaCard
            key={cat.id}
            cat={cat}
            itens={grupos.get(cat.nome) ?? []}
            primeira={idx === 0}
            ultima={idx === categorias.length - 1}
            onEditar={setEditando}
            onHorarios={setHorariosCat}
            comAdicionais={setAdic}
          />
        ))}

        {extras.map((nome) => (
          <div key={nome} className="rounded-cartao bg-painel-cartao p-4">
            <p className="mb-2 text-xs font-semibold text-texto-fraco">{nome} (sem categoria cadastrada)</p>
            <ItensTabela itens={grupos.get(nome) ?? []} onEditar={setEditando} comAdicionais={setAdic} />
          </div>
        ))}

        {categorias.length === 0 && extras.length === 0 && (
          <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
            Nenhuma categoria ainda. Crie uma acima.
          </div>
        )}
      </div>
    </div>
  );
}

function CategoriaCard({
  cat, itens, primeira, ultima, onEditar, onHorarios, comAdicionais,
}: {
  cat: Categoria;
  itens: Item[];
  primeira: boolean;
  ultima: boolean;
  onEditar: (i: Item) => void;
  onHorarios: (c: Categoria) => void;
  comAdicionais: Set<string>;
}) {
  const resumo = resumoHorarios(cat.horarios);
  const foraAgora = resumo != null && !disponivelAgora(cat.horarios, new Date().getTime());
  const [canaisAberto, setCanaisAberto] = useState(false);
  const nCanais = [cat.canal_app, cat.canal_garcom, cat.canal_pdv].filter(Boolean).length;
  return (
    <div className="rounded-cartao border border-borda p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="cima" />
            <Enviar disabled={primeira} className="text-texto-fraco hover:text-orange-600 disabled:opacity-30" aria-label="Subir">▲</Enviar>
          </form>
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="baixo" />
            <Enviar disabled={ultima} className="text-texto-fraco hover:text-orange-600 disabled:opacity-30" aria-label="Descer">▼</Enviar>
          </form>
        </div>

        <h2 className="text-lg font-bold text-texto">{cat.nome}</h2>
        <span className="text-xs text-texto-fraco">({itens.length})</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCanaisAberto((v) => !v)}
            className={`rounded-controle px-2.5 py-1 text-xs font-semibold ${nCanais === 3 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : nCanais === 0 ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}
            title="Em quais canais essa categoria aparece"
          >
            Ativa em {nCanais} {nCanais === 1 ? "canal" : "canais"} ▾
          </button>
          <button
            onClick={() => onHorarios(cat)}
            className={`rounded-controle px-2.5 py-1 text-xs font-semibold ${resumo ? (foraAgora ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400") : "bg-superficie-suave text-texto-suave "}`}
            title="Dias e horários em que aparece no app do cliente"
          >
            <Icone nome="relogio" tamanho={13} className="mr-1" /> {resumo ?? "Sempre"}{foraAgora ? " · fora do horário agora" : ""}
          </button>
          <form action={toggleCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="disponivel" value={cat.disponivel ? "0" : "1"} />
            <Enviar
              className={`rounded-controle px-2.5 py-1 text-xs font-semibold ${
                cat.disponivel
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
              }`}
            >
              {cat.disponivel ? "✓ Disponível" : "✕ Indisponível"}
            </Enviar>
          </form>
          <form
            action={excluirCategoria}
            onSubmit={async (e) => {
              if (!await confirmar(`Excluir a categoria "${cat.nome}"? Os produtos não são apagados.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={cat.id} />
            <Enviar className="text-zinc-300 hover:text-red-600 dark:text-zinc-600" aria-label="Excluir categoria"><Icone nome="lixeira" tamanho={15} /></Enviar>
          </form>
        </div>
      </div>

      {canaisAberto && (
        <form
          action={async (fd) => { await salvarCanaisCategoria(fd); setCanaisAberto(false); }}
          className="mb-3 flex flex-wrap items-center gap-4 rounded-cartao border border-borda bg-superficie-suave p-3 dark:border-borda-forte"
        >
          <input type="hidden" name="id" value={cat.id} />
          <span className="text-xs font-semibold text-texto-fraco">Onde essa categoria aparece:</span>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_app" defaultChecked={cat.canal_app} className="h-4 w-4" /> <Icone nome="celular" tamanho={14} /> App</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_garcom" defaultChecked={cat.canal_garcom} className="h-4 w-4" /> <Icone nome="garcom" tamanho={14} /> Garçom</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_pdv" defaultChecked={cat.canal_pdv} className="h-4 w-4" /> <Icone nome="cupom" tamanho={14} /> PDV</label>
          <Enviar className="rounded-controle bg-texto px-3 py-1.5 text-xs font-semibold text-fundo">Salvar</Enviar>
        </form>
      )}

      <ItensTabela itens={itens} onEditar={onEditar} comAdicionais={comAdicionais} />

      <form action={salvarItem} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoria" value={cat.nome} />
        <div className="min-w-40 flex-1">
          <input name="nome" required placeholder="Novo produto..." className={`${inputCls} w-full`} />
        </div>
        <input name="preco" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-24`} />
        <Enviar className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
          + Produto
        </Enviar>
      </form>
    </div>
  );
}

function ItensTabela({
  itens, onEditar, comAdicionais,
}: {
  itens: Item[];
  onEditar: (i: Item) => void;
  comAdicionais: Set<string>;
}) {
  if (itens.length === 0)
    return <p className="text-sm text-texto-fraco">Nenhum produto nesta categoria.</p>;
  return (
    <div className="overflow-hidden rounded-cartao bg-painel-cartao">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-borda">
          {itens.map((i) => {
            const canaisOff = [!i.delivery && "APP", !i.canal_garcom && "Garçom", !i.canal_pdv && "PDV"].filter(Boolean) as string[];
            const temHorario = resumoHorarios(i.horarios);
            return (
              <tr key={i.id} className={`bg-painel-cartao ${i.ativo ? "" : "opacity-50"}`}>
                <td className="w-14 py-1.5 pl-3"><Foto url={i.foto_url} tam="h-10 w-10" /></td>
                <td className="px-2 py-2 font-medium text-texto">
                  {i.nome}
                  {!i.ativo && <span className="ml-2 text-mini text-red-500">oculto</span>}
                  {canaisOff.length > 0 && <span className="ml-2 text-mini text-texto-fraco">sem: {canaisOff.join(", ")}</span>}
                  {temHorario && <span className="ml-2 inline-flex items-center gap-1 text-mini text-sky-500"><Icone nome="relogio" tamanho={11} /> {temHorario}</span>}
                </td>
                <td className="px-2 py-2 text-right text-texto-suave">
                  {i.promo_preco != null && Number(i.promo_preco) > 0 ? (
                    <><span className="mr-1 text-xs text-texto-fraco line-through">{moeda(Number(i.preco))}</span><span className="font-semibold text-orange-600">{moeda(Number(i.promo_preco))}</span></>
                  ) : moeda(Number(i.preco))}
                </td>
                <td className="px-2 py-2 text-right">
                  <form action={toggleDisponivelItem} className="inline">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="disponivel" value={i.disponivel ? "0" : "1"} />
                    <Enviar
                      className={`rounded-controle px-2 py-0.5 text-mini font-semibold ${
                        i.disponivel
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                      }`}
                      title="Disponível/indisponível em todos os canais (ex.: esgotou)"
                    >
                      {i.disponivel ? "✓ Disponível" : "✕ Indisponível"}
                    </Enviar>
                  </form>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <form action={toggleItem} className="inline">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="ativo" value={i.ativo ? "0" : "1"} />
                    <Enviar className="mr-3 text-texto-fraco hover:text-orange-600" title={i.ativo ? "Ocultar" : "Mostrar"}>
                      {i.ativo ? "Ocultar" : "Mostrar"}
                    </Enviar>
                  </form>
                  {comAdicionais.has(i.id) && (
                    <Link href={`/salao/cardapio/adicionais/${i.id}`} className="mr-3 text-emerald-600 hover:underline">
                      Adicionais
                    </Link>
                  )}
                  <button onClick={() => onEditar(i)} className="mr-3 text-orange-600 hover:underline">Editar</button>
                  <form
                    action={excluirItem}
                    className="inline"
                    onSubmit={async (e) => { if (!await confirmar(`Remover "${i.nome}"?`)) e.preventDefault(); }}
                  >
                    <input type="hidden" name="id" value={i.id} />
                    <Enviar className="text-texto-fraco hover:text-red-600">Remover</Enviar>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfigForm({ config }: { config: Record<string, string> }) {
  const precoKg = Number(config.preco_kg || 0);
  return (
    <details className="rounded-cartao bg-painel-cartao">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-texto-suave">
        <Icone nome="ajustes" tamanho={15} className="mr-1.5" /> Configurações do buffet / serviço / cupom
      </summary>
      <form action={salvarConfigPdv} className="space-y-3 border-t border-borda p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-texto-suave">Nome do restaurante (no cupom)</label>
            <input
              name="nome_restaurante"
              defaultValue={config.nome_restaurante ?? ""}
              placeholder="Ex.: Brasa Restaurante"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Qtd. de mesas</label>
            <input
              name="qtd_mesas"
              inputMode="numeric"
              defaultValue={config.qtd_mesas ?? "40"}
              placeholder="40"
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Tara padrão (kg)</label>
            <input
              name="tara_padrao"
              inputMode="decimal"
              defaultValue={
                Number(config.tara_padrao || 0) ? String(config.tara_padrao).replace(".", ",") : ""
              }
              placeholder="0,000"
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Preço por kg</label>
            <input
              name="preco_kg"
              inputMode="decimal"
              defaultValue={precoKg ? String(precoKg).replace(".", ",") : ""}
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Buffet livre (teto R$)</label>
            <input
              name="buffet_livre"
              inputMode="decimal"
              defaultValue={
                Number(config.buffet_livre || 0) ? String(config.buffet_livre).replace(".", ",") : ""
              }
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
            <p className="mt-1 text-mini text-texto-fraco">acima disso, cobra fixo (0 = desligado)</p>
          </div>
        </div>

        {/* Preços por dia da semana (vazio = usa o geral acima) */}
        <div className="border-t border-borda pt-3">
          <p className="mb-2 text-xs font-medium text-texto-suave">
            Preços por dia da semana (deixe vazio para usar o preço geral acima)
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-texto-fraco">
                  <th className="px-2 py-1 text-left">Dia</th>
                  <th className="px-2 py-1">Livre (teto R$)</th>
                  <th className="px-2 py-1">Por kg (R$)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [1, "Segunda"],
                  [2, "Terça"],
                  [3, "Quarta"],
                  [4, "Quinta"],
                  [5, "Sexta"],
                  [6, "Sábado"],
                ].map(([d, nome]) => (
                    <tr key={d}>
                      <td className="px-2 py-0.5 text-texto-suave">{nome}</td>
                      <td className="px-2 py-0.5">
                        <input
                          name={`buffet_livre_${d}`}
                          inputMode="decimal"
                          defaultValue={
                            config[`buffet_livre_${d}`]
                              ? String(config[`buffet_livre_${d}`]).replace(".", ",")
                              : ""
                          }
                          placeholder="—"
                          className={`${inputCls} w-24`}
                        />
                      </td>
                      <td className="px-2 py-0.5">
                        <input
                          name={`preco_kg_${d}`}
                          inputMode="decimal"
                          defaultValue={
                            config[`preco_kg_${d}`]
                              ? String(config[`preco_kg_${d}`]).replace(".", ",")
                              : ""
                          }
                          placeholder="—"
                          className={`${inputCls} w-24`}
                        />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-borda pt-3">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Serviço (%)</label>
            <input
              name="servico_percent"
              inputMode="decimal"
              defaultValue={config.servico_percent ?? "10"}
              className={`${inputCls} w-20`}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-texto-suave">
            <input
              type="checkbox"
              name="servico_so_noite"
              defaultChecked={config.servico_so_noite === "1"}
              className="h-4 w-4"
            />
            só à noite, a partir de
          </label>
          <div>
            <input
              type="time"
              name="servico_inicio"
              defaultValue={config.servico_inicio || "18:00"}
              className={inputCls}
            />
          </div>
        </div>
        <div className="space-y-3 border-t border-borda pt-3">
          <p className="text-xs font-medium text-texto-suave">Dados no cupom (opcionais)</p>
          <div className="flex flex-wrap gap-3">
            <input
              name="cupom_endereco"
              defaultValue={config.cupom_endereco ?? ""}
              placeholder="Endereço"
              className={`${inputCls} min-w-56 flex-1`}
            />
            <input
              name="cupom_telefone"
              defaultValue={config.cupom_telefone ?? ""}
              placeholder="Telefone / WhatsApp"
              className={inputCls}
            />
          </div>
          <input
            name="cupom_msg"
            defaultValue={config.cupom_msg ?? ""}
            placeholder="Mensagem (ex.: Obrigado pela preferência!)"
            className={`${inputCls} w-full`}
          />
        </div>
        <Enviar className="rounded-controle bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Salvar configurações
        </Enviar>
      </form>
    </details>
  );
}
