"use client";


// Peças de montagem de pedido compartilhadas entre o painel do delivery
// (/delivery/novo) e o app público do cliente (/pedir): modal de pizza
// (tamanho, meio a meio, borda) e modal de complementos/combos.
import { useMemo, useState } from "react";
import type { LinhaPedido } from "@/lib/delivery-core";
import { nomesDosSabores } from "@/lib/pizza-sabores";

export type Item = { id: string; nome: string; categoria: string; preco: number; preco_antigo?: number | null; foto_url?: string | null; descricao?: string | null };
export type Tam = { id: string; nome: string; max_sabores: number; fatias?: number | null };
export type Sabor = { id: string; nome: string; foto_url?: string | null; descricao?: string | null; novo?: boolean };
export type Borda = { id: string; nome: string };
export type Grupo = { id: string; item_id: string; nome: string; min: number; max: number; permite_repetir: boolean };
export type Opcao = { id: string; grupo_id: string; nome: string; preco: number };
export type PizzaData = {
  tamanhos: Tam[]; sabores: Sabor[];
  saborPrecos: { sabor_id: string; tamanho_id: string; preco: number }[];
  bordas: Borda[]; bordaPrecos: { borda_id: string; tamanho_id: string; preco: number }[];
};
export type CartLine = { uid: string; descricao: string; preco: number; qtd: number; payload: LinhaPedido };

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let seq = 0;
export const novoUid = () => `l${++seq}`;

export function PizzaModal({ pizza, onClose, onAdd, tamanhoInicial, saborInicial, comObs }: {
  pizza: PizzaData;
  onClose: () => void;
  onAdd: (l: CartLine) => void;
  tamanhoInicial?: string;
  /** Abre já com um sabor marcado (vitrine "Novidades" do app do cliente). */
  saborInicial?: string;
  comObs?: boolean;
}) {
  const [tamId, setTamId] = useState(tamanhoInicial ?? pizza.tamanhos[0]?.id ?? "");
  const [sabIds, setSabIds] = useState<string[]>(saborInicial ? [saborInicial] : []);
  const [bordaId, setBordaId] = useState<string>("");
  const [obs, setObs] = useState("");
  const tam = pizza.tamanhos.find((t) => t.id === tamId);
  const max = tam?.max_sabores ?? 1;

  const precoSabor = (sid: string) => pizza.saborPrecos.find((p) => p.sabor_id === sid && p.tamanho_id === tamId)?.preco ?? 0;
  const precoBorda = (bid: string) => pizza.bordaPrecos.find((p) => p.borda_id === bid && p.tamanho_id === tamId)?.preco ?? 0;
  const usados = sabIds.filter((s) => pizza.saborPrecos.some((p) => p.sabor_id === s && p.tamanho_id === tamId));
  const media = usados.length ? usados.reduce((s, id) => s + precoSabor(id), 0) / usados.length : 0;
  const preco = Math.round((media + (bordaId ? precoBorda(bordaId) : 0)) * 100) / 100;

  // Tocar acrescenta uma parte do sabor; o mesmo sabor pode repetir (2/3 de um
  // e 1/3 de outro). O "−" tira uma parte. Tamanho de 1 sabor: tocar troca.
  function maisSabor(id: string) {
    setSabIds((c) => (max === 1 ? (c[0] === id ? [] : [id]) : c.length < max ? [...c, id] : c));
  }
  function menosSabor(id: string) {
    setSabIds((c) => { const i = c.lastIndexOf(id); return i < 0 ? c : [...c.slice(0, i), ...c.slice(i + 1)]; });
  }
  function adicionar() {
    if (!tam || usados.length === 0) return;
    const nomes = nomesDosSabores(usados, (id) => pizza.sabores.find((s) => s.id === id)?.nome ?? "?");
    const bordaNome = bordaId ? pizza.bordas.find((b) => b.id === bordaId)?.nome : "";
    const o = obs.trim();
    onAdd({
      uid: novoUid(),
      descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : "") + (o ? `\nObs: ${o}` : ""),
      preco, qtd: 1,
      payload: { kind: "pizza", tamanhoId: tamId, saborIds: usados, bordaId: bordaId || null, qtd: 1, obs: o || undefined },
    });
  }

  return (
    <Overlay onClose={onClose} titulo="Montar pizza">
      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold text-zinc-500">Tamanho</div>
        <div className="flex flex-wrap gap-2">
          {pizza.tamanhos.map((t) => (
            <button key={t.id} onClick={() => { setTamId(t.id); setSabIds([]); }} className={`rounded-lg border px-3 py-1.5 text-sm ${tamId === t.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 dark:border-zinc-800"}`}>{t.nome} <span className="text-xs text-zinc-400">({t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""})</span></button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold text-zinc-500">Sabores ({usados.length}/{max}){max > 1 && usados.length === 0 ? " · pode repetir o sabor" : ""}</div>
        {/* Como vai sair na comanda (mostra a fração quando repete). */}
        {usados.length > 0 && <div className="mb-1.5 text-sm font-semibold">{nomesDosSabores(usados, (id) => pizza.sabores.find((s) => s.id === id)?.nome ?? "?")}</div>}
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {pizza.sabores.map((s) => {
            const n = sabIds.filter((x) => x === s.id).length;
            const on = n > 0;
            const p = precoSabor(s.id);
            return (
              <div key={s.id} className="flex items-stretch gap-1.5">
              <button onClick={() => maisSabor(s.id)} aria-label={on && max > 1 ? `${s.nome}: mais uma parte` : undefined} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border p-2 text-left ${on ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                {s.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.foto_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">
                    {s.nome}
                    {s.novo && <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-emerald-600">novo</span>}
                  </span>
                  {s.descricao && <span className="block text-xs leading-tight text-zinc-500">{s.descricao}</span>}
                </span>
                {n > 1 && <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{n}×</span>}
                <span className="shrink-0 text-xs text-zinc-400">{p ? brl(p) : ""}</span>
              </button>
              {on && max > 1 && (
                <button onClick={() => menosSabor(s.id)} aria-label={`${s.nome}: tirar uma parte`} className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-lg font-bold text-zinc-500 dark:border-zinc-800">−</button>
              )}
              </div>
            );
          })}
        </div>
      </div>
      {pizza.bordas.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold text-zinc-500">Borda</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setBordaId("")} className={`rounded-lg border px-3 py-1.5 text-sm ${!bordaId ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 dark:border-zinc-800"}`}>Sem borda</button>
            {pizza.bordas.map((b) => (
              <button key={b.id} onClick={() => setBordaId(b.id)} className={`rounded-lg border px-3 py-1.5 text-sm ${bordaId === b.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 dark:border-zinc-800"}`}>{b.nome} {precoBorda(b.id) ? `+${brl(precoBorda(b.id))}` : ""}</button>
            ))}
          </div>
        </div>
      )}
      {comObs && (
        <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Observação (ex.: sem cebola)" className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      )}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-lg font-bold">{brl(preco)}</span>
        <button onClick={adicionar} disabled={usados.length === 0} className="btn-principal text-sm">Adicionar</button>
      </div>
    </Overlay>
  );
}

export function ComboModal({ item, grupos, opcoesDe, onClose, onAdd, comObs }: {
  item: Item;
  grupos: Grupo[];
  opcoesDe: (grupoId: string) => Opcao[];
  onClose: () => void;
  onAdd: (l: CartLine) => void;
  comObs?: boolean;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [obs, setObs] = useState("");
  const escolhidas = Object.values(sel).flat();
  const opcaoById = useMemo(() => new Map(grupos.flatMap((g) => opcoesDe(g.id)).map((o) => [o.id, o])), [grupos, opcoesDe]);
  const extra = escolhidas.reduce((s, id) => s + (opcaoById.get(id)?.preco ?? 0), 0);
  const preco = Math.round((item.preco + extra) * 100) / 100;

  function toggle(g: Grupo, opId: string) {
    setSel((c) => {
      const atual = c[g.id] ?? [];
      if (atual.includes(opId) && !g.permite_repetir) return { ...c, [g.id]: atual.filter((x) => x !== opId) };
      if (atual.length >= g.max && g.max > 0 && !g.permite_repetir) {
        if (g.max === 1) return { ...c, [g.id]: [opId] };
        return c;
      }
      return { ...c, [g.id]: [...atual, opId] };
    });
  }
  const okMin = grupos.every((g) => (sel[g.id]?.length ?? 0) >= (g.min ?? 0));

  function adicionar() {
    const nomes: string[] = [];
    for (const g of grupos) for (const id of sel[g.id] ?? []) { const o = opcaoById.get(id); if (o) nomes.push(o.preco > 0 ? `${o.nome} (+${o.preco})` : o.nome); }
    const o = obs.trim();
    const base = nomes.length ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}` : item.nome;
    onAdd({
      uid: novoUid(),
      descricao: base + (o ? `\nObs: ${o}` : ""),
      preco, qtd: 1,
      payload: { kind: "combo", itemId: item.id, opcaoIds: escolhidas, qtd: 1, obs: o || undefined },
    });
  }

  return (
    <Overlay onClose={onClose} titulo={item.nome}>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {grupos.map((g) => (
          <div key={g.id}>
            <div className="mb-1 text-xs font-semibold text-zinc-500">{g.nome} {g.min > 0 && <span className="text-rose-500">(escolha {g.min}{g.max > g.min ? `–${g.max}` : ""})</span>}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {opcoesDe(g.id).map((o) => {
                const on = (sel[g.id] ?? []).includes(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g, o.id)} className={`flex justify-between rounded-lg border px-2 py-1.5 text-left text-sm ${on ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                    <span className="truncate">{o.nome}</span>{o.preco > 0 && <span className="text-xs text-zinc-400">+{brl(o.preco)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {comObs && (
        <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Observação (ex.: sem cebola)" className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      )}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-lg font-bold">{brl(preco)}</span>
        <button onClick={adicionar} disabled={!okMin} className="btn-principal text-sm">Adicionar</button>
      </div>
    </Overlay>
  );
}

export function Overlay({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onClose} className="text-zinc-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
