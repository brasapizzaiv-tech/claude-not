"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirFatorItemNota } from "../actions";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "Vem em caixa, conta em unidade": fator = unidades por unidade da nota.
export function ItemFator({
  itemId, fator, qtd, unidade, valorTotal, temProduto,
}: {
  itemId: string;
  fator: number;
  qtd: number;
  unidade: string | null;
  valorTotal: number | null;
  temProduto: boolean;
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [txt, setTxt] = useState(fator && fator !== 1 ? String(fator).replace(".", ",") : "");
  const f = Number(txt.replace(",", ".")) > 0 ? Number(txt.replace(",", ".")) : 1;
  const unidades = qtd * f;
  const precoUn = valorTotal != null && unidades > 0 ? Number(valorTotal) / unidades : null;

  function salvar() {
    start(async () => {
      await definirFatorItemNota(itemId, f);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <label className="flex items-center gap-1 text-xs text-zinc-500" title="Quantas unidades do produto tem em cada unidade da nota (ex.: caixa com 27 → 27)">
        ×
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="decimal"
          placeholder="1"
          disabled={salvando}
          className={`w-14 rounded border px-1.5 py-0.5 text-right text-xs outline-none focus:border-orange-500 dark:bg-zinc-950 ${
            f !== 1 ? "border-orange-400 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-950/20" : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
        <span>un</span>
      </label>
      {f !== 1 ? (
        <span className="text-[11px] text-orange-600">
          = {unidades.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} un{precoUn != null ? ` · ${moeda(precoUn)}/un` : ""}
        </span>
      ) : temProduto && /^(CX|CXA|FD|FDO|PCT|PC|SC|ENG|DZ|PACK|CJ)$/i.test((unidade ?? "").trim()) ? (
        <span className="text-[11px] text-amber-600">vem em {unidade}: informe quantas un.</span>
      ) : null}
    </div>
  );
}
