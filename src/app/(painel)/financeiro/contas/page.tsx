import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { BANCOS, TIPOS_PAGAMENTO } from "@/lib/financeiro";
import { alternarPago } from "../actions";
import { consultarContas, type LinhaConta, type FiltroContas } from "./consulta";

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
    status: sp.status || "aberto",
    comp: sp.comp,
    vde: sp.vde,
    vate: sp.vate,
    lde: sp.lde,
    late: sp.late,
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
  const categorias = (
    (catData as { id: string; nome: string; tipo: string }[]) ?? []
  ).filter((c) => c.tipo !== "receita");

  const total = linhas.reduce((s, l) => s + Number(l.valor), 0);
  const querystring = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();

  const aberto = f.status !== "pagas" && f.status !== "todas";
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(new Date().getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const baldes: { nome: string; cor: string; itens: LinhaConta[] }[] = [
    { nome: "Vencidas", cor: "text-red-600", itens: [] },
    { nome: "Próximos 7 dias", cor: "text-amber-600", itens: [] },
    { nome: "A vencer", cor: "text-zinc-500", itens: [] },
    { nome: "Sem vencimento", cor: "text-zinc-400", itens: [] },
  ];
  if (aberto)
    for (const l of linhas) {
      if (!l.vencimento) baldes[3].itens.push(l);
      else if (l.vencimento < hoje) baldes[0].itens.push(l);
      else if (l.vencimento <= em7) baldes[1].itens.push(l);
      else baldes[2].itens.push(l);
    }

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
          Total {aberto ? "em aberto" : "filtrado"} · {linhas.length} conta(s)
        </p>
        <p
          className={`mt-1 text-2xl font-bold ${aberto ? "text-red-600" : "text-zinc-900 dark:text-zinc-50"}`}
        >
          {moeda(total)}
        </p>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma conta com esses filtros.
        </div>
      ) : aberto ? (
        <div className="space-y-6">
          {baldes
            .filter((b) => b.itens.length > 0)
            .map((b) => {
              const soma = b.itens.reduce((s, l) => s + Number(l.valor), 0);
              return (
                <div key={b.nome}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className={`text-sm font-semibold ${b.cor}`}>{b.nome}</h2>
                    <span className="text-sm font-medium text-zinc-500">
                      {moeda(soma)}
                    </span>
                  </div>
                  <ListaContas itens={b.itens} />
                </div>
              );
            })}
        </div>
      ) : (
        <ListaContas itens={linhas} mostrarPago />
      )}
    </div>
  );
}

function ListaContas({
  itens,
  mostrarPago,
}: {
  itens: LinhaConta[];
  mostrarPago?: boolean;
}) {
  // Hoje no fuso de Brasília (UTC−3) — padrão do campo de data do pagamento.
  const hojeBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((l) => (
            <tr key={l.id} className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-2">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {l.descricao ?? l.fornecedores?.nome ?? "Despesa"}
                </div>
                <div className="text-xs text-zinc-400">
                  {l.dre_categorias?.nome ?? ""}
                  {l.vencimento ? ` · vence ${dataBR(l.vencimento)}` : ""}
                  {l.banco ? ` · ${l.banco}` : ""}
                  {l.forma_pagamento ? ` · ${l.forma_pagamento}` : ""}
                  {mostrarPago && l.pago_em ? ` · pago ${dataBR(l.pago_em)}` : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                {moeda(Number(l.valor))}
              </td>
              <td className="px-4 py-2 text-right">
                <form action={alternarPago} className="inline-flex items-center gap-1.5">
                  <input type="hidden" name="id" value={l.id} />
                  <input
                    type="hidden"
                    name="pago"
                    value={l.pago ? "false" : "true"}
                  />
                  {!l.pago && (
                    <input
                      type="date"
                      name="data_pago"
                      defaultValue={hojeBR}
                      title="Data do pagamento (padrão: hoje)"
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-green-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    />
                  )}
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      l.pago
                        ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {l.pago ? "Reabrir" : "Pagar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
