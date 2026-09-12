import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/etiqueta-vencimentos";

export const metadata = { title: "Rodízio · relatório · Brasa" };
export const dynamic = "force-dynamic";

const brT = (iso: string) => iso.split("-").reverse().join("/");

type Linha = {
  mesa: number; sabor: string; tipo: string; fracao: string; quantidade: number;
  status: string; criado_em: string; pronto_em: string | null; garcom: string | null;
};

// Relatório simples do rodízio: quantos pedidos, sabores mais pedidos, tempo
// médio até "pronto" e pedidos por mesa, num período.
export default async function RelatorioRodizioPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? "") ? sp.de! : new Date(new Date(hoje).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? "") ? sp.ate! : hoje;

  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos_rodizio")
    .select("mesa, sabor, tipo, fracao, quantidade, status, criado_em, pronto_em, garcom")
    .gte("criado_em", `${de}T00:00:00-03:00`)
    .lte("criado_em", `${ate}T23:59:59-03:00`)
    .order("criado_em")
    .limit(5000);
  const linhas = (data as Linha[]) ?? [];
  const validas = linhas.filter((l) => l.status !== "cancelado");

  const total = validas.reduce((s, l) => s + l.quantidade, 0);
  const cancelados = linhas.length - validas.length;

  const porSabor = new Map<string, number>();
  const porMesa = new Map<number, number>();
  let somaMin = 0, nMin = 0;
  for (const l of validas) {
    porSabor.set(l.sabor, (porSabor.get(l.sabor) ?? 0) + l.quantidade);
    porMesa.set(l.mesa, (porMesa.get(l.mesa) ?? 0) + l.quantidade);
    if (l.pronto_em) { somaMin += (new Date(l.pronto_em).getTime() - new Date(l.criado_em).getTime()) / 60000; nMin++; }
  }
  const topSabores = [...porSabor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topMesas = [...porMesa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const mediaMin = nMin ? somaMin / nMin : null;
  const doces = validas.filter((l) => l.tipo === "doce").reduce((s, l) => s + l.quantidade, 0);

  const inputCls = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="p-4 md:p-6">
      <Link href="/cozinha" className="text-sm text-zinc-500 hover:text-orange-600">← Tablet da cozinha</Link>
      <h1 className="mt-2 mb-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🍕 Rodízio · relatório</h1>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">De</label>
          <input type="date" name="de" defaultValue={de} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Até</label>
          <input type="date" name="ate" defaultValue={ate} className={inputCls} />
        </div>
        <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-700">Ver</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Pizzas pedidas", String(total)],
          ["Doces", String(doces)],
          ["Tempo médio até pronto", mediaMin != null ? `${mediaMin.toFixed(1)} min` : "—"],
          ["Cancelados", String(cancelados)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">{r}</p>
            <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-zinc-50">{v}</p>
          </div>
        ))}
      </div>
      <p className="mb-4 text-xs text-zinc-400">Período {brT(de)} a {brT(ate)} · {linhas.length} pedidos lançados</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <p className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-zinc-800">Sabores mais pedidos</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topSabores.map(([s, n]) => (
                <tr key={s}><td className="px-4 py-1.5">{s}</td><td className="px-4 py-1.5 text-right font-semibold tabular-nums">{n}</td></tr>
              ))}
              {topSabores.length === 0 && <tr><td className="px-4 py-6 text-center text-zinc-400">Nada no período.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <p className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-zinc-800">Pedidos por mesa</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topMesas.map(([m, n]) => (
                <tr key={m}><td className="px-4 py-1.5">Mesa {m}</td><td className="px-4 py-1.5 text-right font-semibold tabular-nums">{n}</td></tr>
              ))}
              {topMesas.length === 0 && <tr><td className="px-4 py-6 text-center text-zinc-400">Nada no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
