import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Recebimento: o pagamento de uma ou várias comandas, com as formas usadas
// (uma conta pode ser dividida em dinheiro + Pix, por exemplo), o que cada
// comanda tinha e os dados do cartão quando passou no pinpad.
export const metadata = { title: "Recebimento · Caixa" };
export const dynamic = "force-dynamic";

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Mov = {
  id: string; caixa_id: string; descricao: string | null; forma_pagamento: string | null;
  valor: number; criado_em: string; comanda_id: string | null; comanda_ids: string[] | null;
  bandeira: string | null; observacao: string | null;
  tef_nsu: string | null; tef_autorizacao: string | null; tef_rede: string | null; tef_terminal: string | null;
};

export default async function RecebimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: movRow } = await supabase
    .from("pdv_caixa_mov")
    .select("id, caixa_id, descricao, forma_pagamento, valor, criado_em, comanda_id, comanda_ids, bandeira, observacao, tef_nsu, tef_autorizacao, tef_rede, tef_terminal")
    .eq("id", id)
    .maybeSingle();
  if (!movRow) notFound();
  const mov = movRow as Mov;
  const ids = mov.comanda_ids?.length ? mov.comanda_ids : mov.comanda_id ? [mov.comanda_id] : [];

  // As outras formas do MESMO recebimento: mesmas comandas, no mesmo minuto
  // (o caixa grava uma linha por forma de pagamento).
  const de = new Date(new Date(mov.criado_em).getTime() - 5 * 60000).toISOString();
  const ate = new Date(new Date(mov.criado_em).getTime() + 5 * 60000).toISOString();
  const { data: irmaosRows } = await supabase
    .from("pdv_caixa_mov")
    .select("id, caixa_id, descricao, forma_pagamento, valor, criado_em, comanda_id, comanda_ids, bandeira, observacao, tef_nsu, tef_autorizacao, tef_rede, tef_terminal")
    .eq("caixa_id", mov.caixa_id)
    .eq("tipo", "venda")
    .gte("criado_em", de)
    .lte("criado_em", ate)
    .order("criado_em");
  const mesmaConta = ((irmaosRows as Mov[]) ?? []).filter((x) => (x.descricao ?? "") === (mov.descricao ?? ""));
  const pagamentos = mesmaConta.length > 0 ? mesmaConta : [mov];
  const total = pagamentos.reduce((s, p) => s + Number(p.valor), 0);

  // Comandas e itens
  const [{ data: comRows }, { data: itemRows }] = await Promise.all([
    ids.length > 0
      ? supabase.from("pdv_comandas").select("id, numero, mesa, status, valor_buffet, buffet_valor_pago, livre, servico, aberta_em, fechada_em").in("id", ids)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase.from("pdv_comanda_itens").select("id, comanda_id, descricao, qtd, preco_unit, valor_pago, pago").in("comanda_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  type Com = { id: string; numero: number; mesa: string | null; status: string; valor_buffet: number | null; buffet_valor_pago: number | null; livre: boolean; servico: number | null; aberta_em: string; fechada_em: string | null };
  type Item = { id: string; comanda_id: string; descricao: string | null; qtd: number; preco_unit: number; valor_pago: number | null; pago: boolean };
  const comandas = ((comRows as Com[]) ?? []).sort((a, b) => b.numero - a.numero);
  const itens = (itemRows as Item[]) ?? [];

  const card = "rounded-cartao border border-borda p-4 ";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/salao/caixa/movimentos" className="text-sm text-texto-suave hover:text-orange-600">← Movimentações</Link>
      <h1 className="mt-2 font-numero text-2xl font-semibold tracking-apertada text-texto">Recebimento</h1>
      <p className="mb-4 mt-1 text-sm text-texto-suave">
        {mov.descricao ?? "Venda"} · {dataHora(mov.criado_em)}
      </p>

      {/* Pagamento */}
      <div className={card}>
        <p className="mb-2 text-sm font-semibold text-texto">Como foi pago</p>
        <ul className="divide-y divide-borda">
          {pagamentos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="text-zinc-800 dark:text-zinc-100">
                {p.forma_pagamento ?? "—"}
                {p.bandeira && <span className="ml-2 rounded bg-superficie-suave px-1.5 py-0.5 text-mini text-texto-suave">{p.bandeira}</span>}
                {p.tef_nsu && (
                  <span className="ml-2 text-xs text-texto-suave">
                    pinpad · NSU {p.tef_nsu}{p.tef_autorizacao ? ` · aut ${p.tef_autorizacao}` : ""}{p.tef_rede ? ` · ${p.tef_rede}` : ""}
                  </span>
                )}
                {p.observacao && <span className="ml-2 text-xs text-texto-suave">{p.observacao}</span>}
                <span className="ml-2 text-xs text-texto-fraco">{hora(p.criado_em)}</span>
              </span>
              <b className={Number(p.valor) < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}>{brl(Number(p.valor))}</b>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-borda pt-2 text-base font-bold text-texto">
          <span>Total do recebimento</span>
          <span>{brl(total)}</span>
        </div>
      </div>

      {/* Comandas */}
      <div className="mt-4 space-y-3">
        {comandas.length === 0 && (
          <p className={`${card} text-sm text-texto-suave`}>Este lançamento não tem comanda ligada.</p>
        )}
        {comandas.map((c) => {
          const meus = itens.filter((i) => i.comanda_id === c.id);
          const buffet = Number(c.valor_buffet ?? 0);
          const somaItens = meus.reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
          const servico = Number(c.servico ?? 0);
          return (
            <div key={c.id} className={card}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-texto">
                  Comanda #{c.numero}
                  {c.mesa ? <span className="ml-2 text-sm font-normal text-texto-suave">{c.mesa}</span> : null}
                  {c.livre && <span className="ml-2 rounded bg-orange-500 px-1.5 py-0.5 text-mini font-bold text-white">LIVRE</span>}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-mini font-medium ${c.status === "fechada" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                    {c.status}
                  </span>
                </p>
                <Link href={`/salao/comandas/${c.id}`} className="text-xs text-orange-600 hover:underline">abrir a comanda →</Link>
              </div>
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {buffet > 0 && (
                  <li className="flex justify-between py-1.5">
                    <span className="text-texto-suave">Buffet{c.livre ? " (livre)" : ""}</span>
                    <span className="text-texto-suave">{brl(buffet)}</span>
                  </li>
                )}
                {meus.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 py-1.5">
                    <span className="text-texto-suave">
                      {Number(i.qtd) > 1 ? `${i.qtd}× ` : ""}{i.descricao ?? "Item"}
                      {!i.pago && <span className="ml-2 text-mini text-amber-600">não pago</span>}
                    </span>
                    <span className="text-texto-suave">{brl(Number(i.qtd) * Number(i.preco_unit))}</span>
                  </li>
                ))}
                {meus.length === 0 && buffet === 0 && <li className="py-1.5 text-texto-fraco">Sem itens.</li>}
              </ul>
              <div className="mt-2 flex justify-between border-t border-borda pt-2 text-sm">
                <span className="text-texto-suave">
                  Subtotal{servico > 0 ? ` + serviço ${brl(servico)}` : ""}
                  {c.fechada_em ? ` · fechada ${hora(c.fechada_em)}` : ""}
                </span>
                <b className="text-texto">{brl(buffet + somaItens + servico)}</b>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
