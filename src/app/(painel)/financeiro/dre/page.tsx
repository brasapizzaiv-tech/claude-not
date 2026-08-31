import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DreTipo } from "@/lib/types";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function desloca(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function Linha({
  label, valor, neg, bold, ind, pct,
}: {
  label: string; valor: number; neg?: boolean; bold?: boolean; ind?: boolean; pct: (n: number) => string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-1.5 ${
        bold
          ? "border-y border-zinc-200 bg-zinc-50 font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          : ""
      } ${ind ? "pl-8 text-sm text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      <span>{label}</span>
      <span className="flex gap-4">
        <span className={neg ? "text-red-600" : ""}>
          {neg ? "- " : ""}
          {moeda(valor)}
        </span>
        <span className="w-14 text-right text-xs text-zinc-400">{pct(valor)}</span>
      </span>
    </div>
  );
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; todas?: string }>;
}) {
  const sp = await searchParams;
  const mostrarTodas = sp.todas === "1";
  const mes =
    sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)
      ? sp.mes
      : new Date().toISOString().slice(0, 7);
  const ini = `${mes}-01`;
  const fim = `${desloca(mes, 1)}-01`;

  const supabase = await createClient();
  const { data } = await supabase
    .from("lancamentos")
    .select("valor, dre_categorias(nome, tipo, grupo, ordem)")
    .gte("data", ini)
    .lt("data", fim);

  type L = {
    valor: number;
    dre_categorias: {
      nome?: string;
      tipo?: DreTipo;
      grupo?: string;
      ordem?: number;
    } | null;
  };
  const lancs = (data as unknown as L[]) ?? [];

  const porTipo: Record<string, number> = {};
  const porCategoria = new Map<string, { nome: string; tipo: string; grupo: string; ordem: number; total: number }>();
  const porGrupo = new Map<string, { tipo: string; total: number }>();
  for (const l of lancs) {
    const c = l.dre_categorias;
    if (!c?.tipo) continue;
    const v = Number(l.valor);
    porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + v;
    const key = `${c.tipo}|${c.nome}`;
    const ex = porCategoria.get(key);
    if (ex) ex.total += v;
    else
      porCategoria.set(key, {
        nome: c.nome ?? "—",
        tipo: c.tipo,
        grupo: c.grupo ?? "",
        ordem: c.ordem ?? 0,
        total: v,
      });
    const g = porGrupo.get(c.grupo ?? "");
    if (g) g.total += v;
    else porGrupo.set(c.grupo ?? "", { tipo: c.tipo, total: v });
  }

  // Receita REAL: faturamento importado da planilha (dia a dia, almoço+noite).
  // Entra como Receita Bruta no DRE; lançamentos de receita continuam somando
  // por cima (receitas extras). Cuidado para não lançar o mesmo faturamento
  // duas vezes (ex.: "lançar faturamento" do fechamento do caixa).
  const { data: fatData } = await supabase
    .from("faturamento_dias")
    .select("almoco, noite")
    .gte("data", ini)
    .lt("data", fim);
  let fatAlmoco = 0;
  let fatNoite = 0;
  for (const f of ((fatData as { almoco: number | null; noite: number | null }[]) ?? [])) {
    fatAlmoco += Number(f.almoco ?? 0);
    fatNoite += Number(f.noite ?? 0);
  }
  fatAlmoco = Math.round(fatAlmoco * 100) / 100;
  fatNoite = Math.round(fatNoite * 100) / 100;
  if (fatAlmoco > 0 || fatNoite > 0) {
    porTipo["receita"] = (porTipo["receita"] ?? 0) + fatAlmoco + fatNoite;
    if (fatAlmoco > 0)
      porCategoria.set("receita|Faturamento Almoço (real)", { nome: "Faturamento Almoço (real)", tipo: "receita", grupo: "Receita Bruta", ordem: -2, total: fatAlmoco });
    if (fatNoite > 0)
      porCategoria.set("receita|Faturamento Noite (real)", { nome: "Faturamento Noite (real)", tipo: "receita", grupo: "Receita Bruta", ordem: -1, total: fatNoite });
    const g = porGrupo.get("Receita Bruta");
    if (g) g.total += fatAlmoco + fatNoite;
    else porGrupo.set("Receita Bruta", { tipo: "receita", total: fatAlmoco + fatNoite });
  }

  // "Mostrar todas": semeia as categorias/grupos zerados para o DRE completo.
  if (mostrarTodas) {
    const { data: allCats } = await supabase
      .from("dre_categorias")
      .select("nome, tipo, grupo, ordem")
      .eq("ativo", true);
    for (const c of (allCats as { nome: string; tipo: string; grupo: string; ordem: number }[]) ?? []) {
      const key = `${c.tipo}|${c.nome}`;
      if (!porCategoria.has(key))
        porCategoria.set(key, {
          nome: c.nome,
          tipo: c.tipo,
          grupo: c.grupo ?? "",
          ordem: c.ordem ?? 0,
          total: 0,
        });
      if (!porGrupo.has(c.grupo ?? ""))
        porGrupo.set(c.grupo ?? "", { tipo: c.tipo, total: 0 });
    }
  }

  const t = (tipo: string) => porTipo[tipo] ?? 0;
  const receitaBruta = t("receita");
  const deducoes = t("deducao");
  const receitaLiquida = receitaBruta - deducoes;
  const cmv = t("cmv");
  const cmo = t("cmo");
  const tarifa = t("tarifa");
  const imposto = t("imposto");
  const custosVar = cmv + cmo + tarifa + imposto;
  const margem = receitaLiquida - custosVar;
  const despFixas = t("despesa_fixa");
  const financeira = t("financeira");
  const resultado = margem - despFixas - financeira;
  const naoOper = t("nao_operacional");

  const base = receitaBruta || 1;
  const pct = (n: number) => `${((n / base) * 100).toFixed(1)}%`;

  const cats = (tipo: string) =>
    [...porCategoria.values()]
      .filter((c) => c.tipo === tipo && (mostrarTodas || c.total !== 0))
      .sort((a, b) => a.ordem - b.ordem);
  const grupos = (tipo: string) =>
    [...porGrupo.entries()]
      .filter(([, g]) => g.tipo === tipo && (mostrarTodas || g.total !== 0))
      .map(([nome, g]) => ({ nome, total: g.total }));


  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            DRE — {rotuloMes(mes)}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            % sobre a receita bruta. Valores lançados no mês.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/financeiro/dre?mes=${desloca(mes, -1)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">‹</Link>
          <Link href={`/financeiro/dre?mes=${desloca(mes, 1)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">›</Link>
          <Link
            href={`/financeiro/dre?mes=${mes}${mostrarTodas ? "" : "&todas=1"}`}
            className={`ml-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              mostrarTodas
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
            title="Inclui as categorias sem valor no mês"
          >
            {mostrarTodas ? "✓ Todas as categorias" : "Mostrar todas"}
          </Link>
          <Link href={`/financeiro?mes=${mes}`} className="ml-1 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
            Lançamentos
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <Linha pct={pct} label="Receita Bruta de Vendas" valor={receitaBruta} bold />
        {cats("receita").map((c) => (
          <Linha pct={pct} key={c.nome} label={c.nome} valor={c.total} ind />
        ))}
        {cats("deducao").map((c) => (
          <Linha pct={pct} key={c.nome} label={`(-) ${c.nome}`} valor={c.total} ind neg />
        ))}
        <Linha pct={pct} label="(=) Receita Líquida" valor={receitaLiquida} bold />

        <Linha pct={pct} label="(-) CMV" valor={cmv} neg />
        {cats("cmv").map((c) => (
          <Linha pct={pct} key={c.nome} label={c.nome} valor={c.total} ind neg />
        ))}
        {cmo !== 0 && <Linha pct={pct} label="(-) CMO Variável" valor={cmo} neg />}
        {tarifa !== 0 && <Linha pct={pct} label="(-) Tarifas de cartão/marketplace" valor={tarifa} neg />}
        {imposto !== 0 && <Linha pct={pct} label="(-) Impostos (Simples)" valor={imposto} neg />}
        <Linha pct={pct} label="(=) Margem de Contribuição" valor={margem} bold />

        <Linha pct={pct} label="(-) Despesas Fixas" valor={despFixas} neg />
        {grupos("despesa_fixa").map((g) => (
          <Linha pct={pct} key={g.nome} label={g.nome} valor={g.total} ind neg />
        ))}
        {financeira !== 0 && <Linha pct={pct} label="(-) Despesas Financeiras" valor={financeira} neg />}
        <Linha pct={pct} label="(=) Resultado Operacional" valor={resultado} bold />
      </div>

      {/* Indicadores */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          { l: "CMV", v: pct(cmv) },
          { l: "CMO", v: pct(cmo) },
          { l: "Prime Cost (CMV+CMO)", v: pct(cmv + cmo) },
        ].map((i) => (
          <div key={i.l} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">{i.l}</p>
            <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{i.v}</p>
          </div>
        ))}
      </div>

      {naoOper !== 0 && (
        <div className="mt-6 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <div className="flex justify-between text-zinc-500">
            <span>Não operacional (investimentos, sócios, empréstimos)</span>
            <span>{moeda(naoOper)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
