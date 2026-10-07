import Link from "next/link";
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

export default async function MovimentosCaixaPage({ searchParams }: { searchParams: Promise<{ caixa?: string }> }) {
  const { caixa: caixaParam } = await searchParams;
  const supabase = await createClient();
  // Sem caixa aberto, mostra o ÚLTIMO caixa: consultar não é movimentar
  // (pedido do Rafael em 07/10/2026). Os anteriores ficam numa lista no fim.
  const { data: caixasRows } = await supabase
    .from("pdv_caixas")
    .select("id, nome, saldo_inicial, aberto_em, fechado_em")
    .order("aberto_em", { ascending: false })
    .limit(15);
  type CaixaRow = { id: string; nome: string; saldo_inicial: number; aberto_em: string; fechado_em: string | null };
  const caixas = (caixasRows as CaixaRow[]) ?? [];
  const caixa = (caixaParam ? caixas.find((c) => c.id === caixaParam) : undefined) ?? caixas.find((c) => !c.fechado_em) ?? caixas[0];
  if (!caixa) {
    return (
      <div className="p-4 md:p-6">
        <Link href="/salao/caixa" className="text-sm text-texto-suave hover:text-orange-600">← Voltar ao caixa</Link>
        <p className="mt-4 text-texto-suave">Nenhum caixa foi aberto ainda.</p>
      </div>
    );
  }
  const anteriores = caixas.filter((c) => c.id !== caixa.id);
  const diaBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

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
            Caixa <b>{caixa.nome}</b> de {diaBR(caixa.aberto_em)}, aberto às {abertoHora}
            {caixa.fechado_em ? <> e <b>fechado</b> às {hora(caixa.fechado_em)}</> : null} · {movs.length} lançamento(s)
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

      {anteriores.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-texto">Caixas anteriores</h2>
          <div className="flex flex-wrap gap-2">
            {anteriores.map((c) => (
              <Link
                key={c.id}
                href={`/salao/caixa/movimentos?caixa=${c.id}`}
                className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm text-texto-suave transition hover:bg-superficie-suave"
              >
                {diaBR(c.aberto_em)} · {hora(c.aberto_em)}{c.fechado_em ? ` – ${hora(c.fechado_em)}` : " (aberto)"}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
