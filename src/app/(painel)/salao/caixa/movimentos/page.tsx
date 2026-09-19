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
  comanda_id: string | null;
  comanda_ids: string[] | null;
};

const cor = (tipo: string) =>
  tipo === "sangria"
    ? "text-red-600"
    : tipo === "suprimento"
      ? "text-blue-600"
      : "text-emerald-600";
const sinal = (tipo: string, valor = 0) => (tipo === "sangria" || valor < 0 ? "−" : "+");
// Uma venda pode quitar várias comandas: mostra um link por comanda, com o
// número. Movimento antigo (antes da 0180) cai no id único.
const comandasDo = (m: Mov) => (m.comanda_ids?.length ? m.comanda_ids : m.comanda_id ? [m.comanda_id] : []);
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
    .select("id, tipo, descricao, forma_pagamento, valor, criado_em, comanda_id, comanda_ids")
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
      <Link href="/salao/caixa" className="text-sm text-texto-suave hover:text-orange-600">
        ← Voltar ao caixa
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Movimentações do caixa</h1>
          <p className="text-sm text-texto-suave">
            Caixa <b>{caixa.nome}</b>, aberto às {abertoHora} · {movs.length} lançamento(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-texto-suave">Vendas <b className="text-emerald-600">{brl(vendas)}</b></span>
          <span className="text-texto-suave">Suprimentos <b className="text-blue-600">{brl(suprimentos)}</b></span>
          <span className="text-texto-suave">Sangrias <b className="text-red-600">{brl(sangrias)}</b></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="min-w-[560px] w-full text-sm">
          <thead className="bg-superficie-suave text-left text-xs text-texto-fraco">
            <tr>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 font-medium">Forma</th>
              <th className="px-4 py-2 font-medium">Hora</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {movs.map((m) => (
              <tr key={m.id} className="">
                <td className="px-4 py-2 text-texto">
                  {m.descricao || m.tipo}
                  <span className="ml-2 text-mini text-texto-fraco">{m.tipo}</span>
                  {m.tipo === "venda" && (
                    <Link
                      href={`/salao/caixa/movimentos/${m.id}`}
                      className="ml-2 text-xs font-medium text-orange-600 hover:underline"
                      title="Ver como foi pago e o que tinha em cada comanda"
                    >
                      ver pagamento
                    </Link>
                  )}
                  {comandasDo(m).length > 0 && (
                    <span className="ml-2 text-mini text-texto-fraco">
                      {comandasDo(m).length} comanda{comandasDo(m).length === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-texto-suave">{m.forma_pagamento || "—"}</td>
                <td className="px-4 py-2 text-texto-fraco">{hora(m.criado_em)}</td>
                <td className={`px-4 py-2 text-right font-medium ${cor(m.tipo)}`}>
                  {sinal(m.tipo, Number(m.valor))} {brl(Math.abs(Number(m.valor)))}
                </td>
              </tr>
            ))}
            <tr className="">
              <td className="px-4 py-2 text-texto-suave">Saldo anterior</td>
              <td className="px-4 py-2 text-texto-suave">Dinheiro</td>
              <td className="px-4 py-2 text-texto-fraco">{abertoHora}</td>
              <td className="px-4 py-2 text-right text-texto-suave">{brl(saldoInicial)}</td>
            </tr>
            {movs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-texto-fraco">
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
