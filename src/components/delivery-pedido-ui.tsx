"use client";

// Peças de montagem de pedido compartilhadas entre o painel do delivery
// (/delivery/novo) e o app público do cliente (/pedir): modal de pizza
// (tamanho, meio a meio, borda) e modal de complementos/combos.
import { useMemo, useState } from "react";
import type { LinhaPedido } from "@/lib/delivery-core";

export type Item = { id: string; nome: string; categoria: string; preco: number };
export type Tam = { id: string; nome: string; max_sabores: number };
export type Sabor = { id: string; nome: string };
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

export function PizzaModal({ pizza, onClose, onAdd }: {
  pizza: PizzaData;
  onClose: () => void;
  onAdd: (l: CartLine) => void;
}) {
  const [tamId, setTamId] = useState(pizza.tamanhos[0]?.id ?? "");
  const [sabIds, setSabIds] = useState<string[]>([]);
  const [bordaId, setBordaId] = useState<string>("");
  const tam = pizza.tamanhos.find((t) => t.id === tamId);
  const max = tam?.max_sabores ?? 1;

  const precoSabor = (sid: string) => pizza.saborPrecos.find((p) => p.sabor_id === sid && p.tamanho_id === tamId)?.preco ?? 0;
  const precoBorda = (bid: string) => pizza.bordaPrecos.find((p) => p.borda_id === bid && p.tamanho_id === tamId)?.preco ?? 0;
  const usados = sabIds.filter((s) => pizza.saborPrecos.some((p) => p.sabor_id === s && p.tamanho_id === tamId));
  const media = usados.length ? usados.reduce((s, id) => s + precoSabor(id), 0) / usados.length : 0;
  const preco = Math.round((media + (bordaId ? precoBorda(bordaId) : 0)) * 100) / 100;

  function toggleSabor(id: string) {
    setSabIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < max ? [...c, id] : c));
  }
  function adicionar() {
    if (!tam || usados.length === 0) return;
    const nomes = usados.map((id) => pizza.sabores.find((s) => s.id === id)?.nome ?? "?").join(" / ");
    const bordaNome = bordaId ? pizza.bordas.find((b) => b.id === bordaId)?.nome : "";
    onAdd({
      uid: novoUid(),
      descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : ""),
      preco, qtd: 1,
      payload: { kind: "pizza", tamanhoId: tamId, saborIds: usados, bordaId: bordaId || null, qtd: 1 },
    });
  }

  return (
    <Overlay onClose={onClose} titulo="🍕 Montar pizza">
      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold text-zinc-500">Tamanho</div>
        <div className="flex flex-wrap gap-2">
          {pizza.tamanhos.map((t) => (
            <button key={t.id} onClick={() => { setTamId(t.id); setSabIds([]); }} className={`rounded-lg border px-3 py-1.5 text-sm ${tamId === t.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 dark:border-zinc-800"}`}>{t.nome} <span className="text-xs text-zinc-400">({t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""})</span></button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold text-zinc-500">Sabores ({usados.length}/{max})</div>
        <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto">
          {pizza.sabores.map((s) => {
            const on = sabIds.includes(s.id);
            const p = precoSabor(s.id);
            return (
              <button key={s.id} onClick={() => toggleSabor(s.id)} className={`flex justify-between rounded-lg border px-2 py-1.5 text-left text-sm ${on ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                <span className="truncate">{s.nome}</span><span className="text-xs text-zinc-400">{p ? brl(p) : ""}</span>
              </button>
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
      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-lg font-bold">{brl(preco)}</span>
        <button onClick={adicionar} disabled={usados.length === 0} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">Adicionar</button>
      </div>
    </Overlay>
  );
}

export function ComboModal({ item, grupos, opcoesDe, onClose, onAdd }: {
  item: Item;
  grupos: Grupo[];
  opcoesDe: (grupoId: string) => Opcao[];
  onClose: () => void;
  onAdd: (l: CartLine) => void;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
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
    onAdd({
      uid: novoUid(),
      descricao: nomes.length ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}` : item.nome,
      preco, qtd: 1,
      payload: { kind: "combo", itemId: item.id, opcaoIds: escolhidas, qtd: 1 },
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
      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-lg font-bold">{brl(preco)}</span>
        <button onClick={adicionar} disabled={!okMin} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">Adicionar</button>
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
