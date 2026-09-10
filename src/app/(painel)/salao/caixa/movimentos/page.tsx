import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Histórico do caixa aberto: tudo que entrou e saiu. Fica fora da tela de
// receber porque lá o operador precisa de foco, não de histórico.
export const metadata = { title: "Movimentações do caixa · Brasa" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mov = {
  id: string;
  tipo: string;
  descricao: string | null;
  forma_pagamento: string | null;
  valor: number;
  criado_em: string;
};

const cor = (tipo: string) =>
  tipo === "sangria"
    ? "text-red-600"
    : tipo === "suprimento"
      ? "text-blue-600"
      : "text-emerald-600";
const sinal = (tipo: string) => (tipo === "sangria" ? "−" : "+");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export default async function MovimentosCaixaPage() {
  const supabase = await createClient();
  const { data: caixa } = await supabase
    .from("pdv_caixas")
    .select("id, nome, saldo_inicial, aberto_em")
    .is("fechado_em", null)
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!caixa) redirect("/salao/caixa");

  const { data: movRows } = await supabase
    .from("pdv_caixa_mov")
    .select("id, tipo, descricao, forma_pagamento, valor, criado_em")
    .eq("caixa_id", caixa.id)
    .order("criado_em", { ascending: false });
  const movs = (movRows as Mov[]) ?? [];

  const saldoInicial = Number(caixa.saldo_inicial);
  const abertoHora = hora(caixa.aberto_em as string);

  let vendas = 0, suprimentos = 0, sangrias = 0;
  for (const m of movs) {
    const v = Number(m.valor);
    if (m.tipo === "venda") vendas += v;
    else if (m.tipo === "suprimento") suprimentos += v;
    else if (m.tipo === "sangria") sangrias += v;
  }

  return (
    <div className="p-4 md:p-6">
      <Link href="/salao/caixa" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Voltar ao caixa
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Movimentações do caixa</h1>
          <p className="text-sm text-zinc-500">
            Caixa <b>{caixa.nome}</b>, aberto às {abertoHora} · {movs.length} lançamento(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-zinc-500">Vendas <b className="text-emerald-600">{brl(vendas)}</b></span>
          <span className="text-zinc-500">Suprimentos <b className="text-blue-600">{brl(suprimentos)}</b></span>
          <span className="text-zinc-500">Sangrias <b className="text-red-600">{brl(sangrias)}</b></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 font-medium">Forma</th>
              <th className="px-4 py-2 font-medium">Hora</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {movs.map((m) => (
              <tr key={m.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                  {m.descricao || m.tipo}
                  <span className="ml-2 text-[10px] uppercase text-zinc-400">{m.tipo}</span>
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-300">{m.forma_pagamento || "—"}</td>
                <td className="px-4 py-2 text-zinc-400">{hora(m.criado_em)}</td>
                <td className={`px-4 py-2 text-right font-medium ${cor(m.tipo)}`}>
                  {sinal(m.tipo)} {brl(Number(m.valor))}
                </td>
              </tr>
            ))}
            <tr className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-2 text-zinc-500">Saldo anterior</td>
              <td className="px-4 py-2 text-zinc-500">Dinheiro</td>
              <td className="px-4 py-2 text-zinc-400">{abertoHora}</td>
              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-300">{brl(saldoInicial)}</td>
            </tr>
            {movs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Nenhuma movimentação ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
