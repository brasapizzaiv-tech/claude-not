import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { calcFechamento, type FechamentoDados } from "@/lib/caixa";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Contagem = { id: string; data: string; descricao: string | null };
type Prod = {
  id: string;
  nome: string;
  unidade: string;
  preco_referencia: number | null;
  entra_cmv: boolean;
  categorias: { nome?: string } | null;
};

export default async function CmvPage({
  searchParams,
}: {
  searchParams: Promise<{ ef?: string; meta?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: contData } = await supabase
    .from("contagens")
    .select("id, data, descricao")
    .eq("status", "finalizada")
    .order("data", { ascending: false })
    .limit(60);
  const contagens = (contData as Contagem[]) ?? [];

  const cabecalho = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          CMV Real / Consumo
        </h1>
        <p className="mt-1 text-zinc-500">
          Consumo da semana = Estoque inicial + Compras − Estoque final (pelas
          contagens).
        </p>
      </div>
      <Link
        href="/financeiro"
        className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
      >
        Financeiro
      </Link>
    </div>
  );

  if (contagens.length < 2) {
    return (
      <div className="mx-auto max-w-5xl p-6 sm:p-8">
        {cabecalho}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          É preciso ter pelo menos <b>duas contagens finalizadas</b> (uma vira o
          estoque inicial, a outra o final). Finalize as contagens em Compras →
          Contagem de estoque.
        </div>
      </div>
    );
  }

  const efId = sp.ef && contagens.some((c) => c.id === sp.ef) ? sp.ef : contagens[0].id;
  const efIdx = contagens.findIndex((c) => c.id === efId);
  const ef = contagens[efIdx];
  const ei = contagens[efIdx + 1];
  const meta = sp.meta ? Number(sp.meta) : 0.29;

  if (!ei) {
    return (
      <div className="mx-auto max-w-5xl p-6 sm:p-8">
        {cabecalho}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          A contagem de <b>{dataBR(ef.data)}</b> é a primeira — não há contagem
          anterior para servir de estoque inicial. Escolha uma contagem mais
          recente.
        </div>
      </div>
    );
  }

  const dEI = ei.data;
  const dEF = ef.data;

  const [{ data: ciData }, { data: prodData }, { data: notasP }, { data: caixas }] =
    await Promise.all([
      supabase
        .from("contagem_itens")
        .select("contagem_id, produto_id, qtd_estoque")
        .in("contagem_id", [ei.id, ef.id]),
      supabase
        .from("produtos")
        .select("id, nome, unidade, preco_referencia, entra_cmv, categorias(nome)"),
      supabase
        .from("notas_fiscais")
        .select("id, pedido_id, data_emissao")
        .gt("data_emissao", dEI)
        .lte("data_emissao", dEF),
      supabase
        .from("fechamentos_caixa")
        .select("*")
        .gt("data", dEI)
        .lte("data", dEF),
    ]);

  const qtdEI = new Map<string, number>();
  const qtdEF = new Map<string, number>();
  for (const r of (ciData as { contagem_id: string; produto_id: string; qtd_estoque: number }[]) ?? []) {
    (r.contagem_id === ei.id ? qtdEI : qtdEF).set(r.produto_id, Number(r.qtd_estoque));
  }

  // Compras do período: notas + pedidos conferidos sem nota.
  const notas = (notasP as { id: string; pedido_id: string | null }[]) ?? [];
  const pedidosComNota = new Set(notas.map((n) => n.pedido_id).filter(Boolean) as string[]);
  const comprasValor = new Map<string, number>();
  const comprasQtd = new Map<string, number>();
  const soma = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  if (notas.length > 0) {
    const { data: ni } = await supabase
      .from("nota_itens")
      .select("produto_id, qtd, valor_total")
      .in("nota_id", notas.map((n) => n.id));
    for (const i of (ni as { produto_id: string | null; qtd: number; valor_total: number | null }[]) ?? []) {
      if (!i.produto_id) continue;
      soma(comprasValor, i.produto_id, Number(i.valor_total ?? 0));
      soma(comprasQtd, i.produto_id, Number(i.qtd ?? 0));
    }
  }

  const { data: pedsP } = await supabase
    .from("pedidos")
    .select("id")
    .eq("status", "conferido")
    .gt("data", dEI)
    .lte("data", dEF);
  const pedIds = ((pedsP as { id: string }[]) ?? [])
    .map((p) => p.id)
    .filter((id) => !pedidosComNota.has(id));
  if (pedIds.length > 0) {
    const { data: pi } = await supabase
      .from("pedido_itens")
      .select("produto_id, qtd, preco_unit")
      .in("pedido_id", pedIds);
    for (const i of (pi as { produto_id: string; qtd: number; preco_unit: number | null }[]) ?? []) {
      soma(comprasValor, i.produto_id, Number(i.qtd ?? 0) * Number(i.preco_unit ?? 0));
      soma(comprasQtd, i.produto_id, Number(i.qtd ?? 0));
    }
  }

  let faturamento = 0;
  for (const f of (caixas as unknown as FechamentoDados[]) ?? []) {
    faturamento += calcFechamento(f).total_pedidos;
  }

  // Monta linhas por produto (só as que tiveram movimento).
  const produtos = (prodData as unknown as Prod[]) ?? [];
  type Linha = {
    nome: string;
    unidade: string;
    grupo: string;
    entra: boolean;
    ei: number;
    compras: number;
    ef: number;
    cmv: number;
  };
  const linhas: Linha[] = [];
  for (const p of produtos) {
    const custo = Number(p.preco_referencia ?? 0);
    const eiV = (qtdEI.get(p.id) ?? 0) * custo;
    const efV = (qtdEF.get(p.id) ?? 0) * custo;
    const cV = comprasValor.get(p.id) ?? 0;
    const cQ = comprasQtd.get(p.id) ?? 0;
    if ((qtdEI.get(p.id) ?? 0) === 0 && (qtdEF.get(p.id) ?? 0) === 0 && cQ === 0) continue;
    linhas.push({
      nome: p.nome,
      unidade: p.unidade,
      grupo: p.categorias?.nome ?? "Sem categoria",
      entra: p.entra_cmv,
      ei: eiV,
      compras: cV,
      ef: efV,
      cmv: eiV + cV - efV,
    });
  }

  const cmvTotal = linhas.filter((l) => l.entra).reduce((s, l) => s + l.cmv, 0);
  const universalTotal = linhas.filter((l) => !l.entra).reduce((s, l) => s + l.cmv, 0);
  const cmvPct = faturamento > 0 ? cmvTotal / faturamento : 0;
  const lacuna = cmvPct - meta;

  // Agrupa por categoria (só do que entra no CMV, para a tabela principal).
  const porGrupo = new Map<string, Linha[]>();
  for (const l of linhas.filter((x) => x.entra)) {
    const a = porGrupo.get(l.grupo) ?? [];
    a.push(l);
    porGrupo.set(l.grupo, a);
  }
  const grupos = [...porGrupo.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      {cabecalho}

      {/* Seletor de contagem final */}
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Semana (contagem final)</label>
          <select
            name="ef"
            defaultValue={efId}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {contagens.slice(0, contagens.length - 1).map((c) => (
              <option key={c.id} value={c.id}>
                {dataBR(c.data)}
                {c.descricao ? ` — ${c.descricao}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Meta CMV (%)</label>
          <input
            name="meta"
            defaultValue={String(meta * 100)}
            inputMode="decimal"
            className="w-20 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Ver
        </button>
        <span className="pb-2 text-xs text-zinc-500">
          Período: {dataBR(dEI)} → {dataBR(dEF)}
        </span>
      </form>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card titulo="CMV Real" valor={moeda(cmvTotal)} />
        <Card titulo="Faturamento" valor={faturamento > 0 ? moeda(faturamento) : "—"} sub={faturamento > 0 ? "" : "sem caixa no período"} />
        <Card
          titulo="CMV %"
          valor={faturamento > 0 ? pct(cmvPct) : "—"}
          cor={faturamento <= 0 ? "" : cmvPct <= meta ? "text-green-600" : "text-red-600"}
        />
        <Card
          titulo="Meta / Lacuna"
          valor={pct(meta)}
          sub={faturamento > 0 ? `${lacuna <= 0 ? "▼ dentro" : "▲ acima"} ${pct(Math.abs(lacuna))}` : ""}
          cor={faturamento > 0 ? (lacuna <= 0 ? "text-green-600" : "text-red-600") : ""}
        />
      </div>

      {faturamento === 0 && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Sem <b>fechamento de caixa</b> no período — o CMV % não pôde ser
          calculado. Lance o caixa da semana para ver o percentual.
        </p>
      )}

      {/* Tabela por grupo */}
      {grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Sem movimento no período. Confira se as contagens têm itens e se há
          compras (notas/pedidos) entre as datas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Est. inicial</th>
                <th className="px-4 py-3 text-right">Compras</th>
                <th className="px-4 py-3 text-right">Est. final</th>
                <th className="px-4 py-3 text-right">CMV (consumo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.map(([grupo, itens]) => {
                const sg = itens.reduce(
                  (s, l) => ({ ei: s.ei + l.ei, c: s.c + l.compras, ef: s.ef + l.ef, cmv: s.cmv + l.cmv }),
                  { ei: 0, c: 0, ef: 0, cmv: 0 },
                );
                return (
                  <FragmentoGrupo key={grupo} grupo={grupo} itens={itens} sub={sg} />
                );
              })}
              <tr className="bg-zinc-100 font-bold dark:bg-zinc-800">
                <td className="px-4 py-2">TOTAL CMV</td>
                <td className="px-4 py-2 text-right">
                  {moeda(linhas.filter((l) => l.entra).reduce((s, l) => s + l.ei, 0))}
                </td>
                <td className="px-4 py-2 text-right">
                  {moeda(linhas.filter((l) => l.entra).reduce((s, l) => s + l.compras, 0))}
                </td>
                <td className="px-4 py-2 text-right">
                  {moeda(linhas.filter((l) => l.entra).reduce((s, l) => s + l.ef, 0))}
                </td>
                <td className="px-4 py-2 text-right text-orange-600">{moeda(cmvTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {universalTotal !== 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          Itens <b>universais</b> (fora do CMV) consumiram{" "}
          <b>{moeda(universalTotal)}</b> no período — vão para a DRE, não para o
          CMV.
        </p>
      )}
    </div>
  );
}

function Card({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-xl font-bold ${cor || "text-zinc-900 dark:text-zinc-50"}`}>{valor}</p>
      {sub ? <p className="text-xs text-zinc-400">{sub}</p> : null}
    </div>
  );
}

function FragmentoGrupo({
  grupo,
  itens,
  sub,
}: {
  grupo: string;
  itens: { nome: string; unidade: string; ei: number; compras: number; ef: number; cmv: number }[];
  sub: { ei: number; c: number; ef: number; cmv: number };
}) {
  const moedaL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <>
      <tr className="bg-zinc-50/70 dark:bg-zinc-900/60">
        <td className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500" colSpan={4}>
          {grupo}
        </td>
        <td className="px-4 py-1.5 text-right text-xs font-bold text-zinc-500">{moedaL(sub.cmv)}</td>
      </tr>
      {itens
        .sort((a, b) => b.cmv - a.cmv)
        .map((l) => (
          <tr key={l.nome} className="bg-white dark:bg-zinc-950">
            <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{l.nome}</td>
            <td className="px-4 py-2 text-right text-zinc-500">{moedaL(l.ei)}</td>
            <td className="px-4 py-2 text-right text-zinc-500">{moedaL(l.compras)}</td>
            <td className="px-4 py-2 text-right text-zinc-500">{moedaL(l.ef)}</td>
            <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">{moedaL(l.cmv)}</td>
          </tr>
        ))}
    </>
  );
}
