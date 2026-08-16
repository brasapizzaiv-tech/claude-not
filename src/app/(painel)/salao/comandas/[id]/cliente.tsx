"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { adicionarItemComanda, adicionarPizzaComanda } from "../../actions";

export function QRComanda({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url =
      (typeof window !== "undefined" ? window.location.origin : "") +
      `/salao/comandas/${id}`;
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setSrc).catch(() => {});
  }, [id]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR" className="h-28 w-28" />;
}

type Item = { id: string; nome: string; categoria: string | null; preco: number };

export function AddItem({
  comandaId,
  itens,
}: {
  comandaId: string;
  itens: Item[];
}) {
  const [sel, setSel] = useState("");
  const [p, start] = useTransition();
  const router = useRouter();

  const grupos = new Map<string, Item[]>();
  for (const i of itens) {
    const k = i.categoria || "Outros";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }

  function add() {
    if (!sel) return;
    start(async () => {
      await adicionarItemComanda(comandaId, sel);
      setSel("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="min-w-56 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <option value="">+ adicionar item do cardápio...</option>
        {[...grupos.entries()].map(([cat, its]) => (
          <optgroup key={cat} label={cat}>
            {its.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} — {Number(i.preco).toFixed(2).replace(".", ",")}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        onClick={add}
        disabled={p || !sel}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        Adicionar
      </button>
    </div>
  );
}

// ---------- Montador de pizza ----------
export type PizzaTamanho = { id: string; nome: string; max: number };
export type PizzaOpcao = { id: string; nome: string; precos: Record<string, number> };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MontarPizza({
  comandaId,
  tamanhos,
  sabores,
  bordas,
}: {
  comandaId: string;
  tamanhos: PizzaTamanho[];
  sabores: PizzaOpcao[];
  bordas: PizzaOpcao[];
}) {
  const [tamId, setTamId] = useState(tamanhos[0]?.id ?? "");
  const [sel, setSel] = useState<string[]>([]);
  const [bordaId, setBordaId] = useState("");
  const [busca, setBusca] = useState("");
  const [p, start] = useTransition();
  const router = useRouter();

  const tam = tamanhos.find((t) => t.id === tamId);
  const max = tam?.max ?? 1;

  // ao trocar de tamanho, respeita o novo limite de sabores
  function trocarTamanho(id: string, novoMax: number) {
    setTamId(id);
    setSel((s) => s.slice(0, novoMax));
  }

  const saboresDoTam = useMemo(
    () => sabores.filter((s) => s.precos[tamId] != null),
    [sabores, tamId],
  );
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? saboresDoTam.filter((s) => s.nome.toLowerCase().includes(q)) : saboresDoTam;
  }, [saboresDoTam, busca]);

  function toggle(id: string) {
    setSel((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= max) return s; // já no limite
      return [...s, id];
    });
  }

  const bordaPreco = bordaId ? bordas.find((b) => b.id === bordaId)?.precos[tamId] ?? 0 : 0;
  const media =
    sel.length > 0
      ? sel.reduce((soma, id) => soma + (sabores.find((s) => s.id === id)?.precos[tamId] ?? 0), 0) /
        sel.length
      : 0;
  const preco = Math.round((media + bordaPreco) * 100) / 100;

  function add() {
    if (!tamId || sel.length === 0) return;
    start(async () => {
      await adicionarPizzaComanda(comandaId, tamId, sel, bordaId || null);
      setSel([]);
      setBordaId("");
      setBusca("");
      router.refresh();
    });
  }

  return (
    <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        🍕 Montar pizza
      </summary>
      <div className="space-y-4 border-t border-zinc-100 p-4 dark:border-zinc-800">
        {/* Tamanho */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-zinc-400">Tamanho</p>
          <div className="flex flex-wrap gap-2">
            {tamanhos.map((t) => (
              <button
                key={t.id}
                onClick={() => trocarTamanho(t.id, t.max)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  t.id === tamId
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {t.nome}
                <span className="ml-1 text-[11px] opacity-70">
                  ({t.max} {t.max > 1 ? "sabores" : "sabor"})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sabores */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium uppercase text-zinc-400">
              Sabores ({sel.length}/{max})
            </p>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar sabor..."
              className="w-40 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-1 dark:border-zinc-800">
            {filtrados.map((s) => {
              const on = sel.includes(s.id);
              const bloqueado = !on && sel.length >= max;
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  disabled={bloqueado}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                    on
                      ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                      : bloqueado
                        ? "text-zinc-300 dark:text-zinc-600"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span>
                    {on ? "✓ " : ""}
                    {s.nome}
                  </span>
                  <span className="text-xs text-zinc-400">{brl(s.precos[tamId] ?? 0)}</span>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p className="px-2 py-2 text-xs text-zinc-400">Nenhum sabor encontrado.</p>
            )}
          </div>
        </div>

        {/* Borda */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-zinc-400">Borda (opcional)</p>
          <select
            value={bordaId}
            onChange={(e) => setBordaId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Sem borda</option>
            {bordas
              .filter((b) => b.precos[tamId] != null)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome} — {brl(b.precos[tamId] ?? 0)}
                </option>
              ))}
          </select>
        </div>

        {/* Preço + adicionar */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{brl(preco)}</span>
          <button
            onClick={add}
            disabled={p || !tamId || sel.length === 0}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Adicionar pizza
          </button>
        </div>
      </div>
    </details>
  );
}
