import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BANCOS, TIPOS_PAGAMENTO } from "@/lib/financeiro";
import { consultarContas, agruparContas, type FiltroContas } from "./consulta";
import { ListaContasView } from "./lista-contas";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const f: FiltroContas = {
    // Filtrar por dia de pagamento só faz sentido em contas pagas.
    status: sp.status || (sp.pde || sp.pate ? "pagas" : "aberto"),
    comp: sp.comp,
    vde: sp.vde,
    vate: sp.vate,
    lde: sp.lde,
    late: sp.late,
    pde: sp.pde,
    pate: sp.pate,
    banco: sp.banco,
    forma: sp.forma,
    cat: sp.cat,
  };

  const supabase = await createClient();
  const [{ data: catData }, linhas] = await Promise.all([
    supabase
      .from("dre_categorias")
      .select("id, nome, tipo")
      .eq("ativo", true)
      .order("nome"),
    consultarContas(f),
  ]);
  // Agrupa lançamentos da mesma nota (por vencimento) numa conta só (o boleto).
  const linhasAgrupadas = agruparContas(linhas);
  const categorias = (
    (catData as { id: string; nome: string; tipo: string }[]) ?? []
  ).filter((c) => c.tipo !== "receita");

  const total = linhasAgrupadas.reduce((s, l) => s + Number(l.valor), 0);
  const querystring = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();

  const aberto = f.status !== "pagas" && f.status !== "todas";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Contas a pagar
          </h1>
          <p className="mt-1 text-zinc-500">
            Filtre por competência, vencimento, origem e mais. Baixe o relatório
            para a contabilidade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/financeiro/contas/export?${querystring}`}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            ⬇ Baixar relatório (Excel)
          </a>
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Lançamentos
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Situação</label>
          <select name="status" defaultValue={f.status} className={inputCls}>
            <option value="aberto">Em aberto</option>
            <option value="pagas">Pagas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Competência</label>
          <input type="month" name="comp" defaultValue={f.comp} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Vencimento de</label>
          <input type="date" name="vde" defaultValue={f.vde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">até</label>
          <input type="date" name="vate" defaultValue={f.vate} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Lançamento de</label>
          <input type="date" name="lde" defaultValue={f.lde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">até</label>
          <input type="date" name="late" defaultValue={f.late} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Pago de</label>
          <input type="date" name="pde" defaultValue={f.pde} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">até</label>
          <input type="date" name="pate" defaultValue={f.pate} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Origem (banco)</label>
          <select name="banco" defaultValue={f.banco} className={inputCls}>
            <option value="">Todas</option>
            {BANCOS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tipo pagto.</label>
          <select name="forma" defaultValue={f.forma} className={inputCls}>
            <option value="">Todos</option>
            {TIPOS_PAGAMENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-44">
          <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
          <select name="cat" defaultValue={f.cat} className={`${inputCls} w-full`}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Aplicar
        </button>
        <Link
          href="/financeiro/contas"
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Limpar
        </Link>
      </form>

      {/* Total */}
      <div className="mb-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          Total {aberto ? "em aberto" : "filtrado"} · {linhasAgrupadas.length} conta(s)
        </p>
        <p
          className={`mt-1 text-2xl font-bold ${aberto ? "text-red-600" : "text-zinc-900 dark:text-zinc-50"}`}
        >
          {moeda(total)}
        </p>
      </div>

      {linhasAgrupadas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma conta com esses filtros.
        </div>
      ) : (
        <ListaContasView linhas={linhasAgrupadas} aberto={aberto} />
      )}
    </div>
  );
}
