"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { menorPreco } from "@/lib/combo-preco";
import { buscarProdutosCombo, salvarEtapasCombo, type EtapaCombo } from "../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lerValor = (t: string) => { const v = Number(String(t).trim().replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const txt = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
const inp = "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto";
let seq = 0;
const novaChave = () => `n${++seq}`;

type Op = { k: string; id?: string; nome: string; preco: string; ativo: boolean; sabor_id?: string | null; produto_id?: string | null };
type Modo = "uma" | "varias" | "repetir";
type Etapa = { k: string; id?: string; nome: string; modo: Modo; min: string; max: string; media: boolean; tamanho_id: string | null; opcoes: Op[] };

const modoDe = (e: EtapaCombo): Modo => (e.max <= 1 ? "uma" : e.permite_repetir ? "repetir" : "varias");

// Etapas do combo: nome, quantas o cliente escolhe, se é pizza (cobra a média
// dos sabores) e as opções com o valor no combo. Puxar sabores traz o preço do
// cardápio no tamanho; dá pra baixar cada um (o combo é pra sair mais barato).
export function EditorEtapas({ itemId, inicial, tamanhos, sabores, precos }: {
  itemId: string;
  inicial: EtapaCombo[];
  tamanhos: { id: string; nome: string }[];
  sabores: { id: string; nome: string; tipo: string | null }[];
  precos: { sabor_id: string; tamanho_id: string; preco: number }[];
}) {
  const router = useRouter();
  const [etapas, setEtapas] = useState<Etapa[]>(() => inicial.map((e) => ({
    k: novaChave(), id: e.id, nome: e.nome, modo: modoDe(e), min: String(e.min), max: String(e.max), media: e.media, tamanho_id: e.tamanho_id,
    opcoes: e.opcoes.map((o) => ({ k: novaChave(), id: o.id, nome: o.nome, preco: txt(o.preco), ativo: o.ativo, sabor_id: o.sabor_id, produto_id: o.produto_id })),
  })));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const precoDe = new Map(precos.map((p) => [`${p.sabor_id}|${p.tamanho_id}`, p.preco]));

  const muda = (k: string, f: (e: Etapa) => Etapa) => { setMsg(null); setEtapas((c) => c.map((e) => (e.k === k ? f(e) : e))); };
  const mover = <T,>(lista: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= lista.length) return lista; const n = [...lista]; [n[i], n[j]] = [n[j], n[i]]; return n; };

  function paraSalvar(): EtapaCombo[] {
    return etapas.map((e) => {
      const max = e.modo === "uma" ? 1 : Math.max(1, Math.round(lerValor(e.max)));
      const min = e.modo === "uma" ? Math.min(1, Math.round(lerValor(e.min))) : Math.round(lerValor(e.min));
      return {
        id: e.id, nome: e.nome, min, max, permite_repetir: e.modo === "repetir", media: e.media, tamanho_id: e.tamanho_id,
        opcoes: e.opcoes.map((o) => ({ id: o.id, nome: o.nome, preco: lerValor(o.preco), ativo: o.ativo, sabor_id: o.sabor_id ?? null, produto_id: o.produto_id ?? null })),
      };
    });
  }
  const minimo = (() => {
    const es = paraSalvar();
    return menorPreco(0, es.map((e, i) => ({ ...e, id: String(i) })), Object.fromEntries(es.map((e, i) => [String(i), e.opcoes.filter((o) => o.ativo).map((o) => o.preco)])));
  })();

  async function salvar() {
    setMsg(null);
    const r = await salvarEtapasCombo(itemId, paraSalvar());
    if (!r.ok) { setMsg({ ok: false, t: r.mensagem }); return; }
    setMsg({ ok: true, t: "Etapas salvas. Já valem no app e no delivery." });
    router.refresh();
  }

  const novaEtapa = () => setEtapas((c) => [...c, { k: novaChave(), nome: "", modo: "uma", min: "1", max: "1", media: false, tamanho_id: null, opcoes: [] }]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rotulo">Etapas</div>
        <span className="text-sm text-texto-suave">Valor mínimo do combo: <b className="font-numero text-texto">{brl(minimo)}</b></span>
        <button type="button" onClick={novaEtapa} className="btn-secundario ml-auto text-sm"><Icone nome="novo" tamanho={14} /> Adicionar etapa</button>
      </div>
      {etapas.length === 0 && <p className="cartao p-6 text-center text-sm text-texto-suave">O combo é montado em etapas: em cada uma o cliente escolhe entre as opções (ex.: 1. sabores da pizza grande, 2. sabor da mini, 3. refrigerante). Comece em <b>Adicionar etapa</b>.</p>}

      {etapas.map((e, i) => (
        <EtapaCard
          key={e.k} e={e} n={i + 1} total={etapas.length}
          tamanhos={tamanhos} sabores={sabores} precoDe={precoDe}
          muda={(f) => muda(e.k, f)}
          subir={() => setEtapas((c) => mover(c, i, -1))}
          descer={() => setEtapas((c) => mover(c, i, 1))}
          duplicar={() => setEtapas((c) => [...c.slice(0, i + 1), { ...e, k: novaChave(), id: undefined, nome: `${e.nome} (cópia)`, opcoes: e.opcoes.map((o) => ({ ...o, k: novaChave(), id: undefined })) }, ...c.slice(i + 1)])}
          excluir={() => setEtapas((c) => c.filter((x) => x.k !== e.k))}
          mover={mover}
        />
      ))}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-cartao bg-painel-fundo/95 px-1 py-3 backdrop-blur">
        {msg && <span role="status" className={msg.ok ? "pilula pilula-ok" : "pilula pilula-urgente"}>{msg.t}</span>}
        <BotaoAcao aoClicar={salvar} disabled={etapas.length === 0} className="btn-principal ml-auto">Salvar etapas</BotaoAcao>
      </div>
    </div>
  );
}

function EtapaCard({ e, n, total, tamanhos, sabores, precoDe, muda, subir, descer, duplicar, excluir, mover }: {
  e: Etapa; n: number; total: number;
  tamanhos: { id: string; nome: string }[];
  sabores: { id: string; nome: string; tipo: string | null }[];
  precoDe: Map<string, number>;
  muda: (f: (e: Etapa) => Etapa) => void;
  subir: () => void; descer: () => void; duplicar: () => void; excluir: () => void;
  mover: <T>(lista: T[], i: number, d: number) => T[];
}) {
  const [tam, setTam] = useState(e.tamanho_id ?? tamanhos[tamanhos.length - 1]?.id ?? "");
  const [tipo, setTipo] = useState<"" | "salgada" | "doce">("");
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<{ id: string; nome: string; categoria: string | null; preco: number }[]>([]);

  const setOps = (f: (o: Op[]) => Op[]) => muda((x) => ({ ...x, opcoes: f(x.opcoes) }));
  const mudaOp = (k: string, campo: Partial<Op>) => setOps((os) => os.map((o) => (o.k === k ? { ...o, ...campo } : o)));

  function puxarSabores() {
    if (!tam) return;
    const ja = new Set(e.opcoes.map((o) => o.sabor_id).filter(Boolean));
    const novos = sabores
      .filter((s) => !ja.has(s.id) && (!tipo || s.tipo === tipo) && precoDe.has(`${s.id}|${tam}`))
      .map((s) => ({ k: novaChave(), nome: s.nome, preco: txt(precoDe.get(`${s.id}|${tam}`) ?? 0), ativo: true, sabor_id: s.id }));
    muda((x) => ({ ...x, tamanho_id: x.tamanho_id ?? tam, opcoes: [...x.opcoes, ...novos] }));
  }
  async function procurar(t: string) {
    setBusca(t);
    setAchados(t.trim().length >= 2 ? await buscarProdutosCombo(t) : []);
  }

  return (
    <div className="cartao p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-numero text-xl font-bold text-texto-marca">{n}</span>
        <input value={e.nome} onChange={(ev) => muda((x) => ({ ...x, nome: ev.target.value }))} placeholder="Nome da etapa (ex.: Escolha os sabores da sua pizza)" maxLength={100} className={`${inp} min-w-0 flex-1`} />
        <div className="flex gap-1">
          <button type="button" onClick={subir} disabled={n === 1} aria-label="Subir etapa" className="h-11 w-11 rounded-controle border border-borda-forte disabled:opacity-30"><Icone nome="subir" tamanho={14} /></button>
          <button type="button" onClick={descer} disabled={n === total} aria-label="Descer etapa" className="h-11 w-11 rounded-controle border border-borda-forte disabled:opacity-30"><Icone nome="subir" tamanho={14} className="rotate-180" /></button>
          <button type="button" onClick={duplicar} className="min-h-11 rounded-controle border border-borda-forte px-3 text-sm">Duplicar</button>
          <button type="button" onClick={excluir} className="min-h-11 rounded-controle border border-borda-forte px-3 text-sm text-texto-marca">Excluir</button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {([["uma", "Apenas uma opção"], ["varias", "Mais de uma, sem repetição"], ["repetir", "Mais de uma, com repetição"]] as const).map(([m, rot]) => (
          <label key={m} className={`flex min-h-11 items-center gap-2 rounded-controle border px-3 text-sm ${e.modo === m ? "border-primaria bg-destaque" : "border-borda"}`}>
            <input type="radio" checked={e.modo === m} onChange={() => muda((x) => ({ ...x, modo: m, max: m === "uma" ? "1" : Number(x.max) > 1 ? x.max : "2" }))} /> {rot}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
        {e.modo === "uma" ? (
          <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={e.min !== "0"} onChange={(ev) => muda((x) => ({ ...x, min: ev.target.checked ? "1" : "0" }))} className="h-4 w-4" /> Obrigatório escolher</label>
        ) : (
          <>O cliente escolhe de <input value={e.min} onChange={(ev) => muda((x) => ({ ...x, min: ev.target.value }))} inputMode="numeric" className={`${inp} w-16 text-center font-numero`} aria-label="Mínimo" /> até <input value={e.max} onChange={(ev) => muda((x) => ({ ...x, max: ev.target.value }))} inputMode="numeric" className={`${inp} w-16 text-center font-numero`} aria-label="Máximo" /> opções</>
        )}
        <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-texto"><input type="checkbox" checked={e.media} onChange={(ev) => muda((x) => ({ ...x, media: ev.target.checked, tamanho_id: x.tamanho_id ?? tam }))} className="h-4 w-4" /> É uma pizza: cobra a média dos sabores</label>
        {e.media && (
          <select value={e.tamanho_id ?? ""} onChange={(ev) => muda((x) => ({ ...x, tamanho_id: ev.target.value || null }))} aria-label="Tamanho da pizza (sai na cozinha)" className={inp}>
            <option value="">tamanho…</option>
            {tamanhos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="rotulo">Opções da etapa ({e.opcoes.length})</div>
        <div className="rotulo">Valor no combo</div>
      </div>
      <ul className="divide-y divide-borda">
        {e.opcoes.map((o, i) => (
          <li key={o.k} className={`flex items-center gap-2 py-1.5 ${o.ativo ? "" : "opacity-50"}`}>
            <div className="flex flex-col">
              <button type="button" onClick={() => setOps((os) => mover(os, i, -1))} disabled={i === 0} aria-label="Subir opção" className="h-6 w-8 disabled:opacity-20"><Icone nome="subir" tamanho={12} /></button>
              <button type="button" onClick={() => setOps((os) => mover(os, i, 1))} disabled={i === e.opcoes.length - 1} aria-label="Descer opção" className="h-6 w-8 disabled:opacity-20"><Icone nome="subir" tamanho={12} className="rotate-180" /></button>
            </div>
            <input value={o.nome} onChange={(ev) => mudaOp(o.k, { nome: ev.target.value })} className={`${inp} min-w-0 flex-1`} aria-label="Nome da opção" />
            <span className="text-xs text-texto-suave">R$</span>
            <input value={o.preco} onChange={(ev) => mudaOp(o.k, { preco: ev.target.value })} inputMode="decimal" className={`${inp} w-24 text-right font-numero`} aria-label={`Valor no combo de ${o.nome}`} />
            <button type="button" onClick={() => mudaOp(o.k, { ativo: !o.ativo })} className="min-h-11 rounded-controle border border-borda-forte px-2 text-xs">{o.ativo ? "Ocultar" : "Mostrar"}</button>
            <button type="button" onClick={() => setOps((os) => os.filter((x) => x.k !== o.k))} aria-label={`Tirar ${o.nome}`} className="h-11 w-11 rounded-controle border border-borda-forte text-texto-marca"><Icone nome="lixeira" tamanho={14} /></button>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 rounded-cartao bg-superficie-suave p-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-texto">Puxar sabores de pizza</div>
          <div className="flex gap-1.5">
            <select value={tam} onChange={(ev) => setTam(ev.target.value)} aria-label="Tamanho" className={`${inp} min-w-0 flex-1`}>
              {tamanhos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <select value={tipo} onChange={(ev) => setTipo(ev.target.value as "" | "salgada" | "doce")} aria-label="Quais sabores" className={inp}>
              <option value="">todos</option><option value="salgada">salgadas</option><option value="doce">doces</option>
            </select>
          </div>
          <button type="button" onClick={puxarSabores} className="btn-secundario w-full text-sm">Puxar com o preço do cardápio</button>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-texto">Produto do cardápio</div>
          <input value={busca} onChange={(ev) => procurar(ev.target.value)} placeholder="Buscar (ex.: guaraná)" className={`${inp} w-full`} />
          {achados.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-controle border border-borda bg-painel-cartao">
              {achados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { setOps((os) => [...os, { k: novaChave(), nome: p.nome, preco: "0,00", ativo: true, produto_id: p.id }]); setBusca(""); setAchados([]); }} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-destaque">
                    <span className="truncate">{p.nome}</span><span className="text-xs text-texto-suave">{p.categoria} · {brl(p.preco)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-texto-fraco">Entra com valor R$ 0,00 no combo (grátis); ajuste se cobrar.</p>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-texto">Opção avulsa</div>
          <button type="button" onClick={() => setOps((os) => [...os, { k: novaChave(), nome: "", preco: "0,00", ativo: true }])} className="btn-secundario w-full text-sm">Adicionar opção</button>
        </div>
      </div>
    </div>
  );
}
