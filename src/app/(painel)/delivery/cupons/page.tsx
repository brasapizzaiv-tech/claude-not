import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { criarCupom, alternarCupom, excluirCupom } from "../actions";
import { dataBR } from "@/lib/format";
import { hojeSP } from "@/lib/etiqueta-vencimentos";

export const metadata = { title: "Cupons · Delivery" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm ";

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
      <h1 className="mb-1 mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="etiqueta" tamanho={19} /> Cupons de desconto</h1>
      <p className="mb-5 text-sm text-texto-suave">O cliente digita o código no carrinho do app (/pedir) e o desconto entra no pedido.</p>

      <form action={criarCupom} className="mb-6 flex flex-wrap items-end gap-2 rounded-cartao border border-borda p-4">
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Código</label>
          <input name="codigo" required placeholder="BRASA10" className={`${inputCls} w-32 `} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Tipo</label>
          <select name="tipo" className={inputCls}>
            <option value="percent">% do pedido</option>
            <option value="valor">R$ fixo</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Valor</label>
          <input name="valor" required inputMode="decimal" placeholder="10" className={`${inputCls} w-20`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Pedido mínimo (R$)</label>
          <input name="minimo" inputMode="decimal" placeholder="—" className={`${inputCls} w-24`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Válido até</label>
          <input name="validade" type="date" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Limite de usos</label>
          <input name="max_usos" inputMode="numeric" placeholder="—" className={`${inputCls} w-20`} />
        </div>
        <Enviar className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo">+ Criar cupom</Enviar>
      </form>

      <div className="overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <thead className="bg-superficie-suave text-left text-xs text-texto-suave">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Desconto</th>
              <th className="px-4 py-3">Regras</th>
              <th className="px-4 py-3 text-right">Usos</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {cupons.map((c) => {
              const vencido = c.validade != null && c.validade < hoje;
              const esgotado = c.max_usos != null && c.usos >= c.max_usos;
              return (
                <tr key={c.id} className={`bg-painel-cartao ${!c.ativo || vencido || esgotado ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 font-bold">{c.codigo}
                    {vencido && <span className="ml-2 text-mini text-rose-500">VENCIDO</span>}
                    {esgotado && <span className="ml-2 text-mini text-rose-500">ESGOTADO</span>}
                  </td>
                  <td className="px-4 py-2">{c.tipo === "percent" ? `${Number(c.valor)}%` : brl(Number(c.valor))}</td>
                  <td className="px-4 py-2 text-xs text-texto-suave">
                    {c.minimo != null ? `mín. ${brl(Number(c.minimo))}` : "sem mínimo"}
                    {c.validade ? ` · até ${dataBR(c.validade)}` : ""}
                    {c.max_usos != null ? ` · máx. ${c.max_usos} usos` : ""}
                  </td>
                  <td className="px-4 py-2 text-right">{c.usos}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <form action={alternarCupom} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="ativo" value={c.ativo ? "0" : "1"} />
                      <Enviar className="mr-3 text-xs text-texto-fraco hover:text-orange-600">{c.ativo ? "desativar" : "reativar"}</Enviar>
                    </form>
                    <form action={excluirCupom} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <Enviar className="text-xs text-texto-fraco hover:text-red-600">excluir</Enviar>
                    </form>
                  </td>
                </tr>
              );
            })}
            {cupons.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-texto-fraco">Nenhum cupom ainda. Crie o primeiro acima — ex.: BRASA10 com 10%.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
