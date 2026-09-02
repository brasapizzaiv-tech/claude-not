"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { darBaixaLoteColab } from "../../etiqueta-actions";

export type EtqVenc = {
  id: string;
  numero: number;
  produto_nome: string;
  categoria_nome: string | null;
  validade: string | null;
  conservacao: string | null;
  quantidade: number | null;
  unidade: string | null;
  colaborador_nome: string | null;
};

export function ListaVencimentos({ token, lista, hoje }: { token: string; lista: EtqVenc[]; hoje: string }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [feito, setFeito] = useState<Record<string, string>>({});

  function baixa(id: string, status: "usada" | "descartada") {
    start(async () => {
      const r = await darBaixaLoteColab(token, [id], status);
      if (r.ok) {
        setFeito((s) => ({ ...s, [id]: status }));
        router.refresh();
      }
    });
  }

  if (lista.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
        Nada nessa faixa 🎉
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {lista.map((e) => {
        const vencida = !!e.validade && e.validade < hoje;
        const f = feito[e.id];
        return (
          <div
            key={e.id}
            className={`rounded-2xl border p-3 ${f ? "opacity-50" : ""} ${vencida ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">{e.produto_nome}</div>
                <div className="text-xs text-zinc-500">
                  {e.categoria_nome ? `${e.categoria_nome} · ` : ""}
                  {e.conservacao ?? ""}
                  {e.quantidade != null ? ` · ${e.quantidade} ${e.unidade ?? ""}` : ""}
                  {` · #${e.numero}`}
                  {e.colaborador_nome ? ` · ${e.colaborador_nome.split(" ")[0]}` : ""}
                </div>
              </div>
              <div className={`shrink-0 text-right text-sm font-bold ${vencida ? "text-red-600" : "text-zinc-800 dark:text-zinc-100"}`}>
                {e.validade ? dataBR(e.validade) : "—"}
                {vencida && <div className="text-[10px] font-semibold uppercase">vencida</div>}
              </div>
            </div>
            {f ? (
              <p className="mt-2 text-center text-xs font-medium text-green-600">✓ {f}</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => baixa(e.id, "usada")} disabled={proc} className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50">✓ Usada</button>
                <button onClick={() => baixa(e.id, "descartada")} disabled={proc} className="rounded-lg bg-zinc-700 py-2 text-sm font-semibold text-white disabled:opacity-50">🗑 Descartada</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
