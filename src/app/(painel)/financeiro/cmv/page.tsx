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

  const efId = sp.ef && contagens.some((c) => c.id === sp.ef) ? sp.ef : contagens[0].id;
  const efIdx = contagens.findIndex((c) => c.id === efId);
  const ef = contagens[efIdx];
  const ei = contagens[efIdx + 1];
  const meta = sp.meta ? Number(sp.meta) / 100 : 0.29;

  if (!ei) {
    return (
      <div className="mx-auto max-w-7xl p-6 sm:p-8">
        {cabecalho}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          A contagem de <b>{dataBR(ef.data)}</b> é a primeira — não há contagem
          anterior para servir de estoque inicial.
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
        .select("id, nome, unidade, preco_referencia, entra_cmv, categoria_id, estoque_minimo, estoque_ideal, categorias(nome)")
        .eq("ativo", true)
        .order("nome"),
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

  const notas = (notasP as { id: string; pedido_id: string | null }[]) ?? [];
  const pedidosComNota = new Set(notas.map((n) => n.pedido_id).filter(Boolean) as string[]);
  const comprasValor = new Map<string, number>();
  const soma = (k: string, v: number) => comprasValor.set(k, (comprasValor.get(k) ?? 0) + v);

  if (notas.length > 0) {
    const { data: ni } = await supabase
      .from("nota_itens")
      .select("produto_id, valor_total")
      .in("nota_id", notas.map((n) => n.id));
    for (const i of (ni as { produto_id: string | null; valor_total: number | null }[]) ?? []) {
      if (i.produto_id) soma(i.produto_id, Number(i.valor_total ?? 0));
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
      soma(i.produto_id, Number(i.qtd ?? 0) * Number(i.preco_unit ?? 0));
    }
  }

  let faturamento = 0;
  for (const f of (caixas as unknown as FechamentoDados[]) ?? []) {
    faturamento += calcFechamento(f).total_pedidos;
  }

  const produtos = (prodData as unknown as Prod[]) ?? [];
  const rows: CmvRow[] = produtos.map((p) => ({
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
    compras: comprasValor.get(p.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8">
      {cabecalho}

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

      <CmvTabela rows={rows} eiId={ei.id} efId={ef.id} faturamento={faturamento} meta={meta} />
    </div>
  );
}
