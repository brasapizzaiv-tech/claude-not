"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pagarSelecao } from "../actions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type ItemComanda = {
  id: string;
  nome: string;
  qtd: number;
  preco: number;
  pago: boolean;
  valorPago: number;
};
export type Comanda = {
  id: string;
  numero: number;
  mesa: string;
  total: number;
  restante: number;
  buffet: number;
  buffetPago: boolean;
  buffetValorPago: number;
  itens: ItemComanda[];
};

// Uma linha de consumo (item ou buffet de uma comanda), com o que ainda falta pagar.
type Linha = {
  key: string;
  comandaId: string;
  numero: number;
  tipo: "item" | "buffet";
  itemId?: string;
  nome: string;
  qtd: number;
  valor: number; // restante a pagar (já com serviço)
};

export type ItemMenu = { id: string; nome: string; preco: number };
export type ClienteMini = { id: string; nome: string; cpfCnpj: string | null };
type Extra = { uid: string; produtoId: string; nome: string; preco: number; qtd: number };

export function ReceberComandas({
  comandas,
  formas,
  servPercent,
  autoAbrir,
  menu = [],
  clientes = [],
}: {
  comandas: Comanda[];
  formas: string[];
  servPercent: number;
  autoAbrir?: string;
  menu?: ItemMenu[];
  clientes?: ClienteMini[];
}) {
  const router = useRouter();
  const fator = 1 + servPercent / 100;
  const alvo = autoAbrir ? comandas.find((c) => c.id === autoAbrir) : undefined;

  const [proc, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(alvo ? new Set([alvo.id]) : new Set());
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<Set<string>>(new Set());
  const [desconto, setDesconto] = useState("");
  const [acrescimo, setAcrescimo] = useState("");
  const [formaSel, setFormaSel] = useState("");
  const [recebido, setRecebido] = useState("");
  const [split, setSplit] = useState(false);
  const [linhasPg, setLinhasPg] = useState<Record<string, string>>({});
  const [pessoas, setPessoas] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [novoProd, setNovoProd] = useState("");
  const [novoQtd, setNovoQtd] = useState("1");
  const [clienteSel, setClienteSel] = useState<ClienteMini | null>(null);
  const [buscaCli, setBuscaCli] = useState("");
  const [abrirCli, setAbrirCli] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<{
    itens: { numero: number; total: number }[];
    subtotal: number;
    desconto: number;
    acrescimo: number;
    total: number;
    pagamentos: { forma: string; valor: number }[];
    troco: number;
    quando: string;
  } | null>(null);

  // Comandas escolhidas no topo.
  const selComandas = comandas.filter((c) => sel.has(c.id));

  // Sugestões para adicionar comandas (as abertas ainda não escolhidas).
  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return comandas
      .filter((c) => !sel.has(c.id))
      .filter((c) => !q || String(c.numero).includes(q) || c.mesa.toLowerCase().includes(q))
      .slice(0, 8);
  }, [comandas, sel, busca]);

  // Linhas de consumo (o que falta pagar) das comandas escolhidas.
  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = [];
    for (const c of selComandas) {
      const buffetRem = Math.round((c.buffet * fator - c.buffetValorPago) * 100) / 100;
      if (buffetRem > 0.005) {
        out.push({
          key: `${c.id}|buffet`,
          comandaId: c.id,
          numero: c.numero,
          tipo: "buffet",
          nome: "Buffet",
          qtd: 1,
          valor: buffetRem,
        });
      }
      for (const i of c.itens) {
        const rem = Math.round((i.qtd * i.preco * fator - i.valorPago) * 100) / 100;
        if (rem > 0.005) {
          out.push({
            key: `${c.id}|item|${i.id}`,
            comandaId: c.id,
            numero: c.numero,
            tipo: "item",
            itemId: i.id,
            nome: i.nome,
            qtd: i.qtd,
            valor: rem,
          });
        }
      }
    }
    return out;
  }, [selComandas, fator]);

  const linhasCarrinho = linhas.filter((l) => carrinho.has(l.key));
  const extraValor = Math.round(extras.reduce((s, e) => s + e.preco * e.qtd * fator, 0) * 100) / 100;
  const subtotalBruto =
    Math.round((linhasCarrinho.reduce((s, l) => s + l.valor, 0) + extraValor) * 100) / 100;
  const temAlgo = linhasCarrinho.length > 0 || extras.length > 0;
  const desc = num(desconto);
  const acr = num(acrescimo);
  const totalPagar = Math.max(0, Math.round((subtotalBruto - desc + acr) * 100) / 100);

  const somaSplit = formas.reduce((s, f) => s + num(linhasPg[f] ?? ""), 0);
  const faltaSplit = Math.round((totalPagar - somaSplit) * 100) / 100;
  const troco = formaSel === "Dinheiro" && recebido ? num(recebido) - totalPagar : 0;

  const podeConfirmar =
    temAlgo &&
    selComandas.length > 0 &&
    totalPagar >= 0 &&
    (split
      ? Math.abs(faltaSplit) < 0.01
      : !!formaSel && (formaSel !== "Dinheiro" || num(recebido) >= totalPagar - 0.01));

  const cliFiltrados = (() => {
    const q = buscaCli.trim().toLowerCase();
    return clientes
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || (c.cpfCnpj ?? "").includes(q))
      .slice(0, 8);
  })();

  function addExtra() {
    const p = menu.find((m) => m.id === novoProd);
    const q = Math.max(1, Math.round(num(novoQtd) || 1));
    if (!p) return;
    setExtras((s) => [
      ...s,
      { uid: `${p.id}-${new Date().getTime()}`, produtoId: p.id, nome: p.nome, preco: p.preco, qtd: q },
    ]);
    setNovoProd("");
    setNovoQtd("1");
    setMsg(null);
  }
  function tirarExtra(uid: string) {
    setExtras((s) => s.filter((e) => e.uid !== uid));
  }

  function addComanda(id: string) {
    setSel((s) => new Set(s).add(id));
    setBusca("");
    setMsg(null);
  }
  function removeComanda(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    // tira do carrinho as linhas dessa comanda
    setCarrinho((c) => {
      const n = new Set(c);
      for (const k of n) if (k.startsWith(id + "|")) n.delete(k);
      return n;
    });
  }
  function mover(key: string) {
    setCarrinho((c) => new Set(c).add(key));
    setMsg(null);
  }
  function tirar(key: string) {
    setCarrinho((c) => {
      const n = new Set(c);
      n.delete(key);
      return n;
    });
  }
  function pagarTudo() {
    setCarrinho(new Set(linhas.map((l) => l.key)));
    setMsg(null);
  }
  function limparCarrinho() {
    setCarrinho(new Set());
  }

  function confirmar() {
    if (!podeConfirmar) return;
    // agrupa as linhas do carrinho por comanda
    const porComanda = new Map<string, { itemIds: string[]; buffet: boolean }>();
    for (const l of linhasCarrinho) {
      const g = porComanda.get(l.comandaId) ?? { itemIds: [], buffet: false };
      if (l.tipo === "buffet") g.buffet = true;
      else if (l.itemId) g.itemIds.push(l.itemId);
      porComanda.set(l.comandaId, g);
    }
    const payload = [...porComanda.entries()].map(([comandaId, g]) => ({
      comandaId,
      itemIds: g.itemIds,
      buffet: g.buffet,
    }));
    const pagamentos = split
      ? formas
          .filter((f) => num(linhasPg[f] ?? "") > 0)
          .map((f) => ({ forma: f, valor: Math.round(num(linhasPg[f]) * 100) / 100 }))
      : [{ forma: formaSel, valor: totalPagar }];

    // Produtos avulsos → vão para a primeira comanda selecionada.
    const comandaExtra = selComandas[0]?.id;
    const extrasPayload = comandaExtra
      ? extras.map((e) => ({ comandaId: comandaExtra, itemId: e.produtoId, qtd: e.qtd }))
      : [];

    // recibo: total por comanda no carrinho (+ extras na primeira comanda)
    const totPorCom = new Map<string, { numero: number; total: number }>();
    for (const l of linhasCarrinho) {
      const t = totPorCom.get(l.comandaId) ?? { numero: l.numero, total: 0 };
      t.total = Math.round((t.total + l.valor) * 100) / 100;
      totPorCom.set(l.comandaId, t);
    }
    if (extraValor > 0 && comandaExtra) {
      const c0 = selComandas[0];
      const t = totPorCom.get(comandaExtra) ?? { numero: c0.numero, total: 0 };
      t.total = Math.round((t.total + extraValor) * 100) / 100;
      totPorCom.set(comandaExtra, t);
    }

    setMsg(null);
    start(async () => {
      const r = await pagarSelecao(payload, pagamentos, extrasPayload, clienteSel?.id ?? null);
      if (r.ok) {
        setMsg(
          `✓ Recebido ${brl(totalPagar)} — comanda(s) ${r.numeros.map((n) => `#${n}`).join(", ")}.` +
            (troco > 0.005 ? ` Troco: ${brl(troco)}.` : ""),
        );
        setRecibo({
          itens: [...totPorCom.values()],
          subtotal: subtotalBruto,
          desconto: desc,
          acrescimo: acr,
          total: totalPagar,
          pagamentos,
          troco: troco > 0.005 ? troco : 0,
          quando: new Date().toLocaleString("pt-BR"),
        });
        setTimeout(() => {
          try {
            window.print();
          } catch {}
        }, 400);
        setCarrinho(new Set());
        setExtras([]);
        setClienteSel(null);
        setDesconto("");
        setAcrescimo("");
        setFormaSel("");
        setRecebido("");
        setSplit(false);
        setLinhasPg({});
        setPessoas("");
        router.refresh();
      } else {
        setMsg("Não foi possível receber. Tente de novo.");
      }
    });
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const titulo = "text-center text-base font-bold text-zinc-800 dark:text-zinc-100";

  return (
    <div>
      {/* Topo: comandas selecionadas + busca para adicionar mais + cliente */}
      <div className="mb-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Comandas</p>
          <div className="relative">
            {clienteSel ? (
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                🧑 {clienteSel.nome}
                {clienteSel.cpfCnpj ? ` · ${clienteSel.cpfCnpj}` : ""}
                <button onClick={() => setClienteSel(null)} className="ml-1 text-blue-600 hover:text-red-600">
                  ✕
                </button>
              </span>
            ) : (
              <button
                onClick={() => setAbrirCli((v) => !v)}
                className="rounded-lg border border-blue-400 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                🧑 Vincular Cliente
              </button>
            )}
            {abrirCli && !clienteSel && (
              <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <input
                  autoFocus
                  value={buscaCli}
                  onChange={(e) => setBuscaCli(e.target.value)}
                  placeholder="Buscar cliente por nome ou CNPJ/CPF…"
                  className="mb-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <div className="max-h-56 overflow-y-auto">
                  {cliFiltrados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setClienteSel(c);
                        setAbrirCli(false);
                        setBuscaCli("");
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">{c.nome}</span>
                      {c.cpfCnpj && <span className="ml-1 text-xs text-zinc-400">{c.cpfCnpj}</span>}
                    </button>
                  ))}
                  {cliFiltrados.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-zinc-400">Nenhum cliente.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selComandas.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
            >
              Comanda {c.numero}
              {c.mesa ? ` · ${c.mesa}` : ""}
              <button onClick={() => removeComanda(c.id)} className="ml-1 text-emerald-600 hover:text-red-600">
                ✕
              </button>
            </span>
          ))}
          <div className="relative min-w-[220px] flex-1">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sugestoes[0]) addComanda(sugestoes[0].id);
              }}
              placeholder="Digite ou escolha as comandas para pagar…"
              className={`${inputCls} w-full`}
            />
            {busca.trim() && sugestoes.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {sugestoes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addComanda(c.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">
                      Comanda {c.numero} {c.mesa ? `· ${c.mesa}` : ""}
                    </span>
                    <span className="text-zinc-500">{brl(c.restante)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selComandas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
          Busque uma comanda acima (ou use o “Pagamento rápido” no salão / leia o QR) para começar.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Coluna 1 — Consumo */}
          <div className="flex min-h-[320px] flex-col rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className={titulo}>Consumo</p>
            <div className="mt-3 flex-1 space-y-1">
              {linhas.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-400">Nada a pagar nessas comandas.</p>
              ) : (
                linhas.map((l) => {
                  const noCarrinho = carrinho.has(l.key);
                  return (
                    <div
                      key={l.key}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        noCarrinho ? "opacity-40" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span className={`flex-1 truncate ${noCarrinho ? "line-through" : ""} text-zinc-800 dark:text-zinc-100`}>
                        {l.tipo === "item" && l.qtd > 1 ? `${l.qtd}× ` : ""}
                        {l.nome}
                        <span className="ml-1 text-[11px] text-zinc-400">#{l.numero}</span>
                      </span>
                      <span className={`${noCarrinho ? "line-through" : ""} text-zinc-600 dark:text-zinc-300`}>
                        {brl(l.valor)}
                      </span>
                      <button
                        onClick={() => mover(l.key)}
                        disabled={noCarrinho}
                        title="Adicionar ao pagamento"
                        className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-500">Subtotal (falta)</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-50">
                  {brl(Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100)}
                </span>
              </div>
              <button
                onClick={pagarTudo}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Pagar tudo
              </button>
            </div>
          </div>

          {/* Coluna 2 — Resumo de Pagamento */}
          <div className="flex min-h-[320px] flex-col rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className={titulo}>Resumo de Pagamento</p>
            <div className="mt-3 flex-1 space-y-1">
              {!temAlgo ? (
                <p className="py-8 text-center text-sm text-zinc-400">
                  Toque no “+” dos itens (ou em “Pagar tudo”) para trazer aqui o que vai receber.
                </p>
              ) : (
                <>
                  {linhasCarrinho.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                      <span className="flex-1 truncate text-zinc-800 dark:text-zinc-100">
                        {l.tipo === "item" && l.qtd > 1 ? `${l.qtd}× ` : ""}
                        {l.nome}
                        <span className="ml-1 text-[11px] text-zinc-400">#{l.numero}</span>
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-300">{brl(l.valor)}</span>
                      <button
                        onClick={() => tirar(l.key)}
                        title="Remover"
                        className="rounded-md px-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  {extras.map((e) => (
                    <div key={e.uid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                      <span className="flex-1 truncate text-zinc-800 dark:text-zinc-100">
                        {e.qtd > 1 ? `${e.qtd}× ` : ""}
                        {e.nome}
                        <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                          avulso
                        </span>
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-300">{brl(e.preco * e.qtd * fator)}</span>
                      <button
                        onClick={() => tirarExtra(e.uid)}
                        title="Remover"
                        className="rounded-md px-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Inserir Produto avulso */}
            {menu.length > 0 && (
              <div className="mt-2 flex items-end gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-[11px] text-zinc-500">Inserir produto</label>
                  <select
                    value={novoProd}
                    onChange={(e) => setNovoProd(e.target.value)}
                    className={`${inputCls} w-full`}
                  >
                    <option value="">Escolher…</option>
                    {menu.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome} — {brl(m.preco)}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  inputMode="numeric"
                  value={novoQtd}
                  onChange={(e) => setNovoQtd(e.target.value)}
                  className={`${inputCls} w-14 text-center`}
                  title="Quantidade"
                />
                <button
                  onClick={addExtra}
                  disabled={!novoProd}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            )}

            {temAlgo && (
              <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800">
                <button onClick={limparCarrinho} className="text-xs text-zinc-400 hover:text-red-600">
                  Limpar itens
                </button>
                <span className="font-bold text-zinc-900 dark:text-zinc-50">{brl(subtotalBruto)}</span>
              </div>
            )}
          </div>

          {/* Coluna 3 — Pagamento */}
          <div className="flex min-h-[320px] flex-col rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className={titulo}>Pagamento</p>

            {!temAlgo ? (
              <p className="my-auto text-center text-sm text-zinc-400">Nenhum item para pagamento.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Desconto (R$)</label>
                    <input
                      inputMode="decimal"
                      value={desconto}
                      onChange={(e) => setDesconto(e.target.value)}
                      placeholder="0,00"
                      className={`${inputCls} w-full text-right`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Acréscimo (R$)</label>
                    <input
                      inputMode="decimal"
                      value={acrescimo}
                      onChange={(e) => setAcrescimo(e.target.value)}
                      placeholder="0,00"
                      className={`${inputCls} w-full text-right`}
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <div className="flex items-center justify-between text-sm text-zinc-500">
                    <span>Subtotal</span>
                    <span>{brl(subtotalBruto)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-lg font-black text-zinc-900 dark:text-zinc-50">
                    <span>Total</span>
                    <span>{brl(totalPagar)}</span>
                  </div>
                </div>

                {/* Dividir por pessoa (calculadora) */}
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Dividir por</span>
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPessoas(String(n))}
                      className={`rounded px-2 py-0.5 font-medium ${
                        num(pessoas) === n
                          ? "bg-orange-500 text-white"
                          : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    inputMode="numeric"
                    value={pessoas}
                    onChange={(e) => setPessoas(e.target.value)}
                    placeholder="nº"
                    className="w-12 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-center dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  {num(pessoas) >= 2 && (
                    <span className="font-bold text-zinc-800 dark:text-zinc-100">
                      = {brl(Math.round((totalPagar / Math.round(num(pessoas))) * 100) / 100)}/pessoa
                    </span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                  Dividir em várias formas
                </label>

                {split ? (
                  <div className="space-y-1.5">
                    {formas.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-zinc-600 dark:text-zinc-300">{f}</span>
                        <input
                          inputMode="decimal"
                          value={linhasPg[f] ?? ""}
                          onChange={(e) => setLinhasPg((s) => ({ ...s, [f]: e.target.value }))}
                          placeholder="0,00"
                          className={`${inputCls} w-24 text-right`}
                        />
                      </div>
                    ))}
                    <p className={`text-right text-xs ${Math.abs(faltaSplit) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
                      {Math.abs(faltaSplit) < 0.01
                        ? "✓ fecha o total"
                        : faltaSplit > 0
                          ? `falta ${brl(faltaSplit)}`
                          : `passou ${brl(-faltaSplit)}`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {formas.map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormaSel(f)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            formaSel === f
                              ? "bg-orange-500 text-white"
                              : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    {formaSel === "Dinheiro" && (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-zinc-500">Recebido</span>
                          <input
                            inputMode="decimal"
                            value={recebido}
                            onChange={(e) => setRecebido(e.target.value)}
                            placeholder={brl(totalPagar)}
                            className={`${inputCls} w-28 text-right`}
                          />
                        </div>
                        {troco > 0.005 && (
                          <p className="text-right text-sm font-medium text-emerald-600">Troco: {brl(troco)}</p>
                        )}
                      </>
                    )}
                  </>
                )}

                <button
                  onClick={confirmar}
                  disabled={proc || !podeConfirmar}
                  className="w-full rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {proc ? "Recebendo..." : `Pagar ${brl(totalPagar)}`}
                </button>
                {msg && <p className="text-center text-xs text-emerald-700 dark:text-emerald-400">{msg}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cupom de recebimento (só na impressão — térmica) */}
      {recibo && (
        <div className="cupom-caixa">
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14pt" }}>BRASA — Recebimento</div>
          <div>{recibo.quando}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          {recibo.itens.map((i) => (
            <div key={i.numero} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Comanda #{i.numero}</span>
              <span>{brl(i.total)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          {(recibo.desconto > 0 || recibo.acrescimo > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span>{brl(recibo.subtotal)}</span>
            </div>
          )}
          {recibo.desconto > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Desconto</span>
              <span>− {brl(recibo.desconto)}</span>
            </div>
          )}
          {recibo.acrescimo > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Acréscimo</span>
              <span>+ {brl(recibo.acrescimo)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16pt", fontWeight: "bold" }}>
            <span>TOTAL</span>
            <span>{brl(recibo.total)}</span>
          </div>
          <div style={{ marginTop: "2mm" }}>
            {recibo.pagamentos.map((p) => (
              <div key={p.forma} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{p.forma}</span>
                <span>{brl(p.valor)}</span>
              </div>
            ))}
            {recibo.troco > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                <span>Troco</span>
                <span>{brl(recibo.troco)}</span>
              </div>
            )}
          </div>
          <div style={{ textAlign: "center", marginTop: "3mm" }}>Obrigado! Volte sempre.</div>
        </div>
      )}
      <style>{`
        .cupom-caixa { display: none; }
        @media print {
          @page { size: 72mm auto; margin: 0; }
          html, body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .cupom-caixa, .cupom-caixa * { visibility: visible; color: #000 !important; }
          .cupom-caixa {
            display: block; position: absolute; left: 0; top: 0;
            width: 72mm; box-sizing: border-box; padding: 3mm 3mm;
            font-family: 'Courier New', monospace; font-size: 11pt; line-height: 1.3;
          }
        }
      `}</style>
    </div>
  );
}
