import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { UploadVendas, UploadFaturamento } from "./upload";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function hojeISO() {
  return hojeSP(); // fuso de Brasília (o servidor roda em UTC)
}
function inicioMesISO() {
  return hojeISO().slice(0, 8) + "01";
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : inicioMesISO();
  const ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : hojeISO();

  const supabase = await createClient();

  // O banco devolve no máximo 1000 linhas por vez — pagina até o fim.
  const lista: { data_emissao: string; valor: number }[] = [];
  for (let i = 0; ; i += 1000) {
    const { data: pagina } = await supabase
      .from("notas_emitidas")
      .select("data_emissao, valor")
      .eq("status", "Autorizado")
      .gte("data_emissao", de)
      .lte("data_emissao", ate)
      .order("data_emissao")
      .range(i, i + 999);
    const rows = (pagina as { data_emissao: string; valor: number }[]) ?? [];
    lista.push(...rows);
    if (rows.length < 1000) break;
  }

  const { data: fatRows } = await supabase
    .from("faturamento_dias")
    .select("data, almoco, noite")
    .gte("data", de)
    .lte("data", ate);
  const totalNotas = lista.length;
  const totalEmitido = lista.reduce((s, n) => s + Number(n.valor), 0);

  // Faturamento da planilha (tabela própria — não mexe no DRE).
  const fatDe = new Map<string, number>();
  for (const f of ((fatRows as { data: string; almoco: number | null; noite: number | null }[]) ?? [])) {
    fatDe.set(f.data, Number(f.almoco ?? 0) + Number(f.noite ?? 0));
  }
  const faturamentoLancado = [...fatDe.values()].reduce((s, v) => s + v, 0);
  const diferenca = faturamentoLancado - totalEmitido;

  // Agrupa por dia (notas + faturamento no mesmo dia).
  const porDia = new Map<string, { n: number; valor: number }>();
  for (const n of lista) {
    const g = porDia.get(n.data_emissao) ?? { n: 0, valor: 0 };
    g.n += 1;
    g.valor += Number(n.valor);
    porDia.set(n.data_emissao, g);
  }
  for (const d of fatDe.keys()) if (!porDia.has(d)) porDia.set(d, { n: 0, valor: 0 });
  const dias = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Notas emitidas × Faturamento
          </h1>
          <p className="mt-1 text-zinc-500">
            Valor das notas de venda (NFC-e) no período vs. o faturamento da
            planilha (almoço + noite). Não mexe no Financeiro/DRE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <UploadVendas />
          <UploadFaturamento />
        </div>
      </div>

      {/* Filtro por período */}
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">De</label>
          <input type="date" name="de" defaultValue={de} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Até</label>
          <input type="date" name="ate" defaultValue={ate} className={inputCls} />
        </div>
        <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Filtrar
        </button>
      </form>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Notas emitidas</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {totalNotas}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Valor emitido</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {moeda(totalEmitido)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Faturamento (planilha)</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {moeda(faturamentoLancado)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Diferença</p>
          <p
            className={`mt-1 text-xl font-bold ${
              Math.abs(diferenca) < 0.01 ? "text-zinc-500" : "text-amber-600"
            }`}
          >
            {moeda(diferenca)}
          </p>
        </div>
      </div>
      {faturamentoLancado === 0 && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Sem faturamento importado neste período. Use o botão{" "}
          <b>Importar faturamento (planilha)</b> acima — os valores ficam só
          nesta comparação, sem mexer no Financeiro/DRE.
        </p>
      )}

      {/* Por dia */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3 text-right">Notas</th>
              <th className="px-4 py-3 text-right">Valor emitido</th>
              <th className="px-4 py-3 text-right">Faturamento</th>
              <th className="px-4 py-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {dias.map(([dia, g]) => {
              const fat = fatDe.get(dia);
              const dif = fat != null ? fat - g.valor : null;
              return (
                <tr key={dia} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {dataBR(dia)}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500">{g.n}</td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-800 dark:text-zinc-200">
                    {moeda(g.valor)}
                  </td>
                  <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">
                    {fat != null ? moeda(fat) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${dif == null ? "text-zinc-400" : Math.abs(dif) < 0.01 ? "text-zinc-400" : "text-amber-600"}`}>
                    {dif != null ? moeda(dif) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
