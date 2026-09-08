"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receberFiado } from "../../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type ClienteFiado = {
  id: string;
  nome: string;
  telefone: string | null;
  saldo: number;
  lancamentos: { id: string; tipo: "debito" | "pagamento"; valor: number; descricao: string | null; forma: string | null; quando: string }[];
};

export function FiadoClient({ clientes, formas }: { clientes: ClienteFiado[]; formas: string[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aberto, setAberto] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(formas[0] ?? "Dinheiro");
  const [msg, setMsg] = useState<string | null>(null);
  const [soAbertos, setSoAbertos] = useState(true);

  const lista = clientes.filter((c) => !soAbertos || c.saldo > 0.005);

  function receber(c: ClienteFiado) {
    const v = Math.round(num(valor) * 100) / 100;
    if (!(v > 0)) { setMsg("Informe o valor."); return; }
    if (v > c.saldo + 0.005 && !confirm(`O valor (${brl(v)}) é maior que o saldo (${brl(c.saldo)}). Continuar?`)) return;
    start(async () => {
      try {
        const r = await receberFiado(c.id, v, forma);
        if (r.ok) { setMsg(`✓ Recebido ${brl(v)} de ${c.nome} em ${forma}.`); setAberto(null); setValor(""); router.refresh(); }
        else setMsg(r.mensagem || "Não deu certo.");
      } catch { setMsg("Sem conexão. Tente de novo."); }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" checked={soAbertos} onChange={(e) => setSoAbertos(e.target.checked)} /> só com saldo em aberto
        </label>
        {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">Nenhum cliente com fiado.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{c.nome}</p>
                  {c.telefone && <p className="text-xs text-zinc-500">{c.telefone}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${c.saldo > 0.005 ? "text-red-600" : "text-emerald-600"}`}>{brl(c.saldo)}</span>
                  {c.saldo > 0.005 && aberto !== c.id && (
                    <button onClick={() => { setAberto(c.id); setValor(c.saldo.toFixed(2).replace(".", ",")); setMsg(null); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
                      Receber
                    </button>
                  )}
                  <button onClick={() => setAberto(aberto === c.id ? null : c.id)} className="text-sm text-zinc-500 underline">{aberto === c.id ? "fechar" : "histórico"}</button>
                </div>
              </div>
              {aberto === c.id && (
                <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  {c.saldo > 0.005 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/10 p-2">
                      <span className="text-sm font-medium">Receber</span>
                      <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-28 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950" />
                      <select value={forma} onChange={(e) => setForma(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                        {formas.map((f) => <option key={f}>{f}</option>)}
                      </select>
                      <button onClick={() => receber(c)} disabled={pend} className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">{pend ? "…" : "Confirmar"}</button>
                    </div>
                  )}
                  <ul className="space-y-0.5 text-sm">
                    {c.lancamentos.map((l) => (
                      <li key={l.id} className="flex justify-between gap-2 text-zinc-600 dark:text-zinc-300">
                        <span>{l.quando} · {l.tipo === "debito" ? "🧾 " : "💵 "}{l.descricao ?? (l.tipo === "debito" ? "Venda fiada" : "Pagamento")}{l.forma ? ` (${l.forma})` : ""}</span>
                        <span className={l.tipo === "debito" ? "text-red-600" : "text-emerald-600"}>{l.tipo === "debito" ? "+" : "−"} {brl(l.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
