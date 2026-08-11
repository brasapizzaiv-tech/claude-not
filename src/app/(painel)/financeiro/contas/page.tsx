import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { alternarPago } from "../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formata "AAAA-MM-DD" como "DD/MM/AAAA" sem depender de fuso horário.
const dataBR = (s: string) => {
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
};

export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const sp = await searchParams;
  const verPagas = sp.ver === "pagas";

  const supabase = await createClient();
  const { data } = await supabase
    .from("lancamentos")
    .select(
      "id, data, descricao, valor, vencimento, pago, pago_em, origem, dre_categorias(nome, tipo), fornecedores(nome)",
    )
    .eq("pago", verPagas)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(500);

  type Lanc = {
    id: string;
    descricao: string | null;
    valor: number;
    vencimento: string | null;
    pago_em: string | null;
    origem: string;
    dre_categorias: { nome?: string; tipo?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  // Só despesas (não receitas) entram em contas a pagar.
  const todos = ((data as unknown as Lanc[]) ?? []).filter(
    (l) => l.dre_categorias?.tipo !== "receita",
  );

  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  const baldes: { nome: string; cor: string; itens: Lanc[] }[] = [
    { nome: "Vencidas", cor: "text-red-600", itens: [] },
    { nome: "Próximos 7 dias", cor: "text-amber-600", itens: [] },
    { nome: "A vencer", cor: "text-zinc-500", itens: [] },
    { nome: "Sem vencimento", cor: "text-zinc-400", itens: [] },
  ];
  for (const l of todos) {
    if (!l.vencimento) baldes[3].itens.push(l);
    else if (l.vencimento < hoje) baldes[0].itens.push(l);
    else if (l.vencimento <= em7) baldes[1].itens.push(l);
    else baldes[2].itens.push(l);
  }

  const totalAberto = todos.reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Contas a pagar
          </h1>
          <p className="mt-1 text-zinc-500">
            {verPagas
              ? "Contas já pagas."
              : "O que está em aberto, por vencimento. Pedidos conferidos entram sozinhos."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/financeiro/contas${verPagas ? "" : "?ver=pagas"}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            {verPagas ? "Ver em aberto" : "Ver pagas"}
          </Link>
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Lançamentos
          </Link>
        </div>
      </div>

      {!verPagas && (
        <div className="mb-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Total em aberto</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {moeda(totalAberto)}
          </p>
        </div>
      )}

      {todos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          {verPagas ? "Nenhuma conta paga ainda." : "Nada a pagar. 🎉"}
        </div>
      ) : verPagas ? (
        <ListaContas itens={todos} pago />
      ) : (
        <div className="space-y-6">
          {baldes
            .filter((b) => b.itens.length > 0)
            .map((b) => {
              const soma = b.itens.reduce((s, l) => s + Number(l.valor), 0);
              return (
                <div key={b.nome}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className={`text-sm font-semibold ${b.cor}`}>
                      {b.nome}
                    </h2>
                    <span className="text-sm font-medium text-zinc-500">
                      {moeda(soma)}
                    </span>
                  </div>
                  <ListaContas itens={b.itens} />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function ListaContas({
  itens,
  pago,
}: {
  itens: {
    id: string;
    descricao: string | null;
    valor: number;
    vencimento: string | null;
    pago_em: string | null;
    dre_categorias: { nome?: string } | null;
    fornecedores: { nome?: string } | null;
  }[];
  pago?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((l) => (
            <tr key={l.id} className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-2">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {l.fornecedores?.nome ?? l.descricao ?? "Despesa"}
                </div>
                <div className="text-xs text-zinc-400">
                  {l.dre_categorias?.nome ?? ""}
                  {l.vencimento ? ` · vence ${dataBR(l.vencimento)}` : ""}
                  {pago && l.pago_em ? ` · pago em ${dataBR(l.pago_em)}` : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                {moeda(Number(l.valor))}
              </td>
              <td className="px-4 py-2 text-right">
                <form action={alternarPago} className="inline">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="pago" value={pago ? "false" : "true"} />
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      pago
                        ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {pago ? "Reabrir" : "Pagar"}
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
