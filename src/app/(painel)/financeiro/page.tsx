import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DreCategoria } from "@/lib/types";
import { BANCOS, TIPOS_PAGAMENTO } from "@/lib/financeiro";
import { criarLancamento } from "./actions";
import { LancamentoLinha } from "./lancamento-linha";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}
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

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAtual();
  const ini = `${mes}-01`;
  const fim = `${desloca(mes, 1)}-01`;

  const supabase = await createClient();
  const [{ data: catData }, { data: lancData }] = await Promise.all([
    supabase.from("dre_categorias").select("*").eq("ativo", true).order("ordem"),
    supabase
      .from("lancamentos")
      .select("id, data, descricao, valor, forma_pagamento, origem, categoria_id, vencimento, pago, dre_categorias(nome, tipo, grupo), fornecedores(nome)")
      .gte("data", ini)
      .lt("data", fim)
      .order("data", { ascending: false }),
  ]);

  const categorias = (catData as DreCategoria[]) ?? [];
  const catsEdit = categorias.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo }));
  type Lanc = {
    id: string;
    data: string;
    descricao: string | null;
    valor: number;
    forma_pagamento: string | null;
    origem: string;
    categoria_id: string | null;
    vencimento: string | null;
    pago: boolean;
    dre_categorias: { nome?: string; tipo?: string; grupo?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  const lancamentos = (lancData as unknown as Lanc[]) ?? [];

  let receitas = 0;
  let saidas = 0;
  for (const l of lancamentos) {
    if (l.dre_categorias?.tipo === "receita") receitas += Number(l.valor);
    else if (l.dre_categorias?.tipo !== "nao_operacional")
      saidas += Number(l.valor);
  }
  const resultado = receitas - saidas;

  // Agrupa categorias por grupo para o select.
  const porGrupo = new Map<string, DreCategoria[]>();
  for (const c of categorias) {
    const arr = porGrupo.get(c.grupo) ?? [];
    arr.push(c);
    porGrupo.set(c.grupo, arr);
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Financeiro
          </h1>
          <p className="mt-1 text-zinc-500">
            Lançamentos de receitas e despesas. Pedidos conferidos entram
            sozinhos como CMV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro?mes=${desloca(mes, -1)}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            ‹
          </Link>
          <span className="min-w-40 text-center text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
            {rotuloMes(mes)}
          </span>
          <Link
            href={`/financeiro?mes=${desloca(mes, 1)}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            ›
          </Link>
          <Link
            href="/financeiro/contas"
            className="ml-2 rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Contas a pagar
          </Link>
          <Link
            href={`/financeiro/orcamento?mes=${mes}`}
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Orçamento
          </Link>
          <Link
            href="/financeiro/banco"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Banco
          </Link>
          <Link
            href="/financeiro/vendas"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Vendas
          </Link>
          <Link
            href={`/financeiro/dre?mes=${mes}`}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Ver DRE →
          </Link>
        </div>
      </div>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Receitas</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {moeda(receitas)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Despesas</p>
          <p className="mt-1 text-xl font-bold text-red-600">{moeda(saidas)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Resultado</p>
          <p
            className={`mt-1 text-xl font-bold ${
              resultado >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {moeda(resultado)}
          </p>
        </div>
      </div>

      {/* Novo lançamento */}
      <form
        action={criarLancamento}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Data</label>
          <input type="date" name="data" defaultValue={`${mes}-01`} className={inputCls} />
        </div>
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Categoria</label>
          <select name="categoria_id" required className={`${inputCls} w-full`}>
            <option value="">Escolha...</option>
            {[...porGrupo.entries()].map(([grupo, cs]) => (
              <optgroup key={grupo} label={grupo}>
                {cs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Valor (R$)</label>
          <input name="valor" inputMode="decimal" placeholder="0,00" className={`${inputCls} w-28`} />
        </div>
        <div className="min-w-32 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Descrição</label>
          <input name="descricao" placeholder="opcional" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Vencimento</label>
          <input type="date" name="vencimento" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Origem (banco)</label>
          <select name="banco" defaultValue="" className={inputCls}>
            <option value="">—</option>
            {BANCOS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tipo pagto.</label>
          <select name="forma_pagamento" defaultValue="" className={inputCls}>
            <option value="">—</option>
            {TIPOS_PAGAMENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Repetir</label>
          <select name="repeticao" defaultValue="nenhuma" className={inputCls}>
            <option value="nenhuma">Não</option>
            <option value="parcelado">Parcelado</option>
            <option value="fixo">Mensal fixo</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Vezes</label>
          <input
            name="vezes"
            type="number"
            min="1"
            max="60"
            defaultValue="1"
            className={`${inputCls} w-16`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Frequência</label>
          <select name="frequencia" defaultValue="mensal" className={inputCls}>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
            <option value="dias">A cada X dias</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Dias</label>
          <input
            name="dias"
            type="number"
            min="1"
            defaultValue="30"
            className={`${inputCls} w-16`}
          />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="pago" defaultChecked />
          Já pago
        </label>
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 dark:bg-zinc-700">
          Lançar
        </button>
      </form>

      {/* Lista */}
      {lancamentos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum lançamento neste mês.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lancamentos.map((l) => (
                <LancamentoLinha
                  key={l.id}
                  l={{
                    id: l.id,
                    data: l.data,
                    descricao: l.descricao,
                    valor: Number(l.valor),
                    origem: l.origem,
                    categoria_id: l.categoria_id,
                    tipo: l.dre_categorias?.tipo ?? null,
                    categoria_nome: l.dre_categorias?.nome ?? null,
                    fornecedor_nome: l.fornecedores?.nome ?? null,
                    vencimento: l.vencimento,
                    pago: l.pago,
                  }}
                  categorias={catsEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
