"use client";

import { useState } from "react";
import Link from "next/link";
import { dataBR } from "@/lib/format";
import { tipoInfo } from "@/lib/etiqueta-tipos";

export type EtImp = {
  id: string;
  numero: number;
  produto_nome: string;
  categoria_nome: string | null;
  colaborador_nome: string | null;
  criado_em: string;
  validade: string | null;
  status: string;
  tipo: string | null;
  quantidade: number | null;
  unidade: string | null;
};

const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const horaSP = (iso: string) => Number(new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2));
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ImpressasClient({ rows, periodo, ini, fim }: { rows: EtImp[]; periodo: string; ini: string; fim: string }) {
  const [visao, setVisao] = useState<"lista" | "agrupado">("lista");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [usuario, setUsuario] = useState("");

  const cats = [...new Set(rows.map((r) => r.categoria_nome).filter((c): c is string => !!c))].sort();
  const usuarios = [...new Set(rows.map((r) => r.colaborador_nome).filter((c): c is string => !!c))].sort();
  const q = busca.trim().toLowerCase();
  const lista = rows.filter(
    (r) =>
      (!cat || r.categoria_nome === cat) &&
      (!status || r.status === status) &&
      (!usuario || r.colaborador_nome === usuario) &&
      (!q || String(r.numero).includes(q) || r.produto_nome.toLowerCase().includes(q)),
  );

  // Gráfico por hora (0–23)
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const r of lista) porHora[horaSP(r.criado_em)]++;
  const max = Math.max(1, ...porHora);

  // Por pessoa
  const porUsuario = new Map<string, number>();
  for (const r of lista) porUsuario.set(r.colaborador_nome ?? "—", (porUsuario.get(r.colaborador_nome ?? "—") ?? 0) + 1);
  const ranking = [...porUsuario.entries()].sort((a, b) => b[1] - a[1]);

  // Agrupado por produto
  const porProduto = new Map<string, { n: number; cat: string | null; ultimo: string }>();
  for (const r of lista) {
    const g = porProduto.get(r.produto_nome) ?? { n: 0, cat: r.categoria_nome, ultimo: r.criado_em };
    g.n++;
    if (r.criado_em > g.ultimo) g.ultimo = r.criado_em;
    porProduto.set(r.produto_nome, g);
  }
  const grupos = [...porProduto.entries()].sort((a, b) => b[1].n - a[1].n);

  const tab = (v: string, lab: string, ativo: boolean) => (
    <Link key={v} href={`/etiquetas/impressas?p=${v}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${ativo ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
      {lab}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {tab("ontem", "Ontem", periodo === "ontem")}
          {tab("hoje", "Hoje", periodo === "hoje")}
          {tab("7d", "7 dias", periodo === "7d")}
          {tab("30d", "30 dias", periodo === "30d")}
          <span className="text-xs text-zinc-400">{ini === fim ? dataBR(ini) : `${dataBR(ini)} a ${dataBR(fim)}`}</span>
          <span className="ml-auto text-lg font-bold text-orange-600">{lista.length} etiquetas</span>
        </div>
        {/* Gráfico por hora */}
        <div className="flex h-36 items-end gap-1">
          {porHora.map((n, h) => (
            <div key={h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${h}h: ${n}`}>
              {n > 0 && <span className="text-[10px] text-zinc-500">{n}</span>}
              <div className="w-full rounded-t bg-orange-400" style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? 3 : 0 }} />
              <span className="text-[9px] text-zinc-400">{h}</span>
            </div>
          ))}
        </div>
        {ranking.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ranking.map(([nome, n]) => (
              <button
                key={nome}
                onClick={() => setUsuario(usuario === nome ? "" : nome)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${usuario === nome ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"}`}
              >
                {nome} · {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {(["lista", "agrupado"] as const).map((v) => (
            <button key={v} onClick={() => setVisao(v)} className={`px-3 py-1.5 text-sm font-medium ${visao === v ? "bg-orange-500 text-white" : "text-zinc-600 dark:text-zinc-300"}`}>
              {v === "lista" ? "☰ Lista" : "▤ Agrupado por produto"}
            </button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Produto ou nº" className={`${input} w-56`} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
          <option value="">Todos os status</option>
          <option value="ativa">Em estoque (ativa)</option>
          <option value="usada">Usada</option>
          <option value="descartada">Descartada</option>
        </select>
        <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={input}>
          <option value="">Todas as pessoas</option>
          {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">Nenhuma etiqueta no período.</div>
      ) : visao === "agrupado" ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr><th className="px-3 py-3">Produto</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3 text-right">Etiquetas</th><th className="px-3 py-3">Última</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.map(([nome, g]) => (
                <tr key={nome} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{nome}</td>
                  <td className="px-3 py-2 text-zinc-500">{g.cat ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-zinc-800 dark:text-zinc-200">{g.n}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{fmt(g.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-3">Nº</th><th className="px-3 py-3">Produto</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Pessoa</th>
                <th className="px-3 py-3">Impressão</th><th className="px-3 py-3">Validade</th><th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-mono text-zinc-500">#{r.numero}</td>
                  <td className="px-3 py-2">
                    <Link href={`/etiquetas/${r.id}`} className="font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100">{r.produto_nome}</Link>
                    {r.tipo && r.tipo !== "manipulacao" && <span className="ml-2 text-[10px] uppercase text-zinc-400">{tipoInfo(r.tipo).titulo}</span>}
                    {r.quantidade != null && <span className="ml-2 text-xs text-zinc-400">{r.quantidade} {r.unidade ?? ""}</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{r.categoria_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.colaborador_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{fmt(r.criado_em)}</td>
                  <td className="px-3 py-2">{r.validade ? dataBR(r.validade) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.status === "ativa" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      {r.status === "ativa" ? "em estoque" : r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
