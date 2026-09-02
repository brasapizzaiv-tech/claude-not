import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contarFaixas, ehData, faixaDe, faixaDias, faixaValida, hojeSP } from "@/lib/etiqueta-vencimentos";
import { PainelVencimentos, FaixaDias, type ItemEtq, type CatEtq } from "@/components/etiqueta-ui";
import { EtiquetaForm, type Imp } from "./etiqueta-form";
import { ListaEtiquetas, type EtLinha } from "./lista";

const COLS = "id, numero, produto_nome, categoria_nome, colaborador_nome, validade, conservacao, quantidade, unidade, status, baixa_em, tipo, lote, manipulado_em";

export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; f?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const historico = sp.ver === "historico";
  const faixa = historico ? null : faixaValida(sp.f);
  const soVencidas = !historico && sp.f === "vencidas";
  const dia = historico ? null : ehData(sp.d);

  const supabase = await createClient();
  const [{ data: its }, { data: cats }, { data: recs }, { data: colabs }, { data: imps }, { data: etiqs }, { data: ativas }, { count: baixadas }] =
    await Promise.all([
      supabase
        .from("etiqueta_itens")
        .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente, unidade")
        .eq("ativo", true)
        .order("nome"),
      supabase.from("etiqueta_categorias").select("id, nome").eq("ativo", true).order("ordem").order("nome"),
      supabase.from("etiquetas").select("item_id").not("item_id", "is", null).order("criado_em", { ascending: false }).limit(80),
      supabase.from("colaboradores").select("nome").eq("ativo", true).order("nome"),
      supabase.from("impressoras").select("id, nome, etiqueta_config").eq("ativo", true).order("criado_em"),
      historico
        ? supabase.from("etiquetas").select(COLS).in("status", ["usada", "descartada"]).order("baixa_em", { ascending: false }).limit(300)
        : supabase.from("etiquetas").select(COLS).eq("status", "ativa").order("validade", { ascending: true, nullsFirst: false }).limit(1000),
      supabase.from("etiquetas").select("validade").eq("status", "ativa").limit(5000),
      supabase.from("etiquetas").select("id", { count: "exact", head: true }).in("status", ["usada", "descartada"]),
    ]);

  const itens = (its as ItemEtq[]) ?? [];
  const categorias = (cats as CatEtq[]) ?? [];
  const recentes = [...new Set(((recs as { item_id: string }[]) ?? []).map((r) => r.item_id))];
  const colaboradores = (colabs as { nome: string }[]) ?? [];
  const impressoras = (imps as Imp[]) ?? [];

  const hoje = hojeSP();
  const todas = (etiqs as EtLinha[]) ?? [];
  const rows = soVencidas
    ? todas.filter((e) => !!e.validade && e.validade < hoje)
    : dia
      ? todas.filter((e) => e.validade === dia)
      : faixa
        ? todas.filter((e) => faixaDe(e.validade, hoje) === faixa)
        : todas;
  const validades = (ativas as { validade: string | null }[]) ?? [];
  const contagem = contarFaixas(validades, hoje);
  const dias = faixaDias(hoje);
  const porDia: Record<string, number> = {};
  for (const v of validades) if (v.validade) porDia[v.validade] = (porDia[v.validade] ?? 0) + 1;

  const filtroAtivo = soVencidas ? "vencidas (não baixadas)" : dia ? `dia ${dia.split("-").reverse().join("/")}` : faixa ? "faixa" : null;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Etiquetas</h1>
          <p className="mt-1 text-zinc-500">Gere etiquetas de manipulação e controle a validade dos insumos.</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Link href="/etiquetas/impressas" className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
            📈 Impressas
          </Link>
          <Link href="/etiquetas/itens" className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
            📋 Itens e categorias
          </Link>
          <Link href="/impressao" className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
            🖨️ Impressoras
          </Link>
          <Link href="/etiquetas/scanner" className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900">
            📷 Modo Leitor
          </Link>
        </div>
      </div>

      {/* Painel de vencimentos */}
      <div className="mb-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Painel de vencimentos</p>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
          <PainelVencimentos contagem={contagem} base="/etiquetas" ativo={faixa} />
          <div className="grid grid-cols-2 gap-2 lg:w-64">
            <Link href={soVencidas ? "/etiquetas" : "/etiquetas?f=vencidas"} className={`rounded-2xl border-2 p-3 ${soVencidas ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
              <div className="text-3xl font-black leading-none text-red-600">{contagem.vencidas}</div>
              <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Vencidas não baixadas</div>
            </Link>
            <Link href="/etiquetas?ver=historico" className="rounded-2xl border-2 border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-3xl font-black leading-none text-zinc-700 dark:text-zinc-200">{baixadas ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Baixadas</div>
            </Link>
          </div>
        </div>
        <FaixaDias dias={dias} contagens={porDia} base="/etiquetas" ativo={dia} />
      </div>

      {itens.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Ainda não há itens de etiqueta cadastrados. Abra uma categoria e use <b>＋ Novo item</b> (ou cadastre em <Link href="/etiquetas/itens" className="underline">Itens e categorias</Link>).
        </div>
      )}

      <EtiquetaForm itens={itens} categorias={categorias} recentes={recentes} colaboradores={colaboradores} impressoras={impressoras} />

      {/* Abas */}
      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/etiquetas" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!historico ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
            Ativas
          </Link>
          <Link href="/etiquetas?ver=historico" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${historico ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
            Histórico (baixadas)
          </Link>
          {filtroAtivo && (
            <span className="text-sm text-zinc-500">
              filtro: <b>{filtroAtivo}</b> · <Link href="/etiquetas" className="text-orange-600 hover:underline">limpar</Link>
            </span>
          )}
        </div>
      </div>

      <ListaEtiquetas rows={rows} hoje={hoje} historico={historico} />
    </div>
  );
}
