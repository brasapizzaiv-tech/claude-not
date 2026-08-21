"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receberComandas } from "../actions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(".", "").replace(",", ".")) || 0;

type Comanda = { id: string; numero: number; mesa: string; total: number };

export function ReceberComandas({
  comandas,
  formas,
}: {
  comandas: Comanda[];
  formas: string[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [formaSel, setFormaSel] = useState<string>("");
  const [recebido, setRecebido] = useState(""); // dinheiro entregue (p/ troco)
  const [split, setSplit] = useState(false);
  const [linhas, setLinhas] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return comandas;
    return comandas.filter(
      (c) => String(c.numero).includes(q) || c.mesa.toLowerCase().includes(q),
    );
  }, [busca, comandas]);

  const soma = comandas
    .filter((c) => sel.has(c.id))
    .reduce((s, c) => s + c.total, 0);
  const somaR = Math.round(soma * 100) / 100;

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setMsg(null);
  }

  const somaSplit = formas.reduce((s, f) => s + num(linhas[f] ?? ""), 0);
  const faltaSplit = Math.round((somaR - somaSplit) * 100) / 100;
  const trocoQuick =
    formaSel === "Dinheiro" && recebido ? num(recebido) - somaR : 0;

  const podeConfirmar = split
    ? sel.size > 0 && Math.abs(faltaSplit) < 0.01
    : sel.size > 0 && !!formaSel && (formaSel !== "Dinheiro" || num(recebido) >= somaR - 0.01);

  function confirmar() {
    if (!podeConfirmar) return;
    const ids = [...sel];
    const pagamentos = split
      ? formas
          .filter((f) => num(linhas[f] ?? "") > 0)
          .map((f) => ({ forma: f, valor: Math.round(num(linhas[f]) * 100) / 100 }))
      : [{ forma: formaSel, valor: somaR }];
    setMsg(null);
    start(async () => {
      const r = await receberComandas(ids, pagamentos);
      if (r.ok) {
        setMsg(
          `✓ Recebido ${brl(r.total)} — comanda(s) ${r.numeros.map((n) => `#${n}`).join(", ")}.` +
            (trocoQuick > 0.005 ? ` Troco: ${brl(trocoQuick)}.` : ""),
        );
        setSel(new Set());
        setFormaSel("");
        setRecebido("");
        setSplit(false);
        setLinhas({});
        router.refresh();
      } else {
        setMsg("Não foi possível receber. Tente de novo.");
      }
    });
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          🧾 Receber comandas ({comandas.length} aberta{comandas.length === 1 ? "" : "s"})
        </p>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar por senha (nº) ou mesa..."
          className={`${inputCls} w-full max-w-xs`}
        />
      </div>

      {comandas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
          Nenhuma comanda aberta.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          {/* lista de comandas */}
          <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            {filtradas.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-800 ${
                  sel.has(c.id) ? "bg-orange-50 dark:bg-orange-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="font-bold text-zinc-800 dark:text-zinc-100">Nº {c.numero}</span>
                <span className="flex-1 truncate text-zinc-500">{c.mesa}</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{brl(c.total)}</span>
              </label>
            ))}
            {filtradas.length === 0 && (
              <p className="p-4 text-center text-xs text-zinc-400">Nenhuma comanda encontrada.</p>
            )}
          </div>

          {/* painel de pagamento */}
          <div className="h-fit space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-500">
                {sel.size} selecionada{sel.size === 1 ? "" : "s"}
              </span>
              <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{brl(somaR)}</span>
            </div>

            {sel.size > 0 && (
              <>
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
                          value={linhas[f] ?? ""}
                          onChange={(e) => setLinhas((s) => ({ ...s, [f]: e.target.value }))}
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500">Recebido</span>
                        <input
                          inputMode="decimal"
                          value={recebido}
                          onChange={(e) => setRecebido(e.target.value)}
                          placeholder={brl(somaR)}
                          className={`${inputCls} w-28 text-right`}
                        />
                      </div>
                    )}
                    {formaSel === "Dinheiro" && trocoQuick > 0.005 && (
                      <p className="text-right text-sm font-medium text-emerald-600">
                        Troco: {brl(trocoQuick)}
                      </p>
                    )}
                  </>
                )}

                <button
                  onClick={confirmar}
                  disabled={proc || !podeConfirmar}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {proc ? "Recebendo..." : `Receber ${brl(somaR)}`}
                </button>
              </>
            )}
            {msg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
