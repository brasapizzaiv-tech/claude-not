"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarBuffet, juntarComandas, excluirComanda } from "../../actions";

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function AcoesComanda({
  comandaId,
  peso,
  tara,
  outras,
}: {
  comandaId: string;
  peso: number;
  tara: number;
  outras: { id: string; numero: number }[];
}) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [pesoV, setPeso] = useState(String(peso).replace(".", ","));
  const [taraV, setTara] = useState(String(tara).replace(".", ","));
  const [outra, setOutra] = useState("");

  const salvarBuffet = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", comandaId);
      fd.set("peso", pesoV);
      fd.set("tara", taraV);
      await editarBuffet(fd);
      router.refresh();
    });

  const juntar = () => {
    if (!outra) return;
    if (!confirm("Juntar a outra comanda nesta? A outra será apagada e tudo vem pra cá."))
      return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", comandaId);
      fd.set("outra", outra);
      await juntarComandas(fd);
      setOutra("");
      router.refresh();
    });
  };

  const excluir = () => {
    if (!confirm("Excluir esta comanda? Não dá pra desfazer.")) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", comandaId);
      await excluirComanda(fd);
    });
  };

  return (
    <details className="nao-imprimir mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-300">
        Ações da comanda (editar / juntar / excluir)
      </summary>

      <div className="mt-4 space-y-4">
        {/* Editar buffet */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Peso (kg)</label>
            <input value={pesoV} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tara (kg)</label>
            <input value={taraV} onChange={(e) => setTara(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} />
          </div>
          <button
            onClick={salvarBuffet}
            disabled={p}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
          >
            Recalcular buffet
          </button>
        </div>

        {/* Juntar */}
        {outras.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Juntar outra comanda nesta
              </label>
              <select value={outra} onChange={(e) => setOutra(e.target.value)} className={inputCls}>
                <option value="">escolha...</option>
                {outras.map((o) => (
                  <option key={o.id} value={o.id}>
                    Comanda #{o.numero}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={juntar}
              disabled={p || !outra}
              className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-60 dark:hover:bg-orange-950"
            >
              Juntar
            </button>
          </div>
        )}

        {/* Excluir */}
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            onClick={excluir}
            disabled={p}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950"
          >
            Excluir comanda
          </button>
        </div>
      </div>
    </details>
  );
}
