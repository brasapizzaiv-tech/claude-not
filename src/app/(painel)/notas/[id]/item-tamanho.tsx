"use client";

// Produto em vários tamanhos (migration 0245): a descrição da nota costuma
// trazer o tamanho ("EXTRATO TOMATE 1,04KG - CX 12"). Mostra quanto dá de
// verdade e, se o tamanho é novo, guarda no cadastro com um toque.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { lerTamanho, textoTamanho } from "@/lib/embalagens";
import { adicionarTamanhoProduto } from "../actions";

export function ItemTamanho({
  produtoId, descricao, unidades, tamanhos, medida,
}: {
  produtoId: string;
  descricao: string;
  unidades: number; // já com o fator (quantas unidades do produto)
  tamanhos: number[];
  medida: string | null;
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const lido = lerTamanho(descricao);
  if (!lido) {
    return <p className="mt-1 text-mini text-amber-600">Vem em vários tamanhos: a nota não diz qual.</p>;
  }
  const novo = !tamanhos.some((t) => Math.abs(t - lido.v) < 0.0001);
  return (
    <p className="mt-1 text-mini text-texto-suave">
      {textoTamanho(lido.v, lido.medida)} cada · {unidades.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} un ≈{" "}
      <b className="text-texto">{textoTamanho(unidades * lido.v, medida ?? lido.medida)}</b>
      {novo && (
        <button
          type="button"
          disabled={salvando}
          onClick={() => start(async () => { await adicionarTamanhoProduto(produtoId, lido.v); router.refresh(); })}
          className="ml-2 font-semibold text-texto-marca hover:underline disabled:opacity-50"
        >
          + guardar {textoTamanho(lido.v, lido.medida)} no cadastro
        </button>
      )}
    </p>
  );
}
