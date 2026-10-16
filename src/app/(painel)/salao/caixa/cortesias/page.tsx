import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icone } from "@/components/icone";
import { hojeSP } from "@/lib/etiqueta-vencimentos";

// CORTESIAS E VALES-PRESENTE (migration 0233)
// Contas fechadas sem entrar dinheiro: o que a casa deu (cortesia) e o que foi
// pago com vale vendido antes. Ficam fora do caixa e do faturamento — aqui é
// onde se contabiliza, com o motivo que o caixa escreveu.
export const metadata = { title: "Cortesias e vales · Brasa" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

type Mov = { id: string; tipo: string; descricao: string | null; forma_pagamento: string | null; valor: number; observacao: string | null; criado_em: string };

export default async function CortesiasPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = valida(sp.de) ?? `${hoje.slice(0, 8)}01`;
  const ate = valida(sp.ate) ?? hoje;

  const supabase = await createClient();
  const { data } = await supabase
    .from("pdv_caixa_mov")
    .select("id, tipo, descricao, forma_pagamento, valor, observacao, criado_em")
    .in("tipo", ["cortesia", "vale_presente"])
    .gte("criado_em", `${de}T00:00:00-03:00`)
    .lte("criado_em", `${ate}T23:59:59-03:00`)
    .order("criado_em", { ascending: false })
    .limit(1000);
  const movs = (data as Mov[]) ?? [];

  const total = (t: string) => movs.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.valor), 0);
  const conta = (t: string) => movs.filter((m) => m.tipo === t).length;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <Link href="/salao/caixa" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar ao caixa</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Cortesias e vales-presente</h1>
      <p className="mt-1 text-sm text-texto-suave">
        Contas fechadas sem entrar dinheiro. Não contam no caixa nem no faturamento — o motivo é o que o caixa escreveu.
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="text-texto-suave">
          De
          <input type="date" name="de" defaultValue={de} className="mt-1 block rounded-controle border border-borda-forte bg-transparent px-2 py-1.5" />
        </label>
        <label className="text-texto-suave">
          Até
          <input type="date" name="ate" defaultValue={ate} className="mt-1 block rounded-controle border border-borda-forte bg-transparent px-2 py-1.5" />
        </label>
        <button className="rounded-controle bg-texto px-4 py-2 font-semibold text-fundo">Ver</button>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Cortesias</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{brl(total("cortesia"))}</p>
          <p className="text-xs text-texto-suave">{conta("cortesia")} conta(s)</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Vales-presente usados</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{brl(total("vale_presente"))}</p>
          <p className="text-xs text-texto-suave">{conta("vale_presente")} conta(s)</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-cartao bg-painel-cartao">
        {movs.length === 0 ? (
          <p className="p-8 text-center text-sm text-texto-suave">Nenhuma cortesia ou vale nesse período.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="rotulo text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Forma</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
                <th className="px-4 py-2 font-medium">Conta</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {movs.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-texto-suave">{dataHora(m.criado_em)}</td>
                  <td className="px-4 py-2 text-texto">
                    <span className="inline-flex items-center gap-1.5"><Icone nome="presente" tamanho={13} /> {m.forma_pagamento || (m.tipo === "cortesia" ? "Cortesia" : "Vale-presente")}</span>
                  </td>
                  <td className="px-4 py-2 text-texto">{m.observacao || <span className="text-texto-fraco">—</span>}</td>
                  <td className="px-4 py-2 text-texto-suave">{m.descricao || "—"}</td>
                  <td className="px-4 py-2 text-right font-medium text-texto">{brl(Number(m.valor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
