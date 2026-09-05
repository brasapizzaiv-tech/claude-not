import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { criarCupom, alternarCupom, excluirCupom } from "../actions";
import { dataBR } from "@/lib/format";
import { hojeSP } from "@/lib/etiqueta-vencimentos";

export const metadata = { title: "Cupons · Delivery" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700";

export default async function CuponsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("cupons").select("*").order("criado_em", { ascending: false });
  const cupons = (data as {
    id: string; codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null;
    validade: string | null; max_usos: number | null; usos: number; ativo: boolean;
  }[]) ?? [];
  const hoje = hojeSP();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 text-xl font-bold">🎟️ Cupons de desconto</h1>
      <p className="mb-5 text-sm text-zinc-500">O cliente digita o código no carrinho do app (/pedir) e o desconto entra no pedido.</p>

      <form action={criarCupom} className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Código</label>
          <input name="codigo" required placeholder="BRASA10" className={`${inputCls} w-32 uppercase`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Tipo</label>
          <select name="tipo" className={inputCls}>
            <option value="percent">% do pedido</option>
            <option value="valor">R$ fixo</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Valor</label>
          <input name="valor" required inputMode="decimal" placeholder="10" className={`${inputCls} w-20`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Pedido mínimo (R$)</label>
          <input name="minimo" inputMode="decimal" placeholder="—" className={`${inputCls} w-24`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Válido até</label>
          <input name="validade" type="date" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Limite de usos</label>
          <input name="max_usos" inputMode="numeric" placeholder="—" className={`${inputCls} w-20`} />
        </div>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">+ Criar cupom</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Desconto</th>
              <th className="px-4 py-3">Regras</th>
              <th className="px-4 py-3 text-right">Usos</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {cupons.map((c) => {
              const vencido = c.validade != null && c.validade < hoje;
              const esgotado = c.max_usos != null && c.usos >= c.max_usos;
              return (
                <tr key={c.id} className={`bg-white dark:bg-zinc-950 ${!c.ativo || vencido || esgotado ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 font-bold">{c.codigo}
                    {vencido && <span className="ml-2 text-[10px] text-rose-500">VENCIDO</span>}
                    {esgotado && <span className="ml-2 text-[10px] text-rose-500">ESGOTADO</span>}
                  </td>
                  <td className="px-4 py-2">{c.tipo === "percent" ? `${Number(c.valor)}%` : brl(Number(c.valor))}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {c.minimo != null ? `mín. ${brl(Number(c.minimo))}` : "sem mínimo"}
                    {c.validade ? ` · até ${dataBR(c.validade)}` : ""}
                    {c.max_usos != null ? ` · máx. ${c.max_usos} usos` : ""}
                  </td>
                  <td className="px-4 py-2 text-right">{c.usos}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <form action={alternarCupom} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="ativo" value={c.ativo ? "0" : "1"} />
                      <button className="mr-3 text-xs text-zinc-400 hover:text-orange-600">{c.ativo ? "desativar" : "reativar"}</button>
                    </form>
                    <form action={excluirCupom} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-zinc-400 hover:text-red-600">excluir</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {cupons.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Nenhum cupom ainda. Crie o primeiro acima — ex.: BRASA10 com 10%.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
