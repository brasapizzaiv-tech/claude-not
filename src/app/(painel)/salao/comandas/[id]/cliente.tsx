"use client";
import { Icone } from "@/components/icone";
import { avisar } from "@/components/dialogo";

import { siteUrl } from "@/lib/site-url";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  adicionarItemComanda,
  adicionarPizzaComanda,
  adicionarComboComanda,
} from "../../actions";

export function QRComanda({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url =
      siteUrl() +
      `/salao/comandas/${id}`;
    QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setSrc).catch(() => {});
  }, [id]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR" className="h-28 w-28" />;
}

type Item = { id: string; nome: string; categoria: string | null; preco: number };

export type ComboOpcao = { id: string; nome: string; preco: number };
export type ComboGrupo = {
  id: string;
  nome: string;
  min: number;
  max: number;
  permite_repetir: boolean;
  opcoes: ComboOpcao[];
};

const PIZZAS = "Pizzas";

// Lançador de itens estilo PDV: abas por categoria + busca + grade de cards.
// Tocar num card adiciona o item na comanda na hora.
export function LancarItens({
  comandaId,
  itens,
  categoriasOrdenadas,
  complementos,
  pizzaTamanhos,
  pizzaSabores,
  pizzaBordas,
}: {
  comandaId: string;
  itens: Item[];
  categoriasOrdenadas: string[];
  complementos: Record<string, ComboGrupo[]>;
  pizzaTamanhos: PizzaTamanho[];
  pizzaSabores: PizzaOpcao[];
  pizzaBordas: PizzaOpcao[];
}) {
  const temPizza = pizzaTamanhos.length > 0;
  const [combo, setCombo] = useState<Item | null>(null);
  const categorias = useMemo(() => {
    const comItens = new Set(itens.map((i) => i.categoria || "Outros"));
    // ordem definida no cardápio, só categorias que têm itens
    const base = categoriasOrdenadas.filter((c) => comItens.has(c));
    if (comItens.has("Outros") && !base.includes("Outros")) base.push("Outros");
    return base;
  }, [itens, categoriasOrdenadas]);

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

  function add(item: Item) {
    // item com complementos abre o montador
    if (complementos[item.id]?.length) {
      setCombo(item);
      return;
    }
    setAddId(item.id);
    start(async () => {
      try {
        const r = await adicionarItemComanda(comandaId, item.id);
        if (!r.ok) void avisar(r.mensagem);
      } catch {
        void avisar("Sem conexão. Confira se o item entrou antes de tentar de novo.");
      }
      router.refresh();
      setAddId("");
    });
  }

  const mostrarPizza = temPizza && !q && aba === PIZZAS;

  return (
    <div className="rounded-cartao border border-borda p-3">
      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto pelo nome..."
        className="mb-3 w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
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
                  : "bg-superficie-suave text-texto-suave hover:bg-zinc-200   dark:hover:bg-zinc-700"
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
                  : "bg-superficie-suave text-texto-suave hover:bg-zinc-200   dark:hover:bg-zinc-700"
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
              onClick={() => add(i)}
              disabled={p && addId === i.id}
              className="flex flex-col justify-between rounded-cartao border border-borda bg-white p-2.5 text-left hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 dark:border-borda-forte dark:bg-zinc-950 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/30"
            >
              <span className="text-sm font-medium leading-tight text-texto">
                {i.nome}
                {complementos[i.id]?.length ? (
                  <span className="ml-1 text-mini text-texto-fraco">montar ›</span>
                ) : null}
              </span>
              <span className="mt-1 text-xs font-semibold text-orange-600">{brl(Number(i.preco))}</span>
            </button>
          ))}
          {visiveis.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-texto-fraco">
              Nenhum produto {q ? "encontrado" : "nesta categoria"}.
            </p>
          )}
        </div>
      )}

      {combo && (
        <MontarCombo
          comandaId={comandaId}
          item={combo}
          grupos={complementos[combo.id] ?? []}
          onFechar={() => setCombo(null)}
        />
      )}
    </div>
  );
}

function MontarCombo({
  comandaId,
  item,
  grupos,
  onFechar,
}: {
  comandaId: string;
  item: Item;
  grupos: ComboGrupo[];
  onFechar: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [p, start] = useTransition();
  const router = useRouter();

  function toggle(g: ComboGrupo, opId: string) {
    setSel((s) => {
      const atual = s[g.id] ?? [];
      if (atual.includes(opId)) return { ...s, [g.id]: atual.filter((x) => x !== opId) };
      if (g.max === 1) return { ...s, [g.id]: [opId] }; // troca
      if (atual.length >= g.max) return s; // no limite
      return { ...s, [g.id]: [...atual, opId] };
    });
  }
  function inc(g: ComboGrupo, opId: string) {
    setSel((s) => {
      const atual = s[g.id] ?? [];
      if (atual.length >= g.max) return s;
      return { ...s, [g.id]: [...atual, opId] };
    });
  }
  function dec(g: ComboGrupo, opId: string) {
    setSel((s) => {
      const atual = s[g.id] ?? [];
      const i = atual.indexOf(opId);
      if (i < 0) return s;
      const novo = [...atual];
      novo.splice(i, 1);
      return { ...s, [g.id]: novo };
    });
  }
  const qtd = (gId: string, opId: string) =>
    (sel[gId] ?? []).filter((x) => x === opId).length;

  const todosIds = Object.values(sel).flat();
  const opcaoDe = new Map<string, ComboOpcao>();
  for (const g of grupos) for (const o of g.opcoes) opcaoDe.set(o.id, o);
  const extra = todosIds.reduce((s, id) => s + (opcaoDe.get(id)?.preco ?? 0), 0);
  const total = Math.round((Number(item.preco) + extra) * 100) / 100;

  const faltaMin = grupos.some((g) => (sel[g.id]?.length ?? 0) < g.min);

  function confirmar() {
    if (faltaMin) return;
    start(async () => {
      try {
        const r = await adicionarComboComanda(comandaId, item.id, todosIds);
        if (!r.ok) void avisar(r.mensagem);
      } catch {
        void avisar("Sem conexão. Confira se o item entrou antes de tentar de novo.");
      }
      router.refresh();
      onFechar();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-painel-cartao sm:rounded-cartao">
        <div className="flex items-center justify-between border-b border-borda p-4">
          <div>
            <p className="font-bold text-texto">{item.nome}</p>
            <p className="text-xs text-texto-suave">Base {brl(Number(item.preco))}</p>
          </div>
          <button onClick={onFechar} className="text-2xl leading-none text-texto-fraco hover:text-texto-suave">
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {grupos.map((g) => {
            const escolhidas = sel[g.id]?.length ?? 0;
            const okMin = escolhidas >= g.min;
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold text-texto">{g.nome}</p>
                  <span className={`text-mini ${okMin ? "text-texto-fraco" : "text-red-500"}`}>
                    {g.min > 0 ? `escolha ${g.min}` : "opcional"}
                    {g.max > 1 ? ` até ${g.max}` : ""} · {escolhidas}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.opcoes.map((o) => {
                    const n = qtd(g.id, o.id);
                    if (g.permite_repetir) {
                      const cheio = escolhidas >= g.max;
                      return (
                        <div
                          key={o.id}
                          className={`flex items-center justify-between rounded-controle border px-2 py-1 text-xs ${
                            n > 0
                              ? "border-orange-500 bg-orange-50 dark:bg-orange-500/15"
                              : "border-borda dark:border-borda-forte"
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-texto-suave">
                            {o.nome}
                            {o.preco > 0 && <span className="ml-1 text-texto-fraco">+{brl(o.preco)}</span>}
                          </span>
                          <span className="ml-1 flex items-center gap-1">
                            <button
                              onClick={() => dec(g, o.id)}
                              disabled={n === 0}
                              className="h-6 w-6 rounded bg-superficie-suave text-texto-suave disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-medium text-texto">{n}</span>
                            <button
                              onClick={() => inc(g, o.id)}
                              disabled={cheio}
                              className="h-6 w-6 rounded bg-orange-500 text-white disabled:opacity-30"
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    }
                    const on = n > 0;
                    return (
                      <button
                        key={o.id}
                        onClick={() => toggle(g, o.id)}
                        className={`flex items-center justify-between rounded-controle border px-2.5 py-1.5 text-left text-xs ${
                          on
                            ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                            : "border-borda text-texto-suave dark:border-borda-forte "
                        }`}
                      >
                        <span>
                          {on ? "✓ " : ""}
                          {o.nome}
                        </span>
                        {o.preco > 0 && <span className="ml-1 text-texto-fraco">+{brl(o.preco)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-borda p-4">
          <span className="text-lg font-bold text-texto">{brl(total)}</span>
          <button
            onClick={confirmar}
            disabled={p || faltaMin}
            className="rounded-controle bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {faltaMin ? "Escolha as opções" : "Adicionar"}
          </button>
        </div>
      </div>
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
      try {
        const r = await adicionarPizzaComanda(comandaId, tamId, sel, bordaId || null);
        if (!r.ok) void avisar(r.mensagem);
      } catch {
        void avisar("Sem conexão. Confira se a pizza entrou antes de tentar de novo.");
      }
      setSel([]);
      setBordaId("");
      setBusca("");
      router.refresh();
    });
  }

  return (
    <details className="rounded-cartao bg-painel-cartao">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-texto">
        <Icone nome="pizza" tamanho={15} className="mr-1.5" /> Montar pizza
      </summary>
      <div className="space-y-4 border-t border-borda p-4">
        {/* Tamanho */}
        <div>
          <p className="mb-1 text-xs font-medium text-texto-fraco">Tamanho</p>
          <div className="flex flex-wrap gap-2">
            {tamanhos.map((t) => (
              <button
                key={t.id}
                onClick={() => trocarTamanho(t.id, t.max)}
                className={`rounded-controle border px-3 py-1.5 text-sm ${
                  t.id === tamId
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-borda-forte text-texto-suave  "
                }`}
              >
                {t.nome}
                <span className="ml-1 text-mini opacity-70">
                  ({t.max} {t.max > 1 ? "sabores" : "sabor"})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sabores */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-texto-fraco">
              Sabores ({sel.length}/{max})
            </p>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar sabor..."
              className="w-40 rounded-controle border border-borda-forte bg-white px-2 py-1 text-xs focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-controle border border-borda p-1">
            {filtrados.map((s) => {
              const on = sel.includes(s.id);
              const bloqueado = !on && sel.length >= max;
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  disabled={bloqueado}
                  className={`flex w-full items-center justify-between rounded-controle px-2 py-1.5 text-left text-sm ${
                    on
                      ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                      : bloqueado
                        ? "text-zinc-300 dark:text-zinc-600"
                        : "text-texto-suave hover:bg-superficie-suave  "
                  }`}
                >
                  <span>
                    {on ? "✓ " : ""}
                    {s.nome}
                  </span>
                  <span className="text-xs text-texto-fraco">{brl(s.precos[tamId] ?? 0)}</span>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p className="px-2 py-2 text-xs text-texto-fraco">Nenhum sabor encontrado.</p>
            )}
          </div>
        </div>

        {/* Borda */}
        <div>
          <p className="mb-1 text-xs font-medium text-texto-fraco">Borda (opcional)</p>
          <select
            value={bordaId}
            onChange={(e) => setBordaId(e.target.value)}
            className="w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
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
        <div className="flex items-center justify-between border-t border-borda pt-3">
          <span className="text-lg font-bold text-texto">{brl(preco)}</span>
          <button
            onClick={add}
            disabled={p || !tamId || sel.length === 0}
            className="rounded-controle bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Adicionar pizza
          </button>
        </div>
      </div>
    </details>
  );
}
