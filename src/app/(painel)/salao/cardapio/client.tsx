"use client";

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
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Item = {
  id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null; ativo: boolean;
  delivery: boolean; canal_garcom: boolean; canal_pdv: boolean; disponivel: boolean;
  horarios: Horarios; foto_url: string | null; descricao: string | null;
};
type Categoria = { id: string; nome: string; ordem: number; disponivel: boolean; horarios: Horarios; canal_app: boolean; canal_garcom: boolean; canal_pdv: boolean };
type Tam = { id: string; nome: string; max_sabores: number; fatias: number | null };
type Sabor = { id: string; nome: string; foto_url: string | null; descricao: string | null };

// ---------- foto ----------
function Foto({ url, tam = "h-12 w-12" }: { url: string | null; tam?: string }) {
  if (!url) return <div className={`flex ${tam} shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg dark:bg-zinc-800`}>🍽️</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${tam} shrink-0 rounded-lg object-cover`} />;
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
      <button type="button" onClick={() => ref.current?.click()} disabled={proc} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700">
        {proc ? "Enviando..." : temFoto ? "📷 Trocar foto" : "📷 Foto"}
      </button>
      {temFoto && !proc && (
        <form action={removerFotoCardapio} className="inline">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="id" value={id} />
          <button className="rounded-lg border border-zinc-300 px-1.5 py-1 text-xs text-rose-500 dark:border-zinc-700" title="Remover foto">✕</button>
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
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
          <div className="mb-2 flex gap-1.5">
            {DIAS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDia(i)} className={`h-8 w-8 rounded-full text-xs font-bold ${dias.includes(i) ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"}`}>{d}</button>
            ))}
            <span className="self-center text-xs text-zinc-400">{dias.length === 0 ? "todos os dias" : ""}</span>
          </div>
          {turnos.map((t, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2 text-sm">
              <span className="text-xs text-zinc-500">{i + 1}º turno</span>
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
          <label className="mb-1 block text-xs text-zinc-500">Nova categoria</label>
          <input name="nome" required placeholder="Ex.: Bebidas" className={inputCls} />
        </div>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + Adicionar categoria
        </button>
      </form>

      {/* Editor completo do item */}
      {editando && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-950/20">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Editar produto</h3>
            <div className="flex items-center gap-2">
              <UploadFoto tipo="item" id={editando.id} temFoto={!!editando.foto_url} />
              <button onClick={() => setEditando(null)} className="text-zinc-400">✕</button>
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
                <label className="mb-1 block text-xs text-zinc-500">Item</label>
                <input name="nome" required defaultValue={editando.nome} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
                <input name="categoria" list="cats" defaultValue={editando.categoria ?? ""} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Preço</label>
                <input name="preco" inputMode="decimal" defaultValue={String(editando.preco).replace(".", ",")} className={`${inputCls} w-28`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">🔥 Promoção (R$)</label>
                <input name="promo_preco" inputMode="decimal" defaultValue={editando.promo_preco != null ? String(editando.promo_preco).replace(".", ",") : ""} placeholder="vazio = sem" className={`${inputCls} w-28`} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Descrição (aparece no app do cliente)</label>
              <input name="descricao" maxLength={400} defaultValue={editando.descricao ?? ""} placeholder="Ex.: Costela desfiada com molho de requeijão..." className={`${inputCls} w-full`} />
            </div>
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white/60 p-3 dark:bg-zinc-900/40">
              <span className="text-xs font-semibold uppercase text-zinc-400">Canais:</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_app" defaultChecked={editando.delivery} className="h-4 w-4" /> 📱 App</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_garcom" defaultChecked={editando.canal_garcom} className="h-4 w-4" /> 🧑‍🍳 Garçom</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_pdv" defaultChecked={editando.canal_pdv} className="h-4 w-4" /> 🧾 PDV</label>
              <span className="mx-2 text-zinc-300">|</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="disponivel" defaultChecked={editando.disponivel} className="h-4 w-4" /> ✅ Disponível (desmarque se esgotou)</label>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">Salvar</button>
              <button type="button" onClick={() => setEditando(null)} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancelar</button>
            </div>
          </form>
          {/* Horários do item */}
          <form action={async (fd) => { await salvarHorarios(fd); setEditando(null); }} className="mt-3 border-t border-orange-200 pt-3 dark:border-orange-500/30">
            <input type="hidden" name="tipo" value="item" />
            <input type="hidden" name="id" value={editando.id} />
            <p className="mb-2 text-xs font-semibold uppercase text-zinc-400">🕐 Disponibilidade deste produto no app</p>
            <HorariosEditor inicial={editando.horarios} />
            <button className="mt-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-700">Salvar horários</button>
          </form>
        </div>
      )}

      {/* Horários da categoria */}
      {horariosCat && (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 dark:border-sky-500/40 dark:bg-sky-950/20">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">🕐 Disponibilidade da categoria &quot;{horariosCat.nome}&quot; no app</h3>
            <button onClick={() => setHorariosCat(null)} className="text-zinc-400">✕</button>
          </div>
          <form action={async (fd) => { await salvarHorarios(fd); setHorariosCat(null); }}>
            <input type="hidden" name="tipo" value="categoria" />
            <input type="hidden" name="id" value={horariosCat.id} />
            <HorariosEditor inicial={horariosCat.horarios} />
            <button className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Salvar horários</button>
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
        <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800" open={false}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            🍕 Pizzas — tamanhos, sabores, fotos e descrições
          </summary>
          <div className="space-y-4 border-t border-zinc-100 p-4 dark:border-zinc-800">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tamanhos.map((t) => (
                <form key={t.id} action={salvarFatias} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <input type="hidden" name="id" value={t.id} />
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.nome}</div>
                  <div className="mb-2 text-xs text-zinc-500">{t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}</div>
                  <div className="flex items-center gap-1.5">
                    <input name="fatias" defaultValue={t.fatias ?? ""} inputMode="numeric" placeholder="Fatias" className={`${inputCls} w-20`} />
                    <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Ok</button>
                  </div>
                </form>
              ))}
            </div>
            <div className="space-y-2">
              {sabores.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
                  <Foto url={s.foto_url} />
                  <form action={salvarDetalheCardapio} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="tipo" value="sabor" />
                    <input type="hidden" name="id" value={s.id} />
                    <div className="w-40 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.nome}</div>
                    <input name="descricao" defaultValue={s.descricao ?? ""} maxLength={300} placeholder="Descrição (ingredientes)" className={`${inputCls} min-w-40 flex-1`} />
                    <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Salvar</button>
                  </form>
                  <UploadFoto tipo="sabor" id={s.id} temFoto={!!s.foto_url} />
                </div>
              ))}
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
          <div key={nome} className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase text-zinc-400">{nome} (sem categoria cadastrada)</p>
            <ItensTabela itens={grupos.get(nome) ?? []} onEditar={setEditando} comAdicionais={setAdic} />
          </div>
        ))}

        {categorias.length === 0 && extras.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
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
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="cima" />
            <button disabled={primeira} className="text-zinc-400 hover:text-orange-600 disabled:opacity-30" aria-label="Subir">▲</button>
          </form>
          <form action={moverCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="dir" value="baixo" />
            <button disabled={ultima} className="text-zinc-400 hover:text-orange-600 disabled:opacity-30" aria-label="Descer">▼</button>
          </form>
        </div>

        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{cat.nome}</h2>
        <span className="text-xs text-zinc-400">({itens.length})</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCanaisAberto((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${nCanais === 3 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : nCanais === 0 ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}
            title="Em quais canais essa categoria aparece"
          >
            Ativa em {nCanais} {nCanais === 1 ? "canal" : "canais"} ▾
          </button>
          <button
            onClick={() => onHorarios(cat)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${resumo ? (foraAgora ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400") : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}
            title="Dias e horários em que aparece no app do cliente"
          >
            🕐 {resumo ?? "Sempre"}{foraAgora ? " · fora do horário agora" : ""}
          </button>
          <form action={toggleCategoria}>
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="disponivel" value={cat.disponivel ? "0" : "1"} />
            <button
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                cat.disponivel
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
              }`}
            >
              {cat.disponivel ? "✓ Disponível" : "✕ Indisponível"}
            </button>
          </form>
          <form
            action={excluirCategoria}
            onSubmit={(e) => {
              if (!confirm(`Excluir a categoria "${cat.nome}"? Os produtos não são apagados.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={cat.id} />
            <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600" aria-label="Excluir categoria">🗑</button>
          </form>
        </div>
      </div>

      {canaisAberto && (
        <form
          action={async (fd) => { await salvarCanaisCategoria(fd); setCanaisAberto(false); }}
          className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input type="hidden" name="id" value={cat.id} />
          <span className="text-xs font-semibold uppercase text-zinc-400">Onde essa categoria aparece:</span>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_app" defaultChecked={cat.canal_app} className="h-4 w-4" /> 📱 App</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_garcom" defaultChecked={cat.canal_garcom} className="h-4 w-4" /> 🧑‍🍳 Garçom</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="canal_pdv" defaultChecked={cat.canal_pdv} className="h-4 w-4" /> 🧾 PDV</label>
          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Salvar</button>
        </form>
      )}

      <ItensTabela itens={itens} onEditar={onEditar} comAdicionais={comAdicionais} />

      <form action={salvarItem} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoria" value={cat.nome} />
        <div className="min-w-40 flex-1">
          <input name="nome" required placeholder="Novo produto..." className={`${inputCls} w-full`} />
        </div>
        <input name="preco" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-24`} />
        <button className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
          + Produto
        </button>
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
    return <p className="text-sm text-zinc-400">Nenhum produto nesta categoria.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((i) => {
            const canaisOff = [!i.delivery && "APP", !i.canal_garcom && "Garçom", !i.canal_pdv && "PDV"].filter(Boolean) as string[];
            const temHorario = resumoHorarios(i.horarios);
            return (
              <tr key={i.id} className={`bg-white dark:bg-zinc-950 ${i.ativo ? "" : "opacity-50"}`}>
                <td className="w-14 py-1.5 pl-3"><Foto url={i.foto_url} tam="h-10 w-10" /></td>
                <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {i.nome}
                  {!i.ativo && <span className="ml-2 text-[10px] uppercase text-red-500">oculto</span>}
                  {canaisOff.length > 0 && <span className="ml-2 text-[10px] text-zinc-400">sem: {canaisOff.join(", ")}</span>}
                  {temHorario && <span className="ml-2 text-[10px] text-sky-500">🕐 {temHorario}</span>}
                </td>
                <td className="px-2 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {i.promo_preco != null && Number(i.promo_preco) > 0 ? (
                    <><span className="mr-1 text-xs text-zinc-400 line-through">{moeda(Number(i.preco))}</span><span className="font-semibold text-orange-600">{moeda(Number(i.promo_preco))}</span></>
                  ) : moeda(Number(i.preco))}
                </td>
                <td className="px-2 py-2 text-right">
                  <form action={toggleDisponivelItem} className="inline">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="disponivel" value={i.disponivel ? "0" : "1"} />
                    <button
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        i.disponivel
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                      }`}
                      title="Disponível/indisponível em todos os canais (ex.: esgotou)"
                    >
                      {i.disponivel ? "✓ Disponível" : "✕ Indisponível"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <form action={toggleItem} className="inline">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="ativo" value={i.ativo ? "0" : "1"} />
                    <button className="mr-3 text-zinc-400 hover:text-orange-600" title={i.ativo ? "Ocultar" : "Mostrar"}>
                      {i.ativo ? "Ocultar" : "Mostrar"}
                    </button>
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
                    onSubmit={(e) => { if (!confirm(`Remover "${i.nome}"?`)) e.preventDefault(); }}
                  >
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-zinc-400 hover:text-red-600">Remover</button>
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
    <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        ⚙️ Configurações do buffet / serviço / cupom
      </summary>
      <form action={salvarConfigPdv} className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Nome do restaurante (no cupom)</label>
            <input
              name="nome_restaurante"
              defaultValue={config.nome_restaurante ?? ""}
              placeholder="Ex.: Brasa Restaurante"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Qtd. de mesas</label>
            <input
              name="qtd_mesas"
              inputMode="numeric"
              defaultValue={config.qtd_mesas ?? "40"}
              placeholder="40"
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tara padrão (kg)</label>
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
            <label className="mb-1 block text-xs text-zinc-500">Preço por kg</label>
            <input
              name="preco_kg"
              inputMode="decimal"
              defaultValue={precoKg ? String(precoKg).replace(".", ",") : ""}
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Buffet livre (teto R$)</label>
            <input
              name="buffet_livre"
              inputMode="decimal"
              defaultValue={
                Number(config.buffet_livre || 0) ? String(config.buffet_livre).replace(".", ",") : ""
              }
              placeholder="0,00"
              className={`${inputCls} w-28`}
            />
            <p className="mt-1 text-[11px] text-zinc-400">acima disso, cobra fixo (0 = desligado)</p>
          </div>
        </div>

        {/* Preços por dia da semana (vazio = usa o geral acima) */}
        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Preços por dia da semana (deixe vazio para usar o preço geral acima)
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-zinc-400">
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
                      <td className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300">{nome}</td>
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

        <div className="flex flex-wrap items-end gap-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Serviço (%)</label>
            <input
              name="servico_percent"
              inputMode="decimal"
              defaultValue={config.servico_percent ?? "10"}
              className={`${inputCls} w-20`}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-600 dark:text-zinc-300">
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
        <div className="space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500">Dados no cupom (opcionais)</p>
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
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Salvar configurações
        </button>
      </form>
    </details>
  );
}
