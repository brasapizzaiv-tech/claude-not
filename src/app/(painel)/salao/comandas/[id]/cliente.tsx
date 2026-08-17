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

const PIZZAS = "🍕 Pizzas";

// Lançador de itens estilo PDV: abas por categoria + busca + grade de cards.
// Tocar num card adiciona o item na comanda na hora.
export function LancarItens({
  comandaId,
  itens,
  pizzaTamanhos,
  pizzaSabores,
  pizzaBordas,
}: {
  comandaId: string;
  itens: Item[];
  pizzaTamanhos: PizzaTamanho[];
  pizzaSabores: PizzaOpcao[];
  pizzaBordas: PizzaOpcao[];
}) {
  const temPizza = pizzaTamanhos.length > 0;
  const categorias = useMemo(() => {
    const set: string[] = [];
    for (const i of itens) {
      const c = i.categoria || "Outros";
      if (!set.includes(c)) set.push(c);
    }
    return set;
  }, [itens]);

  const [aba, setAba] = useState<string>(categorias[0] ?? (temPizza ? PIZZAS : ""));
  const [busca, setBusca] = useState("");
  const [addId, setAddId] = useState("");
  const [p, start] = useTransition();
  const router = useRouter();

  const q = busca.trim().toLowerCase();
  const visiveis = useMemo(() => {
    if (q) return itens.filter((i) => i.nome.toLowerCase().includes(q));
    return itens.filter((i) => (i.categoria || "Outros") === aba);
  }, [itens, q, aba]);

  function add(id: string) {
    setAddId(id);
    start(async () => {
      await adicionarItemComanda(comandaId, id);
      router.refresh();
      setAddId("");
    });
  }

  const mostrarPizza = temPizza && !q && aba === PIZZAS;

  return (
    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto pelo nome..."
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />

      {/* Abas */}
      {!q && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setAba(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                aba === c
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {c}
            </button>
          ))}
          {temPizza && (
            <button
              onClick={() => setAba(PIZZAS)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                aba === PIZZAS
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {PIZZAS}
            </button>
          )}
        </div>
      )}

      {/* Conteúdo */}
      {mostrarPizza ? (
        <MontarPizza
          comandaId={comandaId}
          tamanhos={pizzaTamanhos}
          sabores={pizzaSabores}
          bordas={pizzaBordas}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visiveis.map((i) => (
            <button
              key={i.id}
              onClick={() => add(i.id)}
              disabled={p && addId === i.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-2.5 text-left hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/30"
            >
              <span className="text-sm font-medium leading-tight text-zinc-900 dark:text-zinc-100">
                {i.nome}
              </span>
              <span className="mt-1 text-xs font-semibold text-orange-600">{brl(Number(i.preco))}</span>
            </button>
          ))}
          {visiveis.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-zinc-400">
              Nenhum produto {q ? "encontrado" : "nesta categoria"}.
            </p>
          )}
        </div>
      )}
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
