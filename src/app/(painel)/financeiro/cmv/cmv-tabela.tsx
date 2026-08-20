"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  salvarContagemItem,
  salvarFaturamentoDia,
  definirEntraCmvProduto,
  definirEntraCmvCategoria,
} from "./actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
const inp =
  "w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export type CmvRow = {
  produtoId: string;
  nome: string;
  unidade: string;
  grupo: string;
  categoriaId: string | null;
  entra: boolean;
  custo: number;
  nivel: number;
  eiQtd: number;
  efQtd: number;
  compras: number;
  precoCompra: number;
  precoAnterior: number;
  variacao: number | null;
};

const DIAS_SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CmvTabela({
  rows,
  eiId,
  efId,
  faturamentoCaixa,
  fatManual,
  dias,
  meta,
}: {
  rows: CmvRow[];
  eiId: string;
  efId: string;
  faturamentoCaixa: number;
  fatManual: Record<string, number>;
  dias: { data: string; dow: number }[];
  meta: number;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [fatM, setFatM] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const d of dias)
      for (const t of ["dia", "noite"]) {
        const v = fatManual[`${d.data}|${t}`];
        o[`${d.data}|${t}`] = v ? String(v) : "";
      }
    return o;
  });
  const [ei, setEi] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.produtoId, r.eiQtd ? String(r.eiQtd) : ""])),
  );
  const [ef, setEf] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.produtoId, r.efQtd ? String(r.efQtd) : ""])),
  );
  const [entra, setEntra] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.produtoId, r.entra])),
  );
  const [busca, setBusca] = useState("");
  const [inativosAberto, setInativosAberto] = useState(false);

  const custo = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.produtoId, r.custo])),
    [rows],
  );
  const compras = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.produtoId, r.compras])),
    [rows],
  );

  const cmvDe = (id: string) =>
    num(ei[id] ?? "") * custo[id] + (compras[id] ?? 0) - num(ef[id] ?? "") * custo[id];

  // Totais (só do que entra no CMV).
  let totalCmv = 0;
  for (const r of rows) if (entra[r.produtoId]) totalCmv += cmvDe(r.produtoId);
  const manualTotal = Object.values(fatM).reduce((s, v) => s + num(v), 0);
  const faturamento = faturamentoCaixa + manualTotal;
  const cmvPct = faturamento > 0 ? totalCmv / faturamento : 0;
  const lacuna = cmvPct - meta;

  // Maiores aumentos de preço de compra vs semana anterior.
  const aumentos = rows
    .filter((r) => r.variacao != null && r.variacao > 0.005)
    .sort((a, b) => (b.variacao ?? 0) - (a.variacao ?? 0))
    .slice(0, 6);

  const q = busca.trim().toLowerCase();
  const match = (r: CmvRow) => !q || r.nome.toLowerCase().includes(q);

  // Todos os produtos de cada categoria (ativos + inativos) — usado no checkbox do cabeçalho.
  const allIdsByCat = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      const k = r.categoriaId ?? "__none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r.produtoId);
    }
    return m;
  }, [rows]);

  // Só os ATIVOS entram na tabela; os desmarcados vão para o painel de inativos.
  const grupos = (() => {
    const m = new Map<string, { nome: string; categoriaId: string | null; rows: CmvRow[] }>();
    for (const r of rows) {
      if (!entra[r.produtoId] || !match(r)) continue;
      const k = r.categoriaId ?? "__none";
      if (!m.has(k)) m.set(k, { nome: r.grupo, categoriaId: r.categoriaId, rows: [] });
      m.get(k)!.rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  const inativos = rows
    .filter((r) => !entra[r.produtoId] && match(r))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome));

  function persistQtd(qual: "ei" | "ef", produtoId: string, valor: string) {
    const contagemId = qual === "ei" ? eiId : efId;
    start(async () => {
      await salvarContagemItem(contagemId, produtoId, num(valor));
    });
  }
  function persistFat(data: string, turno: string, valor: string) {
    start(async () => {
      await salvarFaturamentoDia(data, turno, num(valor));
    });
  }
  function toggleProduto(produtoId: string, v: boolean) {
    setEntra((s) => ({ ...s, [produtoId]: v }));
    start(async () => {
      await definirEntraCmvProduto(produtoId, v);
    });
  }
  function toggleCategoria(categoriaId: string | null, produtoIds: string[], v: boolean) {
    setEntra((s) => {
      const n = { ...s };
      produtoIds.forEach((id) => (n[id] = v));
      return n;
    });
    start(async () => {
      await definirEntraCmvCategoria(categoriaId, v);
    });
  }

  const card = (titulo: string, valor: string, cor?: string, sub?: string) => (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-xl font-bold ${cor || "text-zinc-900 dark:text-zinc-50"}`}>{valor}</p>
      {sub ? <p className="text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {card("CMV Real", moeda(totalCmv))}
        {card("Faturamento", faturamento > 0 ? moeda(faturamento) : "—", "", faturamento > 0 ? "" : "sem caixa no período")}
        {card("CMV %", faturamento > 0 ? pct(cmvPct) : "—", faturamento <= 0 ? "" : cmvPct <= meta ? "text-green-600" : "text-red-600")}
        {card(
          "Meta / Lacuna",
          pct(meta),
          faturamento > 0 ? (lacuna <= 0 ? "text-green-600" : "text-red-600") : "",
          faturamento > 0 ? `${lacuna <= 0 ? "▼ dentro" : "▲ acima"} ${pct(Math.abs(lacuna))}` : "",
        )}
      </div>

      {/* Faturamento diário livre (por turno) */}
      <div className="mb-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Faturamento da semana
            {faturamentoCaixa > 0 && (
              <span className="ml-1 text-xs font-normal text-zinc-400">
                (+ caixa {moeda(faturamentoCaixa)})
              </span>
            )}
          </h2>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
            {moeda(faturamento)}
          </span>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Lance à mão por dia enquanto não usa o caixa. Almoço (seg–sáb) e noite (sex e sáb).
        </p>
        <div className="flex flex-wrap gap-2">
          {dias.map((d) => {
            const temDia = d.dow >= 1 && d.dow <= 6;
            const temNoite = d.dow === 5 || d.dow === 6;
            if (!temDia && !temNoite) return null;
            const [, m, dd] = d.data.split("-");
            const campoFat =
              "mt-0.5 block w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
            return (
              <div key={d.data} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                <p className="mb-1 text-[11px] font-semibold text-zinc-500">
                  {DIAS_SEM[d.dow]} {dd}/{m}
                </p>
                <div className="flex gap-2">
                  {temDia && (
                    <label className="text-[10px] text-zinc-400">
                      almoço
                      <input
                        inputMode="decimal"
                        value={fatM[`${d.data}|dia`] ?? ""}
                        placeholder="0,00"
                        onChange={(e) => setFatM((s) => ({ ...s, [`${d.data}|dia`]: e.target.value }))}
                        onBlur={(e) => persistFat(d.data, "dia", e.target.value)}
                        className={campoFat}
                      />
                    </label>
                  )}
                  {temNoite && (
                    <label className="text-[10px] text-zinc-400">
                      noite
                      <input
                        inputMode="decimal"
                        value={fatM[`${d.data}|noite`] ?? ""}
                        placeholder="0,00"
                        onChange={(e) => setFatM((s) => ({ ...s, [`${d.data}|noite`]: e.target.value }))}
                        onBlur={(e) => persistFat(d.data, "noite", e.target.value)}
                        className={campoFat}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {aumentos.length > 0 && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/20">
          <h2 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">
            📈 Maiores aumentos de preço na semana
          </h2>
          <div className="flex flex-wrap gap-2">
            {aumentos.map((r) => (
              <div
                key={r.produtoId}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs dark:border-red-900/60 dark:bg-zinc-900"
              >
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">{r.nome}</span>{" "}
                <span className="font-bold text-red-600">
                  ▲ {((r.variacao ?? 0) * 100).toFixed(0)}% (+{moeda(r.precoCompra - r.precoAnterior)})
                </span>
                <span className="ml-1 text-zinc-400">
                  {moeda(r.precoAnterior)} → {moeda(r.precoCompra)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-xs text-zinc-500">
        Dá pra <b>editar as contagens</b> (estoque inicial e final) direto aqui —
        útil pra corrigir ou lançar uma contagem feita por fora. Ao{" "}
        <b>desmarcar</b> um produto ele sai da tela e vai para{" "}
        <b>Inativos</b> (dá pra trazer de volta quando quiser).
      </p>

      <div className="mb-3 flex items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar produto..."
          className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="text-xs text-zinc-400 hover:text-orange-600"
          >
            limpar
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-3">CMV?</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-3 py-3 text-right">Est. inicial (qtd)</th>
              <th className="px-4 py-3 text-right">Compras</th>
              <th className="px-3 py-3 text-right">Est. final (qtd)</th>
              <th className="px-4 py-3 text-right">CMV (R$)</th>
              <th className="px-3 py-3 text-right">Nível mín.</th>
              <th className="px-3 py-3 text-right">Necessid.</th>
              <th className="px-3 py-3">Decisão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {grupos.map((g) => {
              const ids = allIdsByCat.get(g.categoriaId ?? "__none") ?? g.rows.map((r) => r.produtoId);
              const todosEntra = ids.every((id) => entra[id]);
              const subCmv = g.rows
                .filter((r) => entra[r.produtoId])
                .reduce((s, r) => s + cmvDe(r.produtoId), 0);
              return (
                <Fragment key={g.categoriaId ?? "__none"}>
                  <tr className="bg-zinc-50/70 dark:bg-zinc-900/60">
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={todosEntra}
                        onChange={(e) => toggleCategoria(g.categoriaId, ids, e.target.checked)}
                        title="Categoria inteira entra no CMV"
                      />
                    </td>
                    <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500" colSpan={4}>
                      {g.nome}
                    </td>
                    <td className="px-4 py-1.5 text-right text-xs font-bold text-zinc-500">
                      {moeda(subCmv)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                  {g.rows.map((r) => {
                    const id = r.produtoId;
                    const dentro = entra[id];
                    const estAtual = num(ef[id] ?? "");
                    const necessidade = r.nivel - estAtual;
                    const comprar = r.nivel > 0 && necessidade > 0;
                    return (
                      <tr
                        key={id}
                        className={dentro ? "bg-white dark:bg-zinc-950" : "bg-zinc-50/40 dark:bg-zinc-900/30"}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={dentro}
                            onChange={(e) => toggleProduto(id, e.target.checked)}
                          />
                        </td>
                        <td className={`px-4 py-1.5 ${dentro ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"}`}>
                          {r.nome} <span className="text-xs text-zinc-400">{r.unidade}</span>
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            inputMode="decimal"
                            value={ei[id] ?? ""}
                            placeholder="0"
                            onChange={(e) => setEi((s) => ({ ...s, [id]: e.target.value }))}
                            onBlur={(e) => persistQtd("ei", id, e.target.value)}
                            className={inp}
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right text-zinc-500">
                          {r.compras ? (
                            <>
                              <div>{moeda(r.compras)}</div>
                              {r.precoCompra > 0 && (
                                <div className="text-[10px] text-zinc-400">
                                  un {moeda(r.precoCompra)}
                                  {r.variacao != null && (
                                    <span
                                      className={`ml-1 font-semibold ${
                                        r.variacao > 0.001
                                          ? "text-red-500"
                                          : r.variacao < -0.001
                                            ? "text-green-600"
                                            : "text-zinc-400"
                                      }`}
                                      title="variação de preço vs semana anterior"
                                    >
                                      {r.variacao > 0.001 ? "▲" : r.variacao < -0.001 ? "▼" : ""}
                                      {Math.abs(r.variacao * 100).toFixed(0)}%{" "}
                                      {r.precoCompra - r.precoAnterior >= 0 ? "+" : "−"}
                                      {moeda(Math.abs(r.precoCompra - r.precoAnterior))}
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            inputMode="decimal"
                            value={ef[id] ?? ""}
                            placeholder="0"
                            onChange={(e) => setEf((s) => ({ ...s, [id]: e.target.value }))}
                            onBlur={(e) => persistQtd("ef", id, e.target.value)}
                            className={inp}
                          />
                        </td>
                        <td className={`px-4 py-1.5 text-right font-medium ${dentro ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"}`}>
                          {moeda(cmvDe(id))}
                        </td>
                        <td className="px-3 py-1.5 text-right text-zinc-400">
                          {r.nivel > 0 ? r.nivel : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${comprar ? "font-medium text-orange-600" : "text-zinc-400"}`}>
                          {r.nivel > 0 ? necessidade : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.nivel <= 0 ? (
                            <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                          ) : comprar ? (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                              COMPRAR
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                              ok
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr className="bg-zinc-100 font-bold dark:bg-zinc-800">
              <td className="px-3 py-2" />
              <td className="px-4 py-2" colSpan={4}>TOTAL CMV</td>
              <td className="px-4 py-2 text-right text-orange-600">{moeda(totalCmv)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      {inativos.length > 0 && (
        <div className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setInativosAberto((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Produtos fora do CMV (inativos) · {inativos.length}
            </span>
            <span className="text-xs text-zinc-400">
              {inativosAberto ? "ocultar ▲" : "mostrar ▼"}
            </span>
          </button>
          {inativosAberto && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 p-4 dark:border-zinc-800">
              {inativos.map((r) => (
                <button
                  key={r.produtoId}
                  onClick={() => toggleProduto(r.produtoId, true)}
                  title="Trazer de volta para o CMV"
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:border-orange-500 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <span className="font-medium">{r.nome}</span>
                  <span className="text-zinc-400 group-hover:text-orange-500">+ voltar</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => router.refresh()}
        className="mt-4 text-xs text-zinc-400 hover:text-orange-600"
      >
        recarregar
      </button>
    </div>
  );
}
