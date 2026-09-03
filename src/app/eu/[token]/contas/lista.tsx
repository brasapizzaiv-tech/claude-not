"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { pagarContasColab } from "./contas-actions";

export type ContaApp = {
  id: string;
  ids: string[];
  descricao: string;
  fornecedor: string | null;
  categoria: string | null;
  valor: number;
  vencimento: string | null;
  banco: string | null;
  forma: string | null;
};

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function ContasColab({ token, contas, hoje }: { token: string; contas: ContaApp[]; hoje: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [dataPago, setDataPago] = useState(hoje);
  const [proc, start] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);

  const q = norm(busca.trim());
  const filtradas = useMemo(
    () => (q ? contas.filter((c) => norm(c.descricao).includes(q) || norm(c.fornecedor ?? "").includes(q) || norm(c.categoria ?? "").includes(q)) : contas),
    [contas, q],
  );

  // Grupos: Vencidas · Hoje · Amanhã · Próximos 7 dias · Depois · Sem vencimento
  const grupos = useMemo(() => {
    const g: { titulo: string; cor: string; itens: ContaApp[] }[] = [
      { titulo: "Vencidas", cor: "text-red-600", itens: [] },
      { titulo: "Hoje", cor: "text-orange-600", itens: [] },
      { titulo: "Amanhã", cor: "text-amber-600", itens: [] },
      { titulo: "Próximos 7 dias", cor: "text-zinc-700 dark:text-zinc-200", itens: [] },
      { titulo: "Depois", cor: "text-zinc-500", itens: [] },
      { titulo: "Sem vencimento", cor: "text-zinc-400", itens: [] },
    ];
    for (const c of filtradas) {
      const v = c.vencimento;
      const i = !v ? 5 : v < hoje ? 0 : v === hoje ? 1 : v === addDias(hoje, 1) ? 2 : v <= addDias(hoje, 7) ? 3 : 4;
      g[i].itens.push(c);
    }
    return g.filter((x) => x.itens.length > 0);
  }, [filtradas, hoje]);

  const alternar = (id: string) =>
    setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selecionadas = contas.filter((c) => marcadas.has(c.id));
  const total = selecionadas.reduce((s, c) => s + c.valor, 0);

  function darBaixa() {
    if (selecionadas.length === 0) return;
    if (!confirm(`Dar baixa em ${selecionadas.length} conta(s) — ${moeda(total)} — pagas em ${dataBR(dataPago)}?`)) return;
    const ids = selecionadas.flatMap((c) => c.ids);
    start(async () => {
      const r = await pagarContasColab(token, ids, dataPago);
      if (r.ok) {
        setFeito(`✓ ${selecionadas.length} conta(s) baixada(s) — ${moeda(total)}`);
        setMarcadas(new Set());
        router.refresh();
        setTimeout(() => setFeito(null), 3500);
      } else {
        alert(r.mensagem || "Não foi possível.");
      }
    });
  }

  return (
    <div>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="🔍 Fornecedor, descrição ou categoria"
        className="mb-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      {contas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">Nenhuma conta aberta 🎉</p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">Nada encontrado.</p>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.titulo}>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className={`text-sm font-semibold ${g.cor}`}>{g.titulo}</h2>
                <span className={`text-xs font-medium ${g.cor}`}>{moeda(g.itens.reduce((s, c) => s + c.valor, 0))}</span>
              </div>
              <div className="space-y-1.5">
                {g.itens.map((c) => {
                  const sel = marcadas.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${sel ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
                    >
                      <input type="checkbox" checked={sel} onChange={() => alternar(c.id)} className="mt-1 h-5 w-5 accent-green-600" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{c.descricao}</div>
                        <div className="text-xs text-zinc-500">
                          {c.fornecedor && c.fornecedor !== c.descricao ? `${c.fornecedor} · ` : ""}
                          {c.categoria ?? ""}
                          {c.vencimento ? ` · vence ${dataBR(c.vencimento)}` : ""}
                          {c.banco ? ` · ${c.banco}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-bold text-zinc-900 dark:text-zinc-50">{moeda(c.valor)}</div>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Barra fixa de baixa */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-md">
          {feito && <p className="mb-2 text-center text-sm font-medium text-green-600">{feito}</p>}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">
              {marcadas.size === 0 ? "Marque as contas pagas" : `${marcadas.size} selecionada(s) · ${moeda(total)}`}
            </span>
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              pago em
              <input type="date" value={dataPago} onChange={(e) => setDataPago(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
            </label>
          </div>
          <button
            onClick={darBaixa}
            disabled={proc || marcadas.size === 0}
            className="w-full rounded-xl bg-green-600 py-3 text-base font-bold text-white disabled:opacity-40"
          >
            {proc ? "Dando baixa..." : `✓ Dar baixa em ${marcadas.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
