import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Relatórios · Delivery" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ORIGEM: Record<string, string> = { app: "📱 App", whatsapp: "🟢 WhatsApp", instagram: "📸 Instagram", telefone: "📞 Telefone", balcao: "🏪 Balcão" };

function Tabela({ titulo, linhas }: { titulo: string; linhas: { k: string; qtd: number; valor: number }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="mb-2 font-bold">{titulo}</h2>
      {linhas.length === 0 ? <p className="text-sm text-zinc-400">Sem dados.</p> : (
        <div className="space-y-1">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span>{l.k} <span className="text-xs text-zinc-400">({l.qtd})</span></span>
              <span className="font-medium">{l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const nDias = [1, 7, 30].includes(Number(dias)) ? Number(dias) : 7;
  const desde = new Date(new Date().getTime() - nDias * 86400000).toISOString();

  const supabase = await createClient();
  const [{ data: pedidosRaw }, { data: entregadores }] = await Promise.all([
    supabase
      .from("delivery_pedidos")
      .select("comanda_id, tipo, status, origem, forma_pagamento, pago, taxa_entrega, desconto, bairro, entregador_id")
      .gte("criado_em", desde),
    supabase.from("entregadores").select("id, nome"),
  ]);
  const peds = (pedidosRaw as {
    comanda_id: string | null; tipo: string; status: string; origem: string; forma_pagamento: string | null;
    pago: boolean; taxa_entrega: number; desconto: number; bairro: string | null; entregador_id: string | null;
  }[]) ?? [];

  const comandaIds = [...new Set(peds.map((p) => p.comanda_id).filter(Boolean))] as string[];
  const somaDe = new Map<string, number>();
  if (comandaIds.length) {
    const { data: itens } = await supabase.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", comandaIds);
    for (const it of itens ?? []) {
      const v = Number(it.qtd) * Number(it.preco_unit || 0);
      somaDe.set(it.comanda_id as string, (somaDe.get(it.comanda_id as string) ?? 0) + v);
    }
  }
  const entrNome = new Map((entregadores ?? []).map((e) => [e.id, e.nome]));

  const totalDe = (p: (typeof peds)[number]) =>
    Math.round(((somaDe.get(p.comanda_id ?? "") ?? 0) + (p.tipo === "retirada" ? 0 : Number(p.taxa_entrega)) - Number(p.desconto)) * 100) / 100;

  const validos = peds.filter((p) => p.status !== "cancelado");
  const faturamento = Math.round(validos.reduce((s, p) => s + totalDe(p), 0) * 100) / 100;
  const qtd = validos.length;
  const ticket = qtd ? Math.round((faturamento / qtd) * 100) / 100 : 0;
  const cancelados = peds.length - validos.length;
  const aReceber = validos.filter((p) => !p.pago).length;

  function agrupar<T extends string>(chave: (p: (typeof peds)[number]) => T | null, rotulo?: (k: T) => string) {
    const m = new Map<T, { qtd: number; valor: number }>();
    for (const p of validos) {
      const k = chave(p);
      if (k == null || k === "") continue;
      const cur = m.get(k) ?? { qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += totalDe(p);
      m.set(k, cur);
    }
    return [...m.entries()].map(([k, v]) => ({ k: rotulo ? rotulo(k) : k, qtd: v.qtd, valor: Math.round(v.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  }

  const porOrigem = agrupar((p) => p.origem as string, (k) => ORIGEM[k] ?? k);
  const porBairro = agrupar((p) => p.bairro);
  const porForma = agrupar((p) => p.forma_pagamento);
  const porEntregador = agrupar((p) => (p.tipo === "entrega" ? (p.entregador_id ?? "sem") : null), (k) => (k === "sem" ? "Sem entregador" : entrNome.get(k) ?? "?"));

  return (
    <div className="p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">📊 Relatórios do delivery</h1>
        <div className="ml-auto flex gap-1">
          {[[1, "Hoje"], [7, "7 dias"], [30, "30 dias"]].map(([d, lbl]) => (
            <Link key={d} href={`/delivery/relatorios?dias=${d}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${nDias === d ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"}`}>{lbl}</Link>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { t: "Pedidos", v: String(qtd) },
          { t: "Faturamento", v: brl(faturamento) },
          { t: "Ticket médio", v: brl(ticket) },
          { t: "A receber", v: String(aReceber), sub: `${cancelados} cancelado(s)` },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs text-zinc-500">{c.t}</div>
            <div className="text-2xl font-bold">{c.v}</div>
            {c.sub && <div className="text-xs text-zinc-400">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tabela titulo="Por origem" linhas={porOrigem} />
        <Tabela titulo="Por bairro" linhas={porBairro} />
        <Tabela titulo="Por forma de pagamento" linhas={porForma} />
        <Tabela titulo="Por entregador" linhas={porEntregador} />
      </div>
    </div>
  );
}
