import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { abrirCaixa } from "../actions";
import { servicoAgora } from "../util";
import { CaixaAcoes } from "./acoes";
import { ReceberComandas } from "./receber";

const FORMAS_PGTO = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito"];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mov = {
  id: string;
  tipo: string;
  descricao: string | null;
  forma_pagamento: string | null;
  valor: number;
  criado_em: string;
};

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ abrir?: string }>;
}) {
  const { abrir } = await searchParams;
  const supabase = await createClient();
  const { data: caixa } = await supabase
    .from("pdv_caixas")
    .select("id, nome, saldo_inicial, aberto_em, status")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ---- Sem caixa aberto: formulário de abertura ----
  if (!caixa) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">
          ← Salão
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Frente de Caixa</h1>
        <p className="mt-1 text-zinc-500">Nenhum caixa aberto. Abra um para começar a receber.</p>

        <form
          action={abrirCaixa}
          className="mt-6 space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Nome / turno</label>
            <input
              name="nome"
              defaultValue="Noite"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Troco inicial / saldo anterior (R$)</label>
            <input
              name="saldo_inicial"
              inputMode="decimal"
              placeholder="0,00"
              className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            Abrir caixa
          </button>
        </form>
      </div>
    );
  }

  // ---- Caixa aberto: movimentos + resumo ----
  const { data: movRows } = await supabase
    .from("pdv_caixa_mov")
    .select("id, tipo, descricao, forma_pagamento, valor, criado_em")
    .eq("caixa_id", caixa.id)
    .order("criado_em", { ascending: false });
  const movs = (movRows as Mov[]) ?? [];

  // Comandas ABERTAS com o total (buffet + itens + serviço) — para receber aqui.
  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const serv = servicoAgora(cfg);

  const { data: comAbertas } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa, valor_buffet, buffet_pago, buffet_valor_pago")
    .eq("status", "aberta")
    .order("numero", { ascending: false });
  const abertas =
    (comAbertas as {
      id: string;
      numero: number;
      mesa: string | null;
      valor_buffet: number;
      buffet_pago: boolean;
      buffet_valor_pago: number;
    }[]) ?? [];

  const fator = 1 + serv / 100;
  type ItemCom = {
    id: string;
    nome: string;
    qtd: number;
    preco: number;
    pago: boolean;
    valorPago: number;
  };
  const itensPorCom = new Map<string, ItemCom[]>();
  if (abertas.length > 0) {
    const { data: itc } = await supabase
      .from("pdv_comanda_itens")
      .select("id, comanda_id, qtd, preco_unit, pago, valor_pago, produtos(nome)")
      .in("comanda_id", abertas.map((c) => c.id));
    for (const i of (itc as unknown as {
      id: string;
      comanda_id: string;
      qtd: number;
      preco_unit: number;
      pago: boolean;
      valor_pago: number;
      produtos: { nome?: string } | null;
    }[]) ?? []) {
      const arr = itensPorCom.get(i.comanda_id) ?? [];
      arr.push({
        id: i.id,
        nome: i.produtos?.nome ?? "Item",
        qtd: Number(i.qtd),
        preco: Number(i.preco_unit),
        pago: !!i.pago,
        valorPago: Number(i.valor_pago ?? 0),
      });
      itensPorCom.set(i.comanda_id, arr);
    }
  }

  const comandasReceber = abertas.map((c) => {
    const itens = itensPorCom.get(c.id) ?? [];
    const sub = Number(c.valor_buffet ?? 0) + itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    const total = Math.round(sub * fator * 100) / 100;
    // Restante = o que falta de cada linha (com serviço) menos o já pago.
    const restItens = itens.reduce(
      (s, i) => s + Math.max(0, i.qtd * i.preco * fator - i.valorPago),
      0,
    );
    const restBuffet = Math.max(0, Number(c.valor_buffet ?? 0) * fator - Number(c.buffet_valor_pago ?? 0));
    return {
      id: c.id,
      numero: c.numero,
      mesa: c.mesa ?? "",
      total,
      restante: Math.round((restItens + restBuffet) * 100) / 100,
      buffet: Number(c.valor_buffet ?? 0),
      buffetPago: !!c.buffet_pago,
      buffetValorPago: Number(c.buffet_valor_pago ?? 0),
      itens,
    };
  });
  const servPercent = serv;

  const saldoInicial = Number(caixa.saldo_inicial);
  const vendasPorForma = new Map<string, number>();
  let suprimentos = 0;
  let sangrias = 0;
  for (const m of movs) {
    const v = Number(m.valor);
    if (m.tipo === "venda") {
      const f = m.forma_pagamento || "Outros";
      vendasPorForma.set(f, (vendasPorForma.get(f) || 0) + v);
    } else if (m.tipo === "suprimento") suprimentos += v;
    else if (m.tipo === "sangria") sangrias += v;
  }
  const totalVendas = [...vendasPorForma.values()].reduce((s, v) => s + v, 0);
  const vendasDinheiro = vendasPorForma.get("Dinheiro") || 0;
  const dinheiroEmCaixa = saldoInicial + vendasDinheiro + suprimentos - sangrias;

  const abertoHora = new Date(caixa.aberto_em).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cor = (tipo: string) =>
    tipo === "venda"
      ? "text-emerald-600"
      : tipo === "suprimento"
        ? "text-blue-600"
        : "text-red-600";
  const sinal = (tipo: string) => (tipo === "sangria" ? "−" : "+");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">
            ← Salão
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Frente de Caixa</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {caixa.nome} · <span className="font-medium text-emerald-600">Aberto</span> às {abertoHora}
          </p>
        </div>
        <CaixaAcoes caixaId={caixa.id} />
      </div>

      {/* Frente: receber comandas (buscar, somar várias, pagar) */}
      <div className="mb-4">
        <ReceberComandas comandas={comandasReceber} formas={FORMAS_PGTO} servPercent={servPercent} autoAbrir={abrir} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Movimentos */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
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
              <tr className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 text-zinc-500">Saldo anterior</td>
                <td className="px-4 py-2 text-zinc-500">Dinheiro</td>
                <td className="px-4 py-2 text-zinc-400">{abertoHora}</td>
                <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-300">{brl(saldoInicial)}</td>
              </tr>
              {movs.map((m) => (
                <tr key={m.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                    {m.descricao || m.tipo}
                    <span className="ml-2 text-[10px] uppercase text-zinc-400">{m.tipo}</span>
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-300">{m.forma_pagamento || "—"}</td>
                  <td className="px-4 py-2 text-zinc-400">
                    {new Date(m.criado_em).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${cor(m.tipo)}`}>
                    {sinal(m.tipo)} {brl(Number(m.valor))}
                  </td>
                </tr>
              ))}
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

        {/* Resumo */}
        <div className="h-fit space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resumo</p>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Saldo anterior</span>
              <span>{brl(saldoInicial)}</span>
            </div>
            {[...vendasPorForma.entries()].map(([forma, v]) => (
              <div key={forma} className="flex justify-between text-zinc-700 dark:text-zinc-300">
                <span>Vendas · {forma}</span>
                <span>{brl(v)}</span>
              </div>
            ))}
            <div className="flex justify-between text-blue-600">
              <span>Suprimentos</span>
              <span>{brl(suprimentos)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Sangrias</span>
              <span>− {brl(sangrias)}</span>
            </div>
          </div>

          <div className="space-y-1 border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800">
            <div className="flex justify-between font-medium text-zinc-900 dark:text-zinc-100">
              <span>Total recebido</span>
              <span>{brl(totalVendas)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-zinc-900 dark:text-zinc-50">
              <span>💵 Dinheiro no caixa</span>
              <span>{brl(dinheiroEmCaixa)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
