import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { ROTULO_DIVERGENCIA, type ResumoDivergencias, type TipoDivergencia } from "@/lib/conferencia-core";

// Relatório de divergências da conferência: o que veio diferente do pedido
// (quantidade, item faltando, preço acima do cotado, cobrado sem receber),
// por período e por fornecedor. Os dados vêm gravados em cada pedido
// (pedidos.divergencias), calculados na hora em que a equipe confere, o
// painel salva ou a nota é ligada.
export const metadata = { title: "Divergências da conferência · Brasa" };
export const dynamic = "force-dynamic";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQ = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const hojeSP = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const GRAVE = new Set<TipoDivergencia>(["faltou", "cobrado_nao_recebido", "preco_nota_acima", "nota_sem_pedido"]);

type Ped = {
  id: string;
  data: string;
  status: string;
  conf_colab_por: string | null;
  divergencias: ResumoDivergencias;
  divergencias_n: number;
  fornecedor_id: string | null;
  fornecedores: { nome?: string } | null;
};

export default async function DivergenciasPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; forn?: string }> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? "") ? sp.de! : hoje.slice(0, 7) + "-01";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? "") ? sp.ate! : hoje;
  const supabase = await createClient();
  const [{ data }, { data: totalRows }] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id, data, status, conf_colab_por, divergencias, divergencias_n, fornecedor_id, fornecedores(nome)")
      .gte("data", de).lte("data", ate)
      .gt("divergencias_n", 0)
      .order("data", { ascending: false }),
    supabase.from("pedidos").select("id, fornecedor_id").gte("data", de).lte("data", ate),
  ]);
  let pedidos = (data as unknown as Ped[]) ?? [];
  if (sp.forn) pedidos = pedidos.filter((p) => p.fornecedor_id === sp.forn);
  const totalPedidos = ((totalRows as { id: string; fornecedor_id: string | null }[]) ?? []).filter((p) => !sp.forn || p.fornecedor_id === sp.forn).length;

  // Resumo por fornecedor
  type Forn = { id: string; nome: string; pedidos: number; divergencias: number; faltas: number; precoAcima: number; valorAMais: number };
  const porForn = new Map<string, Forn>();
  let valorAMais = 0, divergTotal = 0;
  let faltas = 0, precoAcima = 0;
  for (const p of pedidos) {
    const f = porForn.get(p.fornecedor_id ?? "?") ?? { id: p.fornecedor_id ?? "?", nome: p.fornecedores?.nome ?? "—", pedidos: 0, divergencias: 0, faltas: 0, precoAcima: 0, valorAMais: 0 };
    f.pedidos++;
    f.divergencias += p.divergencias_n;
    for (const d of p.divergencias?.itens ?? []) {
      if (d.tipo === "faltou" || d.tipo === "qtd_recebida") f.faltas++;
      if (d.tipo === "preco_nota_acima") f.precoAcima++;
    }
    f.valorAMais += Number(p.divergencias?.valor_a_mais ?? 0);
    porForn.set(f.id, f);
    divergTotal += p.divergencias_n;
    valorAMais += Number(p.divergencias?.valor_a_mais ?? 0);
  }
  faltas = [...porForn.values()].reduce((s, f) => s + f.faltas, 0);
  precoAcima = [...porForn.values()].reduce((s, f) => s + f.precoAcima, 0);
  const fornecedores = [...porForn.values()].sort((a, b) => b.valorAMais - a.valorAMais || b.divergencias - a.divergencias);

  const card = "rounded-cartao border border-borda p-4 ";
  const inputCls = "rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm text-texto   ";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link href="/conferencia" className="text-sm text-texto-suave hover:text-orange-600">← Voltar para conferência</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto"><Icone nome="alerta" tamanho={20} className="mr-2 text-amber-600" /> Divergências da conferência</h1>
          <p className="mt-1 text-sm text-texto-suave">O que veio diferente do pedido: quantidade, item faltando, preço acima do cotado, cobrado sem receber.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">De</label>
            <input type="date" name="de" defaultValue={de} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Até</label>
            <input type="date" name="ate" defaultValue={ate} className={inputCls} />
          </div>
          {sp.forn && <input type="hidden" name="forn" value={sp.forn} />}
          <button className="rounded-controle bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">Filtrar</button>
          {sp.forn && <Link href={`/conferencia/divergencias?de=${de}&ate=${ate}`} className="text-xs text-texto-suave underline">todos os fornecedores</Link>}
        </form>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-texto-suave">Pedidos no período</p><p className="text-2xl font-bold text-texto">{totalPedidos}</p><p className="text-xs text-texto-fraco">{pedidos.length} com divergência{totalPedidos > 0 ? ` (${Math.round((pedidos.length / totalPedidos) * 100)}%)` : ""}</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Divergências</p><p className="text-2xl font-bold text-texto">{divergTotal}</p><p className="text-xs text-texto-fraco">{faltas} de quantidade/falta</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Preço acima do cotado</p><p className="text-2xl font-bold text-amber-600">{precoAcima}</p><p className="text-xs text-texto-fraco">itens</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Cobrado a mais</p><p className="text-2xl font-bold text-red-600">{moeda(valorAMais)}</p><p className="text-xs text-texto-fraco">preço acima + cobrado sem receber</p></div>
      </div>

      {fornecedores.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr><th className="px-4 py-2">Fornecedor</th><th className="px-4 py-2 text-right">Pedidos c/ problema</th><th className="px-4 py-2 text-right">Divergências</th><th className="px-4 py-2 text-right">Qtd/falta</th><th className="px-4 py-2 text-right">Preço acima</th><th className="px-4 py-2 text-right">Cobrado a mais</th></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {fornecedores.map((f) => (
                <tr key={f.id} className="">
                  <td className="px-4 py-2 font-medium text-texto"><Link href={`/conferencia/divergencias?de=${de}&ate=${ate}&forn=${f.id}`} className="hover:text-orange-600 hover:underline">{f.nome}</Link></td>
                  <td className="px-4 py-2 text-right">{f.pedidos}</td>
                  <td className="px-4 py-2 text-right">{f.divergencias}</td>
                  <td className="px-4 py-2 text-right">{f.faltas}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{f.precoAcima}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600">{f.valorAMais > 0 ? moeda(f.valorAMais) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pedidos.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhuma divergência no período.
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => (
            <div key={p.id} className={`rounded-cartao border p-4 ${p.divergencias?.gravidade === "grave" ? "border-red-200 dark:border-red-900" : "border-amber-200 dark:border-amber-900"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/conferencia/${p.id}`} className="font-semibold text-texto hover:text-orange-600 hover:underline">{p.fornecedores?.nome ?? "—"}</Link>
                  <span className="ml-2 text-sm text-texto-suave">{dataBR(p.data)} · {p.status}{p.conf_colab_por ? ` · conferido por ${p.conf_colab_por}` : ""}{p.divergencias?.tem_nota ? " · com nota" : " · sem nota"}</span>
                </div>
                <div className="text-sm">
                  <span className="rounded-full bg-superficie-suave px-2 py-0.5 text-xs font-medium">{p.divergencias_n} divergência{p.divergencias_n === 1 ? "" : "s"}</span>
                  {Number(p.divergencias?.valor_a_mais ?? 0) > 0 && <span className="ml-2 font-semibold text-red-600">{moeda(Number(p.divergencias.valor_a_mais))} a mais</span>}
                </div>
              </div>
              <ul className="mt-2 grid gap-1 text-sm text-texto-suave sm:grid-cols-2">
                {(p.divergencias?.itens ?? []).map((d, i) => (
                  <li key={i} className={GRAVE.has(d.tipo) ? "text-red-700 dark:text-red-300" : ""}>
                    <b>{d.produto}</b>: {ROTULO_DIVERGENCIA[d.tipo]}
                    {d.tipo === "qtd_recebida" || d.tipo === "faltou" ? ` (pedido ${fmtQ(d.pedido)}, recebido ${fmtQ(d.recebido)})` : ""}
                    {d.tipo === "preco_nota_acima" || d.tipo === "preco_nota_abaixo" ? ` (cotado ${moeda(d.preco_cotado ?? 0)}, nota ${moeda(d.preco_nota ?? 0)})` : ""}
                    {d.tipo === "qtd_nota" ? ` (pedido ${fmtQ(d.pedido)}, nota ${fmtQ(d.nota)})` : ""}
                    {d.tipo === "cobrado_nao_recebido" ? ` (nota ${fmtQ(d.nota)}, recebido ${fmtQ(d.recebido)})` : ""}
                    {d.tipo === "veio_a_mais" ? ` (${fmtQ(d.recebido)})` : ""}
                    {d.tipo === "nota_sem_pedido" ? ` (${fmtQ(d.nota)} × ${d.preco_nota != null ? moeda(d.preco_nota) : "—"})` : ""}
                    {d.tipo === "unidade_diferente" ? ` (nota ${moeda(d.preco_nota ?? 0)} × ${fmtQ(d.nota)} vs cotado ${moeda(d.preco_cotado ?? 0)}: parece caixa de ${d.recebido}, ajuste o fator na nota)` : ""}
                    {d.valor ? <span className="ml-1 text-xs text-texto-suave">({d.valor > 0 ? "+" : ""}{moeda(d.valor)})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
