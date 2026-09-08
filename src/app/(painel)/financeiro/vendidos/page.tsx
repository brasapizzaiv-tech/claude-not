import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hojeSP, somarDias } from "@/lib/etiqueta-vencimentos";
import { VendidosClient, type Linha, type Agrupar } from "./vendidos-client";

export const metadata = { title: "Produtos vendidos · Financeiro" };

// Hora de virada do turno (antes = dia, depois = noite), em São Paulo.
const VIRADA_NOITE = 17;

type ItemRow = {
  id: string; comanda_id: string; item_id: string | null; descricao: string; qtd: number; preco_unit: number | null;
  criado_em: string; pago: boolean; criado_por: string | null; criado_colab_id: string | null;
};
type ComandaRow = { id: string; numero: number; mesa: string | null; status: string; forma_pagamento: string | null; valor_buffet: number | null; peso: number | null; aberta_em: string; livre: boolean | null };

function horaSP(iso: string) {
  return Number(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
}

export default async function VendidosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? "") ? (sp.de as string) : hoje;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? "") ? (sp.ate as string) : de;
  const turno = sp.turno === "dia" || sp.turno === "noite" ? sp.turno : "todos";
  const agrupar: Agrupar = (["produto", "categoria", "turno", "forma", "garcom", "origem"] as const).includes(sp.agrupar as Agrupar) ? (sp.agrupar as Agrupar) : "produto";
  const soPagos = sp.pagos === "1";

  // Janela em UTC a partir do dia em São Paulo (UTC-3).
  const iniIso = `${de}T03:00:00.000Z`;
  const fimIso = `${somarDias(ate, 1)}T02:59:59.999Z`;

  const supabase = await createClient();

  // Itens do período (pagina de 1000 em 1000).
  const itens: ItemRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("pdv_comanda_itens")
      .select("id, comanda_id, item_id, descricao, qtd, preco_unit, criado_em, pago, criado_por, criado_colab_id")
      .gte("criado_em", iniIso)
      .lte("criado_em", fimIso)
      .order("criado_em")
      .range(from, from + 999);
    const pg = (data as ItemRow[]) ?? [];
    itens.push(...pg);
    if (pg.length < 1000) break;
  }

  const comIds = [...new Set(itens.map((i) => i.comanda_id))];
  const [{ data: comsItens }, { data: comsBuffet }, { data: cancel }, { data: pdvItens }, { data: delivs }, { data: excl }] = await Promise.all([
    comIds.length ? supabase.from("pdv_comandas").select("id, numero, mesa, status, forma_pagamento, valor_buffet, peso, aberta_em, livre").in("id", comIds) : Promise.resolve({ data: [] as ComandaRow[] }),
    supabase.from("pdv_comandas").select("id, numero, mesa, status, forma_pagamento, valor_buffet, peso, aberta_em, livre, buffet_pago").gt("valor_buffet", 0).gte("aberta_em", iniIso).lte("aberta_em", fimIso),
    supabase.from("pdv_itens_cancelados").select("descricao, qtd, valor, motivo, cancelado_em").gte("cancelado_em", iniIso).lte("cancelado_em", fimIso),
    supabase.from("pdv_itens").select("id, nome, categoria"),
    supabase.from("delivery_pedidos").select("comanda_id").gte("criado_em", iniIso).lte("criado_em", fimIso),
    supabase.from("pdv_comandas_excluidas").select("comanda_numero, mesa, valor, motivo, excluido_em").gte("excluido_em", iniIso).lte("excluido_em", fimIso).order("excluido_em", { ascending: false }),
  ]);
  const comMap = new Map(((comsItens as ComandaRow[]) ?? []).map((c) => [c.id, c]));
  const catDe = new Map(((pdvItens as { id: string; nome: string; categoria: string | null }[]) ?? []).map((p) => [p.id, p.categoria || "Outros"]));
  const nomeItemDe = new Map(((pdvItens as { id: string; nome: string }[]) ?? []).map((p) => [p.id, p.nome]));
  const deliveryComandas = new Set(((delivs as { comanda_id: string | null }[]) ?? []).map((d) => d.comanda_id).filter(Boolean) as string[]);

  // Nomes de quem lançou (usuários e colaboradores).
  const uids = [...new Set(itens.map((i) => i.criado_por).filter(Boolean))] as string[];
  const cids = [...new Set(itens.map((i) => i.criado_colab_id).filter(Boolean))] as string[];
  const [{ data: profs }, { data: colabs }] = await Promise.all([
    uids.length ? supabase.from("profiles").select("id, nome").in("id", uids) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    cids.length ? supabase.from("colaboradores").select("id, nome").in("id", cids) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const nomeDe = new Map([...((profs as { id: string; nome: string }[]) ?? []), ...((colabs as { id: string; nome: string }[]) ?? [])].map((p) => [p.id, p.nome]));

  const origemDe = (c: ComandaRow | undefined) => {
    if (!c) return "Salão";
    if (deliveryComandas.has(c.id)) return "Delivery";
    const m = (c.mesa || "").toLowerCase();
    if (m.startsWith("balcão") || m.startsWith("balcao")) return "Balcão";
    if (m.startsWith("balança") || m.startsWith("balanca")) return "Balança";
    return "Salão";
  };

  // Linhas "cruas": cada item (e cada buffet) com todas as dimensões.
  type Cru = { produto: string; categoria: string; turno: string; forma: string; garcom: string; origem: string; qtd: number; valor: number; pago: boolean };
  const crus: Cru[] = [];
  for (const it of itens) {
    const c = comMap.get(it.comanda_id);
    if (c?.status === "excluida") continue;
    const h = horaSP(it.criado_em);
    const t = h >= VIRADA_NOITE ? "noite" : "dia";
    if (turno !== "todos" && t !== turno) continue;
    if (soPagos && !it.pago) continue;
    const valor = Math.round(Number(it.qtd) * Number(it.preco_unit ?? 0) * 100) / 100;
    const nome = (it.item_id && nomeItemDe.get(it.item_id)) || (it.descricao || "Item").split("\n")[0].trim();
    crus.push({
      produto: it.item_id ? nome : `🍕 ${nome}`.slice(0, 80),
      categoria: it.item_id ? catDe.get(it.item_id) ?? "Outros" : "Pizzas",
      turno: t === "dia" ? "☀️ Dia" : "🌙 Noite",
      forma: c?.forma_pagamento || (it.pago ? "(não informada)" : "(em aberto)"),
      garcom: (it.criado_por && nomeDe.get(it.criado_por)) || (it.criado_colab_id && nomeDe.get(it.criado_colab_id)) || "—",
      origem: origemDe(c),
      qtd: Number(it.qtd),
      valor,
      pago: !!it.pago,
    });
  }
  // Buffet (balança): uma "venda" por comanda com buffet.
  let buffetPratos = 0, buffetKg = 0, buffetValor = 0;
  for (const c of ((comsBuffet as (ComandaRow & { buffet_pago: boolean | null })[]) ?? [])) {
    if (c.status === "excluida") continue;
    const h = horaSP(c.aberta_em);
    const t = h >= VIRADA_NOITE ? "noite" : "dia";
    if (turno !== "todos" && t !== turno) continue;
    if (soPagos && !c.buffet_pago) continue;
    const v = Number(c.valor_buffet) || 0;
    buffetPratos++; buffetKg += Number(c.peso) || 0; buffetValor += v;
    crus.push({
      produto: c.livre ? "Buffet livre" : "Buffet a kg",
      categoria: "Buffet",
      turno: t === "dia" ? "☀️ Dia" : "🌙 Noite",
      forma: c.forma_pagamento || (c.buffet_pago ? "(não informada)" : "(em aberto)"),
      garcom: "Balança",
      origem: origemDe(c),
      qtd: 1,
      valor: v,
      pago: !!c.buffet_pago,
    });
  }

  // Agrupa pela dimensão escolhida.
  const grupos = new Map<string, Linha>();
  for (const r of crus) {
    const chave = r[agrupar];
    const g = grupos.get(chave) ?? { nome: chave, categoria: agrupar === "produto" ? r.categoria : "", qtd: 0, valor: 0, pagos: 0 };
    g.qtd = Math.round((g.qtd + r.qtd) * 1000) / 1000;
    g.valor = Math.round((g.valor + r.valor) * 100) / 100;
    if (r.pago) g.pagos = Math.round((g.pagos + r.valor) * 100) / 100;
    grupos.set(chave, g);
  }
  const linhas = [...grupos.values()].sort((a, b) => b.valor - a.valor);
  const totalValor = Math.round(crus.reduce((s, r) => s + r.valor, 0) * 100) / 100;
  const totalQtd = Math.round(crus.reduce((s, r) => s + r.qtd, 0) * 1000) / 1000;
  // Cancelados = itens cancelados (com motivo) + comandas excluídas inteiras.
  const cancelados = ((cancel as { descricao: string | null; qtd: number; valor: number; motivo: string | null; cancelado_em: string }[]) ?? []);
  const excluidas = ((excl as { comanda_numero: number | null; mesa: string | null; valor: number; motivo: string | null; excluido_em: string }[]) ?? []);
  const cancelValor = Math.round((cancelados.reduce((s, c) => s + Number(c.valor), 0) + excluidas.reduce((s, c) => s + Number(c.valor), 0)) * 100) / 100;
  const cancelQtd = cancelados.reduce((s, c) => s + Number(c.qtd), 0);
  const horaBR = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const all = { de, ate, turno, agrupar, pagos: soPagos ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    return `/financeiro/vendidos?${q.toString()}`;
  };
  const atalhos = [
    { r: "Hoje", de: hoje, ate: hoje },
    { r: "Ontem", de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { r: "7 dias", de: somarDias(hoje, -6), ate: hoje },
    { r: "Este mês", de: `${hoje.slice(0, 7)}-01`, ate: hoje },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link href="/financeiro" className="text-sm text-zinc-500 hover:text-orange-600">← Financeiro</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🛒 Produtos vendidos</h1>
      <p className="mb-4 mt-1 text-sm text-zinc-500">Tudo que saiu no salão, balcão, balança e delivery, pelo que foi lançado nas comandas. Noite começa às {VIRADA_NOITE}h.</p>

      {/* Período e filtros (links: sem JS) */}
      <form className="mb-3 flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="agrupar" value={agrupar} />
        {soPagos && <input type="hidden" name="pagos" value="1" />}
        <input type="hidden" name="turno" value={turno} />
        <div>
          <label className="mb-1 block text-xs text-zinc-500">De</label>
          <input type="date" name="de" defaultValue={de} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </div>
        <button className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white">Aplicar</button>
        <div className="ml-1 flex flex-wrap gap-1">
          {atalhos.map((a) => (
            <Link key={a.r} href={link({ de: a.de, ate: a.ate })} className={`rounded-lg px-2.5 py-1.5 text-xs ${de === a.de && ate === a.ate ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>{a.r}</Link>
          ))}
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-zinc-500">Turno:</span>
        {[["todos", "Todos"], ["dia", "☀️ Dia"], ["noite", "🌙 Noite"]].map(([v, r]) => (
          <Link key={v} href={link({ turno: v })} className={`rounded-lg px-2.5 py-1 ${turno === v ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>{r}</Link>
        ))}
        <span className="ml-3 text-zinc-500">Agrupar por:</span>
        {([["produto", "Produto"], ["categoria", "Categoria"], ["turno", "Turno"], ["forma", "Forma de pagamento"], ["garcom", "Garçom"], ["origem", "Origem"]] as [Agrupar, string][]).map(([v, r]) => (
          <Link key={v} href={link({ agrupar: v })} className={`rounded-lg px-2.5 py-1 ${agrupar === v ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>{r}</Link>
        ))}
        <Link href={link({ pagos: soPagos ? undefined : "1" })} className={`ml-3 rounded-lg px-2.5 py-1 ${soPagos ? "bg-emerald-600 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
          {soPagos ? "✓ só pagos" : "só pagos"}
        </Link>
      </div>

      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"><p className="text-xs text-zinc-500">Valor total</p><p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{brl(totalValor)}</p></div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"><p className="text-xs text-zinc-500">Itens vendidos</p><p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{totalQtd.toLocaleString("pt-BR")}</p></div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"><p className="text-xs text-zinc-500">Buffet</p><p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{brl(buffetValor)}</p><p className="text-xs text-zinc-500">{buffetPratos} pratos · {buffetKg.toFixed(1).replace(".", ",")} kg</p></div>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"><p className="text-xs text-zinc-500">Cancelados</p><p className="text-2xl font-bold text-red-600">{brl(cancelValor)}</p><p className="text-xs text-zinc-500">{cancelQtd} itens · {excluidas.length} comandas excluídas</p></div>
      </div>

      <VendidosClient linhas={linhas} total={totalValor} agrupar={agrupar} periodo={`${de} a ${ate}`} />

      {(cancelados.length > 0 || excluidas.length > 0) && (
        <details className="mt-6 rounded-2xl border border-red-200 dark:border-red-900">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-400">
            ✗ Cancelados no período: {brl(cancelValor)} ({cancelados.length} {cancelados.length === 1 ? "item" : "itens"}, {excluidas.length} {excluidas.length === 1 ? "comanda excluída" : "comandas excluídas"}) — clique pra ver
          </summary>
          <div className="space-y-3 px-4 pb-4">
            {excluidas.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="py-1">Comanda excluída</th><th className="py-1">Mesa</th><th className="py-1">Motivo</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Quando</th></tr></thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {excluidas.map((e, i) => (
                    <tr key={i}><td className="py-1">nº {e.comanda_numero ?? "—"}</td><td className="py-1 text-zinc-500">{e.mesa ?? "—"}</td><td className="py-1 text-zinc-600 dark:text-zinc-300">{e.motivo ?? "—"}</td><td className="py-1 text-right text-red-600">{brl(Number(e.valor))}</td><td className="py-1 text-right text-zinc-500">{horaBR(e.excluido_em)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {cancelados.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="py-1">Item cancelado</th><th className="py-1 text-right">Qtd</th><th className="py-1">Motivo</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Quando</th></tr></thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {cancelados.map((c, i) => (
                    <tr key={i}><td className="py-1">{(c.descricao ?? "Item").split("
")[0]}</td><td className="py-1 text-right">{Number(c.qtd)}</td><td className="py-1 text-zinc-600 dark:text-zinc-300">{c.motivo ?? "—"}</td><td className="py-1 text-right text-red-600">{brl(Number(c.valor))}</td><td className="py-1 text-right text-zinc-500">{horaBR(c.cancelado_em)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
