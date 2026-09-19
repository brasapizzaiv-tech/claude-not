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
    "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria";

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Notas emitidas × Faturamento
          </h1>
          <p className="mt-1 text-texto-suave">
            Valor das notas de venda (NFC-e) no período vs. o faturamento da
            planilha (almoço + noite). Não mexe no Financeiro/DRE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
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
          <label className="mb-1 block text-xs text-texto-suave">De</label>
          <input type="date" name="de" defaultValue={de} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Até</label>
          <input type="date" name="ate" defaultValue={ate} className={inputCls} />
        </div>
        <button className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
          Filtrar
        </button>
      </form>

      {/* Resumo */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-cartao border border-borda p-4">
          <p className="text-xs text-texto-suave">Notas emitidas</p>
          <p className="mt-1 text-xl font-bold text-texto">
            {totalNotas}
          </p>
        </div>
        <div className="rounded-cartao border border-borda p-4">
          <p className="text-xs text-texto-suave">Valor emitido</p>
          <p className="mt-1 text-xl font-bold text-texto">
            {moeda(totalEmitido)}
          </p>
        </div>
        <div className="rounded-cartao border border-borda p-4">
          <p className="text-xs text-texto-suave">Faturamento (planilha)</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {moeda(faturamentoLancado)}
          </p>
        </div>
        <div className="rounded-cartao border border-borda p-4">
          <p className="text-xs text-texto-suave">Diferença</p>
          <p
            className={`mt-1 text-xl font-bold ${
              Math.abs(diferenca) < 0.01 ? "text-texto-suave" : "text-amber-600"
            }`}
          >
            {moeda(diferenca)}
          </p>
        </div>
      </div>
      {faturamentoLancado === 0 && (
        <p className="mb-6 rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Sem faturamento importado neste período. Use o botão{" "}
          <b>Importar faturamento (planilha)</b> acima — os valores ficam só
          nesta comparação, sem mexer no Financeiro/DRE.
        </p>
      )}

      {/* Por dia */}
      <div className="overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-texto-fraco">
            <tr>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3 text-right">Notas</th>
              <th className="px-4 py-3 text-right">Valor emitido</th>
              <th className="px-4 py-3 text-right">Faturamento</th>
              <th className="px-4 py-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {dias.map(([dia, g]) => {
              const fat = fatDe.get(dia);
              const dif = fat != null ? fat - g.valor : null;
              return (
                <tr key={dia} className="">
                  <td className="px-4 py-2 text-texto-suave">
                    {dataBR(dia)}
                  </td>
                  <td className="px-4 py-2 text-right text-texto-suave">{g.n}</td>
                  <td className="px-4 py-2 text-right font-medium text-texto">
                    {moeda(g.valor)}
                  </td>
                  <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">
                    {fat != null ? moeda(fat) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${dif == null ? "text-texto-fraco" : Math.abs(dif) < 0.01 ? "text-texto-fraco" : "text-amber-600"}`}>
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
