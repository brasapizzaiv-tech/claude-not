import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { calcFechamento, type FechamentoDados } from "@/lib/caixa";
import { CmvTabela, type CmvRow } from "./cmv-tabela";

type Contagem = { id: string; data: string; descricao: string | null };
type Prod = {
  id: string;
  nome: string;
  unidade: string;
  preco_referencia: number | null;
  entra_cmv: boolean;
  categoria_id: string | null;
  estoque_minimo: number | null;
  estoque_ideal: number | null;
  categorias: { nome?: string } | null;
};

export default async function CmvPage({
  searchParams,
}: {
  searchParams: Promise<{ di?: string; df?: string; meta?: string }>;
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
          Consumo da semana = Estoque inicial + Compras − Estoque final.
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
      <div className="mx-auto max-w-7xl p-6 sm:p-8">
        {cabecalho}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          É preciso ter pelo menos <b>duas contagens finalizadas</b> (uma vira o
          estoque inicial, a outra o final). Finalize as contagens em Compras →
          Contagem de estoque.
        </div>
      </div>
    );
  }

  // Agrupa as contagens em "viradas": as feitas em dias próximos (<=2 dias) —
  // Estoque, Bebidas, Limpeza da mesma semana — contam como uma só virada.
  const TOL = 2;
  const diffDias = (a: string, b: string) =>
    Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5);
  const datasDesc = [...new Set(contagens.map((c) => c.data))].sort().reverse();
  const clusters: string[][] = [];
  for (const d of datasDesc) {
    const ult = clusters[clusters.length - 1];
    if (ult && diffDias(ult[ult.length - 1], d) <= TOL) ult.push(d);
    else clusters.push([d]);
  }
  // Representante de cada virada = a MAIOR data do grupo (a lista está desc).
  const reps = clusters.map((cl) => cl[0]);

  // Semana = data de início e data de fim (default: as duas viradas mais recentes).
  const validaData = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
  const df = validaData(sp.df) || reps[0] || "";
  const di = validaData(sp.di) || reps[1] || "";
  const meta = sp.meta ? Number(sp.meta) / 100 : 0.29;

  if (!di || !df) {
    return (
      <div className="mx-auto max-w-7xl p-6 sm:p-8">
        {cabecalho}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          É preciso ter pelo menos <b>duas viradas de contagem</b> (uma vira o
          estoque inicial, a outra o final).
        </div>
      </div>
    );
  }

  const dEI = di;
  const dEF = df;
  // Todas as contagens de cada virada (janela ±TOL dias).
  const eiContagens = contagens.filter((c) => diffDias(c.data, di) <= TOL);
  const efContagens = contagens.filter((c) => diffDias(c.data, df) <= TOL);
  const eiRepId = eiContagens[0]?.id ?? ""; // p/ editar (contagens vêm desc)
  const efRepId = efContagens[0]?.id ?? "";
  const idsContagem = [
    ...new Set([...eiContagens, ...efContagens].map((c) => c.id)),
  ];

  const [{ data: ciData }, { data: prodData }, { data: caixas }] = await Promise.all([
    supabase
      .from("contagem_itens")
      .select("contagem_id, produto_id, qtd_estoque")
      .in("contagem_id", idsContagem.length ? idsContagem : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("produtos")
      .select("id, nome, unidade, preco_referencia, entra_cmv, categoria_id, estoque_minimo, estoque_ideal, categorias(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("fechamentos_caixa").select("*").gt("data", dEI).lte("data", dEF),
  ]);

  // Combina as contagens de cada virada por produto (a contagem mais recente
  // da virada vence — assim uma correção manual salva no representante ganha).
  const dataDe = new Map(contagens.map((c) => [c.id, c.data]));
  const eiIds = new Set(eiContagens.map((c) => c.id));
  const efIds = new Set(efContagens.map((c) => c.id));
  const qtdEI = new Map<string, number>();
  const qtdEF = new Map<string, number>();
  const qDataEI = new Map<string, string>();
  const qDataEF = new Map<string, string>();
  for (const r of (ciData as { contagem_id: string; produto_id: string; qtd_estoque: number }[]) ?? []) {
    const d = dataDe.get(r.contagem_id) ?? "";
    if (eiIds.has(r.contagem_id) && (!qDataEI.has(r.produto_id) || d >= qDataEI.get(r.produto_id)!)) {
      qtdEI.set(r.produto_id, Number(r.qtd_estoque));
      qDataEI.set(r.produto_id, d);
    }
    if (efIds.has(r.contagem_id) && (!qDataEF.has(r.produto_id) || d >= qDataEF.get(r.produto_id)!)) {
      qtdEF.set(r.produto_id, Number(r.qtd_estoque));
      qDataEF.set(r.produto_id, d);
    }
  }

  // Compras de um período: valor e quantidade por produto (nota quando existe;
  // senão, pedido conferido). Usado no CMV e na variação de preço.
  async function comprasNoPeriodo(dIni: string, dFim: string) {
    const map = new Map<string, { valor: number; qtd: number }>();
    const add = (id: string, v: number, q: number) => {
      const o = map.get(id) ?? { valor: 0, qtd: 0 };
      o.valor += v;
      o.qtd += q;
      map.set(id, o);
    };
    const { data: nn } = await supabase
      .from("notas_fiscais")
      .select("id, pedido_id")
      .gt("data_emissao", dIni)
      .lte("data_emissao", dFim);
    const ns = (nn as { id: string; pedido_id: string | null }[]) ?? [];
    const comNota = new Set(ns.map((n) => n.pedido_id).filter(Boolean) as string[]);
    if (ns.length > 0) {
      const { data: ni } = await supabase
        .from("nota_itens")
        .select("produto_id, qtd, valor_total")
        .in("nota_id", ns.map((n) => n.id));
      for (const i of (ni as { produto_id: string | null; qtd: number; valor_total: number | null }[]) ?? [])
        if (i.produto_id) add(i.produto_id, Number(i.valor_total ?? 0), Number(i.qtd ?? 0));
    }
    const { data: pp } = await supabase
      .from("pedidos")
      .select("id")
      .eq("status", "conferido")
      .gt("data", dIni)
      .lte("data", dFim);
    const pids = ((pp as { id: string }[]) ?? [])
      .map((p) => p.id)
      .filter((id) => !comNota.has(id));
    if (pids.length > 0) {
      const { data: pi } = await supabase
        .from("pedido_itens")
        .select("produto_id, qtd, preco_unit")
        .in("pedido_id", pids);
      for (const i of (pi as { produto_id: string; qtd: number; preco_unit: number | null }[]) ?? [])
        add(i.produto_id, Number(i.qtd ?? 0) * Number(i.preco_unit ?? 0), Number(i.qtd ?? 0));
    }
    return map;
  }

  const comprasAtual = await comprasNoPeriodo(dEI, dEF);

  // Correções manuais de Compras desta semana (chaveadas pela virada final).
  const { data: manData } = await supabase
    .from("cmv_compras_manual")
    .select("produto_id, valor")
    .eq("contagem_id", efRepId);
  const comprasManualMap = new Map<string, number>();
  for (const m of (manData as { produto_id: string; valor: number }[]) ?? [])
    comprasManualMap.set(m.produto_id, Number(m.valor));

  // Semana anterior (para a variação de preço) = da virada antes do início até o início.
  const diAnt = reps.find((r) => r < di);
  const comprasAnt = diAnt
    ? await comprasNoPeriodo(diAnt, dEI)
    : new Map<string, { valor: number; qtd: number }>();

  let faturamento = 0;
  for (const f of (caixas as unknown as FechamentoDados[]) ?? []) {
    faturamento += calcFechamento(f).total_pedidos;
  }

  const produtos = (prodData as unknown as Prod[]) ?? [];
  const rows: CmvRow[] = produtos.map((p) => {
    const ca = comprasAtual.get(p.id);
    const cp = comprasAnt.get(p.id);
    const precoAtual = ca && ca.qtd > 0 ? ca.valor / ca.qtd : 0;
    const precoAnt = cp && cp.qtd > 0 ? cp.valor / cp.qtd : 0;
    const variacao = precoAtual > 0 && precoAnt > 0 ? precoAtual / precoAnt - 1 : null;
    const auto = ca?.valor ?? 0;
    const man = comprasManualMap.get(p.id);
    return {
      produtoId: p.id,
      nome: p.nome,
      unidade: p.unidade,
      grupo: p.categorias?.nome ?? "Sem categoria",
      categoriaId: p.categoria_id,
      entra: p.entra_cmv,
      custo: Number(p.preco_referencia ?? 0),
      nivel: Number(p.estoque_ideal ?? 0) || Number(p.estoque_minimo ?? 0),
      eiQtd: qtdEI.get(p.id) ?? 0,
      efQtd: qtdEF.get(p.id) ?? 0,
      compras: man != null ? man : auto,
      comprasAuto: auto,
      comprasManual: man != null,
      precoCompra: precoAtual,
      precoAnterior: precoAnt,
      variacao,
    };
  });

  // Faturamento manual do período (por dia/turno) + dias do período.
  const { data: fatData } = await supabase
    .from("faturamento_dia")
    .select("data, turno, valor")
    .gt("data", dEI)
    .lte("data", dEF);
  const fatManual: Record<string, number> = {};
  for (const f of (fatData as { data: string; turno: string; valor: number }[]) ?? []) {
    fatManual[`${f.data}|${f.turno}`] = Number(f.valor);
  }
  const dias: { data: string; dow: number }[] = [];
  {
    const cur = new Date(dEI + "T00:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + 1);
    const fim = new Date(dEF + "T00:00:00Z");
    while (cur <= fim) {
      dias.push({ data: cur.toISOString().slice(0, 10), dow: cur.getUTCDay() });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8">
      {cabecalho}

      <form className="mb-2 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Início da semana</label>
          <input
            type="date"
            name="di"
            defaultValue={di}
            list="viradas"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Fim da semana</label>
          <input
            type="date"
            name="df"
            defaultValue={df}
            list="viradas"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <datalist id="viradas">
          {reps.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
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
      </form>
      <div className="mb-5 space-y-0.5 text-xs text-zinc-500">
        <p>
          Período: <b>{dataBR(dEI)} → {dataBR(dEF)}</b>
        </p>
        <p>
          Estoque inicial:{" "}
          {eiContagens.map((c) => c.descricao || dataBR(c.data)).join(" + ") || "—"}
        </p>
        <p>
          Estoque final:{" "}
          {efContagens.map((c) => c.descricao || dataBR(c.data)).join(" + ") || "—"}
        </p>
      </div>

      <CmvTabela
        rows={rows}
        eiId={eiRepId}
        efId={efRepId}
        faturamentoCaixa={faturamento}
        fatManual={fatManual}
        dias={dias}
        meta={meta}
      />
    </div>
  );
}
