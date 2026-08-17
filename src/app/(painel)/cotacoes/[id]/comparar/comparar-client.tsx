"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarPedidos } from "../../actions";

export type FornecedorCol = {
  id: string;
  nome: string;
  whatsapp: string | null;
  status: string;
  respondido_em: string | null;
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
  precos: Record<
    string,
    { preco: number | null; disp: boolean; foto: string | null; emb: string | null; obs: string | null }
  >;
  melhorForn: string | null;
};

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Cada categoria ganha uma cor (faixa + tom das linhas, alternando claro/escuro).
const CAT_CORES = [
  { band: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200", a: "bg-sky-50 dark:bg-sky-950/20", b: "bg-sky-100/70 dark:bg-sky-900/25" },
  { band: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200", a: "bg-violet-50 dark:bg-violet-950/20", b: "bg-violet-100/70 dark:bg-violet-900/25" },
  { band: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200", a: "bg-amber-50 dark:bg-amber-950/20", b: "bg-amber-100/70 dark:bg-amber-900/25" },
  { band: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200", a: "bg-rose-50 dark:bg-rose-950/20", b: "bg-rose-100/70 dark:bg-rose-900/25" },
  { band: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200", a: "bg-cyan-50 dark:bg-cyan-950/20", b: "bg-cyan-100/70 dark:bg-cyan-900/25" },
  { band: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200", a: "bg-indigo-50 dark:bg-indigo-950/20", b: "bg-indigo-100/70 dark:bg-indigo-900/25" },
  { band: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200", a: "bg-teal-50 dark:bg-teal-950/20", b: "bg-teal-100/70 dark:bg-teal-900/25" },
  { band: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200", a: "bg-fuchsia-50 dark:bg-fuchsia-950/20", b: "bg-fuchsia-100/70 dark:bg-fuchsia-900/25" },
];

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
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  // "Conferido": marca os itens que você já revisou / vai pedir.
  // Fica guardado no próprio navegador (não perde ao recarregar).
  const confKey = `cmp_conf_${cotacaoId}`;
  const [conf, setConf] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(confKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  function toggleConf(id: string) {
    setConf((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(confKey, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  }
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
          {itensEscolhidos} de {produtos.length} itens escolhidos ·{" "}
          <b className="text-green-600">{conf.size} conferidos</b> · total{" "}
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

      <div className="max-h-[75vh] overflow-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-zinc-100 px-3 py-3 text-left dark:bg-zinc-800">
                Produto
              </th>
              <th className="sticky top-0 z-20 bg-zinc-100 px-3 py-3 text-right dark:bg-zinc-800">
                Qtd
              </th>
              {fornecedores.map((f, i) => {
                const respondeu = !!f.respondido_em;
                const hora = f.respondido_em
                  ? new Date(f.respondido_em).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;
                return (
                  <th
                    key={f.id}
                    className={`sticky top-0 z-20 bg-zinc-100 px-3 py-3 text-right dark:bg-zinc-800 ${respondeu ? "" : "opacity-60"}`}
                  >
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {respondeu && (
                        <span className="mr-1 rounded bg-green-100 px-1 text-[10px] font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
                          {i + 1}º
                        </span>
                      )}
                      {f.nome}
                    </div>
                    <div className="text-[10px] font-normal text-zinc-400">
                      {respondeu ? `respondeu ${hora}` : "não respondeu"}
                      {f.pedido_minimo ? ` · mín ${moeda(f.pedido_minimo)}` : ""}
                      {f.condicao_pagamento ? ` · ${f.condicao_pagamento}` : ""}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...porCategoria.entries()].map(([cat, itensCat], ci) => (
              <Fragment key={cat}>
                <tr>
                  <td
                    colSpan={2 + fornecedores.length}
                    className={`sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${CAT_CORES[ci % CAT_CORES.length].band}`}
                  >
                    {cat}
                  </td>
                </tr>
                {itensCat.map((p, idx) => {
                  const cor = CAT_CORES[ci % CAT_CORES.length];
                  const conferido = conf.has(p.produto_id);
                  const rowBg = conferido
                    ? "bg-green-100 dark:bg-green-900/40"
                    : idx % 2
                      ? cor.b
                      : cor.a;
                  return (
                  <tr
                    key={p.produto_id}
                    className={`group transition-colors ${rowBg} hover:bg-orange-100 dark:hover:bg-orange-950/40`}
                  >
                    <td
                      className={`sticky left-0 z-10 px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100 ${rowBg} group-hover:bg-orange-100 dark:group-hover:bg-orange-950/40`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleConf(p.produto_id)}
                        title={conferido ? "Conferido — clique para desmarcar" : "Marcar como conferido"}
                        className={`mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs align-middle ${
                          conferido
                            ? "border-green-600 bg-green-600 text-white"
                            : "border-zinc-400 text-transparent hover:border-green-500 dark:border-zinc-500"
                        }`}
                      >
                        ✓
                      </button>
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
                        <td key={f.id} className="px-2 py-1 text-right align-top">
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
                            title={cel.obs ?? ""}
                          >
                            {moeda(cel.preco)}
                          </button>
                          {(cel.emb || cel.obs) && (
                            <div className="mt-0.5 text-right text-[10px] leading-tight text-zinc-400">
                              {cel.emb}
                              {cel.emb && cel.obs ? " · " : ""}
                              {cel.obs}
                            </div>
                          )}
                          {cel.foto && (
                            <button
                              type="button"
                              onClick={() => setFotoAberta(cel.foto)}
                              className="mt-0.5 text-[10px] font-medium text-orange-600 hover:underline"
                            >
                              📷 ver foto
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 font-semibold dark:border-zinc-700">
              <td
                className="sticky bottom-0 left-0 z-30 bg-zinc-100 px-3 py-3 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                colSpan={2}
              >
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
                    className={`sticky bottom-0 z-20 bg-zinc-100 px-3 py-3 text-right dark:bg-zinc-800 ${
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
        barato). Clique no <b>✓</b> ao lado do nome para marcar o que já{" "}
        <b>conferiu / vai pedir</b> (fica verde e é lembrado neste navegador). ⚠ =
        abaixo do pedido mínimo. 📷 = ver a foto do fornecedor.
      </p>

      {fotoAberta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFotoAberta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoAberta}
            alt="Foto do produto"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 text-4xl leading-none text-white/90 hover:text-white"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
