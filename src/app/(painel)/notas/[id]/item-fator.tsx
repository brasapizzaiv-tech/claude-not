"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirFatorItemNota, definirUnidadeProduto } from "../actions";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mesma lista do cadastro de produtos.
const UNIDADES = ["un", "kg", "g", "L", "ml", "cx", "pct", "fardo", "dz", "saco", "bandeja"];

// "Vem em caixa, conta em quilo": fator = quantas unidades DO PRODUTO (na
// unidade dele: kg, un, L...) tem em cada unidade da nota. A unidade do
// produto aparece ao lado e pode ser trocada aqui mesmo — é olhando a nota
// que se percebe que o estoque está contando na medida errada (08/10/2026).
export function ItemFator({
  itemId, fator, qtd, unidade, valorTotal, temProduto, produtoId, unidadeProduto,
}: {
  itemId: string;
  fator: number;
  qtd: number;
  unidade: string | null;
  valorTotal: number | null;
  temProduto: boolean;
  produtoId: string | null;
  unidadeProduto: string;
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [txt, setTxt] = useState(fator && fator !== 1 ? String(fator).replace(".", ",") : "");
  const f = Number(txt.replace(",", ".")) > 0 ? Number(txt.replace(",", ".")) : 1;
  const unidades = qtd * f;
  const precoUn = valorTotal != null && unidades > 0 ? Number(valorTotal) / unidades : null;
  const un = unidadeProduto || "un";
  const opcoes = UNIDADES.includes(un) ? UNIDADES : [un, ...UNIDADES];

  function salvar() {
    start(async () => {
      await definirFatorItemNota(itemId, f);
      router.refresh();
    });
  }
  function trocarUnidade(nova: string) {
    if (!produtoId || !nova || nova === un) return;
    start(async () => {
      await definirUnidadeProduto(produtoId, nova);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <label className="flex items-center gap-1 text-xs text-texto-suave" title={`Quanto do produto (em ${un}) tem em cada ${unidade || "unidade"} da nota (ex.: caixa com 27 un → 27; saco de 25 kg → 25)`}>
        ×
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="decimal"
          placeholder="1"
          disabled={salvando}
          className={`w-14 rounded border px-1.5 py-0.5 text-right text-xs focus:border-orange-500 dark:bg-zinc-950 ${
            f !== 1 ? "border-orange-400 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-950/20" : "border-borda-forte"
          }`}
        />
        {temProduto && produtoId ? (
          <select
            value={un}
            onChange={(e) => trocarUnidade(e.target.value)}
            disabled={salvando}
            title="Unidade em que este produto entra no estoque (vale pro cadastro do produto)"
            className="rounded border border-borda-forte bg-transparent px-1 py-0.5 text-xs dark:bg-zinc-950"
          >
            {opcoes.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span>un</span>
        )}
      </label>
      {f !== 1 ? (
        <span className="text-mini text-orange-600">
          = {unidades.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {un}{precoUn != null ? ` · ${moeda(precoUn)}/${un}` : ""}
        </span>
      ) : temProduto && /^(CX|CXA|FD|FDO|PCT|PC|SC|ENG|DZ|PACK|CJ)$/i.test((unidade ?? "").trim()) ? (
        <span className="text-mini text-amber-600">vem em {unidade}: informe quantos {un}.</span>
      ) : null}
    </div>
  );
}
