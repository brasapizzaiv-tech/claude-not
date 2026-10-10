import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { UploadVendas, UploadFaturamento } from "./upload";
import { faturamentoPorDia, notasPorDia, somarFaturamento } from "@/lib/faturamento";

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

  // Notas: as importadas do sistema antigo (até ago/2026) + as NFC-e que o
  // próprio sistema emite (desde 07/09). Faturamento: planilha onde o dia foi
  // importado, senão o caixa do sistema (src/lib/faturamento.ts).
  const [notasDias, fatDias] = await Promise.all([
    notasPorDia(supabase, de, ate),
    faturamentoPorDia(supabase, de, ate),
  ]);
  const totalNotas = notasDias.reduce((s, d) => s + d.notas, 0);
  const totalEmitido = notasDias.reduce((s, d) => s + d.valor, 0);

  const fatDe = new Map(fatDias.map((f) => [f.dia, f]));
  const somaFat = somarFaturamento(fatDias);
  const faturamentoLancado = somaFat.total;
  const diferenca = faturamentoLancado - totalEmitido;

  // Agrupa por dia (notas + faturamento no mesmo dia).
  const porDia = new Map<string, { n: number; valor: number }>();
  for (const n of notasDias) porDia.set(n.dia, { n: n.notas, valor: n.valor });
  for (const d of fatDe.keys()) if (!porDia.has(d)) porDia.set(d, { n: 0, valor: 0 });
  const dias = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const inputCls =
    "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

  return (
    <div className="w-full p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
            Notas emitidas × Faturamento
          </h1>
          <p className="mt-1 text-texto-suave">
            Notas de venda (NFC-e) do período contra o faturamento. Notas: as do
            sistema antigo importadas e as que o próprio sistema emite desde 07/09.
            Faturamento: a planilha nos dias importados, o caixa do sistema nos outros.
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
          <p className="text-xs text-texto-suave">Faturamento</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {moeda(faturamentoLancado)}
          </p>
          <p className="mt-0.5 text-xs text-texto-fraco">
            {[somaFat.diasPlanilha ? `${somaFat.diasPlanilha} dias da planilha` : "", somaFat.diasSistema ? `${somaFat.diasSistema} do caixa do sistema` : ""].filter(Boolean).join(" · ") || "sem dias"}
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
      {somaFat.diasSistema > 0 && (
        <p className="mb-6 rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Nos dias marcados &quot;caixa&quot;, o faturamento é o que passou pelo caixa do sistema.
          Hoje isso é só o almoço: a noite ainda não passa por ele. Importando a planilha
          desses dias no botão <b>Importar faturamento (planilha)</b>, ela passa a valer no lugar.
        </p>
      )}

      {/* Por dia */}
      <div className="overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3 text-right">Notas</th>
                <th className="px-4 py-3 text-right">Valor emitido</th>
                <th className="px-4 py-3 text-right">Faturamento</th>
                <th className="px-4 py-3">Fonte</th>
                <th className="px-4 py-3 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {dias.map(([dia, g]) => {
                const fat = fatDe.get(dia);
                const dif = fat != null ? fat.total - g.valor : null;
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
                      {fat != null ? moeda(fat.total) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-texto-fraco">{fat ? (fat.fonte === "planilha" ? "planilha" : "caixa") : ""}</td>
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
    </div>
  );
}
