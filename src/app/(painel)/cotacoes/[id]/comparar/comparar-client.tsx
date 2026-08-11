"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarPedidos } from "../../actions";

export type FornecedorCol = {
  id: string;
  nome: string;
  whatsapp: string | null;
  status: string;
  prazo_entrega: string | null;
  pedido_minimo: number | null;
  condicao_pagamento: string | null;
  observacao: string | null;
};

export type ProdutoLinha = {
  produto_id: string;
  nome: string;
  unidade: string;
  categoria: string;
  qtd: number;
  precos: Record<string, { preco: number | null; disp: boolean; foto: string | null }>;
  melhorForn: string | null;
};

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompararClient({
  cotacaoId,
  produtos,
  fornecedores,
}: {
  cotacaoId: string;
  produtos: ProdutoLinha[];
  fornecedores: FornecedorCol[];
}) {
  const router = useRouter();
  const [salvando, startSave] = useTransition();
  // Escolha por produto: fornecedor_id ou "" (não comprar). Padrão: mais barato.
  const [escolha, setEscolha] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      produtos.map((p) => [p.produto_id, p.melhorForn ?? ""]),
    ),
  );

  const totalPorForn = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of fornecedores) t[f.id] = 0;
    for (const p of produtos) {
      const fid = escolha[p.produto_id];
      if (!fid) continue;
      const cel = p.precos[fid];
      if (cel?.preco != null) t[fid] += cel.preco * p.qtd;
    }
    return t;
  }, [escolha, produtos, fornecedores]);

  const totalGeral = Object.values(totalPorForn).reduce((a, b) => a + b, 0);
  const itensEscolhidos = Object.values(escolha).filter(Boolean).length;

  function gerar() {
    startSave(async () => {
      const escolhas = produtos
        .filter((p) => escolha[p.produto_id])
        .map((p) => ({
          fornecedor_id: escolha[p.produto_id],
          produto_id: p.produto_id,
          qtd: p.qtd,
          preco_unit: p.precos[escolha[p.produto_id]]?.preco ?? null,
        }));
      await gerarPedidos(cotacaoId, escolhas);
      router.push(`/cotacoes/${cotacaoId}/pedidos`);
    });
  }

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProdutoLinha[]>();
    for (const p of produtos) {
      const arr = m.get(p.categoria) ?? [];
      arr.push(p);
      m.set(p.categoria, arr);
    }
    return m;
  }, [produtos]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {itensEscolhidos} de {produtos.length} itens escolhidos · total{" "}
          <b className="text-zinc-900 dark:text-zinc-100">{moeda(totalGeral)}</b>
        </p>
        <button
          onClick={gerar}
          disabled={salvando || itensEscolhidos === 0}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {salvando ? "Gerando..." : "Gerar pedidos →"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-3 text-left">Produto</th>
              <th className="px-3 py-3 text-right">Qtd</th>
              {fornecedores.map((f) => (
                <th key={f.id} className="px-3 py-3 text-right">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {f.nome}
                  </div>
                  <div className="text-[10px] font-normal text-zinc-400">
                    {f.status === "respondido" ? "respondeu" : "aguardando"}
                    {f.pedido_minimo ? ` · mín ${moeda(f.pedido_minimo)}` : ""}
                    {f.condicao_pagamento ? ` · ${f.condicao_pagamento}` : ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...porCategoria.entries()].map(([cat, itensCat]) => (
              <Fragment key={cat}>
                <tr>
                  <td
                    colSpan={2 + fornecedores.length}
                    className="bg-zinc-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900"
                  >
                    {cat}
                  </td>
                </tr>
                {itensCat.map((p) => (
                  <tr key={p.produto_id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {p.nome}
                      <span className="ml-1 text-xs text-zinc-400">
                        {p.unidade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {p.qtd}
                    </td>
                    {fornecedores.map((f) => {
                      const cel = p.precos[f.id];
                      const escolhido = escolha[p.produto_id] === f.id;
                      const melhor = p.melhorForn === f.id;
                      if (!cel) {
                        return (
                          <td
                            key={f.id}
                            className="px-3 py-2 text-right text-zinc-300 dark:text-zinc-700"
                          >
                            –
                          </td>
                        );
                      }
                      if (!cel.disp || cel.preco == null) {
                        return (
                          <td
                            key={f.id}
                            className="px-3 py-2 text-right text-xs text-amber-500"
                          >
                            em falta
                          </td>
                        );
                      }
                      return (
                        <td key={f.id} className="px-2 py-1 text-right">
                          <button
                            onClick={() =>
                              setEscolha((s) => ({
                                ...s,
                                [p.produto_id]: escolhido ? "" : f.id,
                              }))
                            }
                            className={`w-full rounded-md px-2 py-1 text-right text-sm transition ${
                              escolhido
                                ? "bg-orange-500 font-semibold text-white"
                                : melhor
                                  ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300"
                                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            }`}
                            title={
                              p.precos[f.id]?.foto ? "Tem foto do produto" : ""
                            }
                          >
                            {moeda(cel.preco)}
                            {p.precos[f.id]?.foto ? " 📷" : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300" colSpan={2}>
                Total escolhido
              </td>
              {fornecedores.map((f) => {
                const total = totalPorForn[f.id] ?? 0;
                const abaixoMin =
                  f.pedido_minimo != null &&
                  total > 0 &&
                  total < f.pedido_minimo;
                return (
                  <td
                    key={f.id}
                    className={`px-3 py-3 text-right ${
                      abaixoMin
                        ? "text-amber-600"
                        : "text-zinc-900 dark:text-zinc-100"
                    }`}
                    title={abaixoMin ? "Abaixo do pedido mínimo" : ""}
                  >
                    {total > 0 ? moeda(total) : "—"}
                    {abaixoMin ? " ⚠" : ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Clique num preço para escolher o fornecedor daquele item (verde = mais
        barato). ⚠ = total abaixo do pedido mínimo do fornecedor.
      </p>
    </div>
  );
}
