"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cancelarItensComanda } from "../../fiscal-actions";

export type ComandaMesa = {
  id: string;
  numero: number;
  abertaEm: string | null;
  buffet: { valor: number; pago: boolean; valorPago: number } | null;
  itens: { id: string; descricao: string; qtd: number; preco: number; pago: boolean; valorPago: number }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "";

// Linha achatada (produto de uma comanda) para as visões.
type Linha = {
  key: string;
  itemId: string | null; // null = buffet (não cancelável)
  comandaNumero: number;
  descricao: string;
  qtd: number;
  payable: number; // com serviço
  pago: number;
  pendente: number;
  quitado: boolean;
};

export function MesaDetalhe({
  mesa,
  comandas,
  fator,
}: {
  mesa: string;
  comandas: ComandaMesa[];
  fator: number;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<"produtos" | "comandas">("produtos");
  const [busca, setBusca] = useState("");
  const [ocultarPagos, setOcultarPagos] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  // Constrói as linhas de cada comanda.
  const porComanda = useMemo(() => {
    return comandas.map((c) => {
      const linhas: Linha[] = [];
      if (c.buffet) {
        const payable = Math.round(c.buffet.valor * fator * 100) / 100;
        const pago = c.buffet.valorPago;
        linhas.push({
          key: `b-${c.id}`,
          itemId: null,
          comandaNumero: c.numero,
          descricao: "Buffet",
          qtd: 1,
          payable,
          pago,
          pendente: Math.max(0, Math.round((payable - pago) * 100) / 100),
          quitado: c.buffet.pago,
        });
      }
      for (const i of c.itens) {
        const payable = Math.round(i.qtd * i.preco * fator * 100) / 100;
        const pago = i.valorPago;
        linhas.push({
          key: `i-${i.id}`,
          itemId: i.id,
          comandaNumero: c.numero,
          descricao: i.descricao,
          qtd: i.qtd,
          payable,
          pago,
          pendente: Math.max(0, Math.round((payable - pago) * 100) / 100),
          quitado: i.pago,
        });
      }
      return { comanda: c, linhas };
    });
  }, [comandas, fator]);

  const todasLinhas = useMemo(() => porComanda.flatMap((g) => g.linhas), [porComanda]);

  const visivel = (l: Linha) => {
    const q = busca.trim().toLowerCase();
    if (q && !l.descricao.toLowerCase().includes(q)) return false;
    if (ocultarPagos && l.quitado) return false;
    return true;
  };

  const linhasVis = todasLinhas.filter(visivel);
  const selecionaveis = linhasVis.filter((l) => l.itemId && !l.quitado);

  const subtotal = todasLinhas.reduce((s, l) => s + l.payable, 0);
  const totalPago = todasLinhas.reduce((s, l) => s + l.pago, 0);
  const totalPendente = todasLinhas.reduce((s, l) => s + l.pendente, 0);

  function toggle(key: string) {
    setSel((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  function marcarTodos() {
    const todos = selecionaveis.every((l) => sel.has(l.key));
    setSel(todos ? new Set() : new Set(selecionaveis.map((l) => l.key)));
  }

  function cancelar() {
    const ids = todasLinhas.filter((l) => l.itemId && sel.has(l.key)).map((l) => l.itemId as string);
    if (ids.length === 0) { setMsg("Selecione ao menos um item (não pago)."); return; }
    const motivo = window.prompt(`Cancelar ${ids.length} item(ns)? Informe o motivo:`, "");
    if (motivo == null) return;
    if (motivo.trim().length < 3) { window.alert("Informe o motivo (mín. 3 caracteres)."); return; }
    start(async () => {
      const r = await cancelarItensComanda(ids, motivo.trim());
      setMsg(r.ok ? `✓ ${r.cancelados} item(ns) cancelado(s).` : (r.mensagem || "Não deu pra cancelar."));
      setSel(new Set());
      router.refresh();
    });
  }

  const linhaUI = (l: Linha) => (
    <div key={l.key} className="flex items-center gap-2 py-1.5 text-sm">
      {l.itemId && !l.quitado ? (
        <input type="checkbox" checked={sel.has(l.key)} onChange={() => toggle(l.key)} className="h-4 w-4" />
      ) : (
        <span className="inline-block h-4 w-4" />
      )}
      <span className="font-medium text-emerald-600">{l.qtd > 1 ? `${l.qtd}× ` : "1× "}</span>
      <span className="flex-1 truncate text-zinc-800 dark:text-zinc-100">{l.descricao}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${l.quitado ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
        {l.quitado ? "Pago" : "Pendente"}
      </span>
      <span className="w-20 text-right text-zinc-700 dark:text-zinc-300">{brl(l.payable)}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Detalhes da mesa · {mesa}</h1>
          <p className="text-sm text-zinc-500">Comandas, itens e o que está pago/pendente da mesa.</p>
        </div>
        <Link href="/salao" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">Fechar</Link>
      </div>

      {/* Busca + abas */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar produto..."
          className="min-w-48 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
          {(["produtos", "comandas"] as const).map((a) => (
            <button key={a} onClick={() => setAba(a)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${aba === a ? "bg-emerald-600 text-white" : "text-zinc-600 dark:text-zinc-300"}`}>{a}</button>
          ))}
        </div>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
        <input type="checkbox" checked={ocultarPagos} onChange={(e) => setOcultarPagos(e.target.checked)} />
        Pagos: não mostrar
      </label>

      {/* Ações de seleção */}
      {selecionaveis.length > 0 && (
        <div className="mt-2 flex gap-3 text-sm">
          <button onClick={marcarTodos} className="font-medium text-emerald-600 hover:underline">Marcar/Desmarcar todos</button>
          {sel.size > 0 && <span className="text-zinc-400">{sel.size} selecionado(s)</span>}
        </div>
      )}

      {/* Conteúdo */}
      <div className="mt-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        {todasLinhas.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Nenhuma comanda aberta nesta mesa.</p>
        ) : aba === "produtos" ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {linhasVis.length === 0 ? <p className="py-6 text-center text-sm text-zinc-400">Nada com esse filtro.</p> : linhasVis.map(linhaUI)}
          </div>
        ) : (
          <div className="space-y-4">
            {porComanda.map((g) => {
              const vis = g.linhas.filter(visivel);
              if (vis.length === 0) return null;
              return (
                <div key={g.comanda.id}>
                  <p className="mb-1 text-xs font-semibold text-zinc-500">
                    Comanda {g.comanda.numero}{g.comanda.abertaEm ? ` · feita às ${hora(g.comanda.abertaEm)}` : ""}
                  </p>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">{vis.map(linhaUI)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Totais */}
        <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <div className="flex justify-between text-zinc-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div className="flex justify-between text-emerald-600"><span>Total pago</span><span>{brl(totalPago)}</span></div>
          <div className="flex justify-between text-lg font-bold text-zinc-900 dark:text-zinc-50"><span>Total pendente</span><span>{brl(totalPendente)}</span></div>
        </div>
      </div>

      {msg && <p className="mt-2 text-center text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}

      {/* Rodapé */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={cancelar}
          disabled={proc || sel.size === 0}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {proc ? "Cancelando..." : "✕ Cancelar produtos"}
        </button>
        <Link href="/salao/caixa" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          Ir ao caixa
        </Link>
      </div>
    </div>
  );
}
