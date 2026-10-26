import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { buscarPorLotes, buscarTodas } from "@/lib/supabase/todas";
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
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

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

  // O banco devolve no máximo 1000 linhas por consulta: tudo que pode passar
  // disso num período longo vem em páginas (ou em lotes, quando é por id).
  // Antes as comandas de buffet cortavam em 1000 — um mês tem 2,4 mil.
  const itens = await buscarTodas<ItemRow>((i, f) =>
    supabase
      .from("pdv_comanda_itens")
      .select("id, comanda_id, item_id, descricao, qtd, preco_unit, criado_em, pago, criado_por, criado_colab_id")
      .gte("criado_em", iniIso)
      .lte("criado_em", fimIso)
      .order("criado_em")
      .order("id")
      .range(i, f),
  );

  const comIds = [...new Set(itens.map((i) => i.comanda_id))];
  const [comsItens, comsBuffet, { data: cancel }, { data: pdvItens }, { data: delivs }, { data: excl }] = await Promise.all([
    buscarPorLotes<ComandaRow>(comIds, (lote) =>
      supabase.from("pdv_comandas").select("id, numero, mesa, status, forma_pagamento, valor_buffet, peso, aberta_em, livre").in("id", lote),
    ),
    buscarTodas<ComandaRow & { buffet_pago: boolean | null }>((i, f) =>
      supabase.from("pdv_comandas").select("id, numero, mesa, status, forma_pagamento, valor_buffet, peso, aberta_em, livre, buffet_pago").gt("valor_buffet", 0).gte("aberta_em", iniIso).lte("aberta_em", fimIso).order("aberta_em").order("id").range(i, f),
    ),
    supabase.from("pdv_itens_cancelados").select("descricao, qtd, valor, motivo, cancelado_em").gte("cancelado_em", iniIso).lte("cancelado_em", fimIso),
    supabase.from("pdv_itens").select("id, nome, categoria, por_kg"),
    supabase.from("delivery_pedidos").select("comanda_id").gte("criado_em", iniIso).lte("criado_em", fimIso),
    supabase.from("pdv_comandas_excluidas").select("comanda_numero, mesa, valor, motivo, excluido_em").gte("excluido_em", iniIso).lte("excluido_em", fimIso).order("excluido_em", { ascending: false }),
  ]);
  const comMap = new Map(((comsItens as ComandaRow[]) ?? []).map((c) => [c.id, c]));
  const catDe = new Map(((pdvItens as { id: string; nome: string; categoria: string | null }[]) ?? []).map((p) => [p.id, p.categoria || "Outros"]));
  const nomeItemDe = new Map(((pdvItens as { id: string; nome: string }[]) ?? []).map((p) => [p.id, p.nome]));
  const porKgIds = new Set(((pdvItens as { id: string; por_kg?: boolean }[]) ?? []).filter((p) => p.por_kg).map((p) => p.id));
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
  // Buffet separado (Rafael, 26/10): a kg, livre que pesou o prato e livre direto (sem pesar).
  let kgPratos = 0, kgPeso = 0;
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
    if (it.item_id && porKgIds.has(it.item_id)) { kgPratos++; kgPeso += Number(it.qtd) || 0; }
    const nome = (it.item_id && nomeItemDe.get(it.item_id)) || (it.descricao || "Item").split("\n")[0].trim();
    crus.push({
      produto: it.item_id ? nome : nome.slice(0, 80),
      categoria: it.item_id ? catDe.get(it.item_id) ?? "Outros" : "Pizzas",
      turno: t === "dia" ? "Dia" : "Noite",
      forma: c?.forma_pagamento || (it.pago ? "(não informada)" : "(em aberto)"),
      garcom: (it.criado_por && nomeDe.get(it.criado_por)) || (it.criado_colab_id && nomeDe.get(it.criado_colab_id)) || "—",
      origem: origemDe(c),
      qtd: Number(it.qtd),
      valor,
      pago: !!it.pago,
    });
  }
  // Buffet (balança): uma "venda" por comanda com buffet.
  let buffetPratos = 0, buffetValor = 0;
  let livrePesou = 0, livrePeso = 0, livreDireto = 0;
  const livrePorDia = new Map<string, { n: number; kg: number; diretos: number }>();
  for (const c of ((comsBuffet as (ComandaRow & { buffet_pago: boolean | null })[]) ?? [])) {
    if (c.status === "excluida") continue;
    const h = horaSP(c.aberta_em);
    const t = h >= VIRADA_NOITE ? "noite" : "dia";
    if (turno !== "todos" && t !== turno) continue;
    if (soPagos && !c.buffet_pago) continue;
    const v = Number(c.valor_buffet) || 0;
    buffetPratos++; buffetValor += v;
    const peso = Number(c.peso) || 0;
    if (!c.livre) { kgPratos++; kgPeso += peso; }
    else if (peso > 0) {
      livrePesou++; livrePeso += peso;
      const d = diaSP(c.aberta_em);
      const x = livrePorDia.get(d) ?? { n: 0, kg: 0, diretos: 0 };
      x.n++; x.kg += peso; livrePorDia.set(d, x);
    } else {
      livreDireto++;
      const d = diaSP(c.aberta_em);
      const x = livrePorDia.get(d) ?? { n: 0, kg: 0, diretos: 0 };
      x.diretos++; livrePorDia.set(d, x);
    }
    crus.push({
      produto: c.livre ? "Buffet livre" : "Buffet a kg",
      categoria: "Buffet",
      turno: t === "dia" ? "Dia" : "Noite",
      forma: c.forma_pagamento || (c.buffet_pago ? "(não informada)" : "(em aberto)"),
      garcom: "Balança",
      origem: origemDe(c),
      qtd: 1,
      valor: v,
      pago: !!c.buffet_pago,
    });
  }

  // Livre direto não tem peso: estima pela média do livre que pesou no mesmo dia
  // (dia sem ninguém pesando o livre usa a média do período).
  const mediaLivre = livrePesou > 0 ? livrePeso / livrePesou : 0;
  let livreEstimado = 0;
  for (const x of livrePorDia.values()) livreEstimado += x.diretos * (x.n > 0 ? x.kg / x.n : mediaLivre);
  const totalKgEstimado = kgPeso + livrePeso + livreEstimado;
  const kgTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const gTxt = (kg: number) => `${Math.round(kg * 1000)} g`;

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
    <div className="w-full p-6">
      <Link href="/financeiro" className="text-sm font-semibold text-texto-marca hover:underline">← Financeiro</Link>
      <h1 className="mt-2 flex items-center gap-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto"><Icone nome="compras" tamanho={20} /> Produtos vendidos</h1>
      <p className="mb-4 mt-1 text-sm text-texto-suave">Tudo que saiu no salão, balcão, balança e delivery, pelo que foi lançado nas comandas. Noite começa às {VIRADA_NOITE}h.</p>

      {/* Período e filtros (links: sem JS) */}
      <form className="mb-3 flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="agrupar" value={agrupar} />
        {soPagos && <input type="hidden" name="pagos" value="1" />}
        <input type="hidden" name="turno" value={turno} />
        <div>
          <label className="mb-1 block text-xs text-texto-suave">De</label>
          <input type="date" name="de" defaultValue={de} className="rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1.5 text-sm" />
        </div>
        <button className="rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-medium text-marca-sobre-primaria">Aplicar</button>
        <div className="ml-1 flex flex-wrap gap-1">
          {atalhos.map((a) => (
            <Link key={a.r} href={link({ de: a.de, ate: a.ate })} className={`rounded-controle px-2.5 py-1.5 text-xs ${de === a.de && ate === a.ate ? "bg-orange-500 text-marca-sobre-primaria" : "border border-borda-forte text-texto-suave  "}`}>{a.r}</Link>
          ))}
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-texto-suave">Turno:</span>
        {[["todos", "Todos"], ["dia", "Dia"], ["noite", "Noite"]].map(([v, r]) => (
          <Link key={v} href={link({ turno: v })} className={`rounded-controle px-2.5 py-1 ${turno === v ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-borda-forte text-texto-suave  "}`}>{r}</Link>
        ))}
        <span className="ml-3 text-texto-suave">Agrupar por:</span>
        {([["produto", "Produto"], ["categoria", "Categoria"], ["turno", "Turno"], ["forma", "Forma de pagamento"], ["garcom", "Garçom"], ["origem", "Origem"]] as [Agrupar, string][]).map(([v, r]) => (
          <Link key={v} href={link({ agrupar: v })} className={`rounded-controle px-2.5 py-1 ${agrupar === v ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-borda-forte text-texto-suave  "}`}>{r}</Link>
        ))}
        <Link href={link({ pagos: soPagos ? undefined : "1" })} className={`ml-3 rounded-controle px-2.5 py-1 ${soPagos ? "bg-texto text-fundo" : "border border-borda-forte text-texto-suave  "}`}>
          {soPagos ? "✓ só pagos" : "só pagos"}
        </Link>
      </div>

      {/* Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="cartao p-4"><p className="text-xs text-texto-suave">Valor total</p><p className="text-2xl font-bold text-texto">{brl(totalValor)}</p></div>
        <div className="cartao p-4"><p className="text-xs text-texto-suave">Itens vendidos</p><p className="text-2xl font-bold text-texto">{totalQtd.toLocaleString("pt-BR")}</p></div>
        <div className="cartao p-4"><p className="text-xs text-texto-suave">Buffet</p><p className="text-2xl font-bold text-texto">{brl(buffetValor)}</p><p className="text-xs text-texto-suave">{buffetPratos} pratos · ~{kgTxt(totalKgEstimado)} kg de comida</p></div>
        <div className="cartao p-4"><p className="text-xs text-texto-suave">Cancelados</p><p className="text-2xl font-bold text-red-600">{brl(cancelValor)}</p><p className="text-xs text-texto-suave">{cancelQtd} itens · {excluidas.length} comandas excluídas</p></div>
      </div>

      {(kgPratos > 0 || livrePesou > 0 || livreDireto > 0) && (
        <section className="cartao mb-4 overflow-x-auto p-4">
          <p className="rotulo mb-2">Comida do buffet no período</p>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="rotulo text-left"><tr><th className="py-1.5">Tipo</th><th className="text-right">Pratos</th><th className="text-right">Kg</th><th className="text-right">Média por prato</th></tr></thead>
            <tbody className="divide-y divide-borda">
              <tr><td className="py-1.5 font-semibold text-texto">Buffet a kg</td><td className="text-right font-numero">{kgPratos}</td><td className="text-right font-numero">{kgTxt(kgPeso)}</td><td className="text-right font-numero">{kgPratos ? gTxt(kgPeso / kgPratos) : "—"}</td></tr>
              <tr><td className="py-1.5 font-semibold text-texto">Livre que pesou o prato</td><td className="text-right font-numero">{livrePesou}</td><td className="text-right font-numero">{kgTxt(livrePeso)}</td><td className="text-right font-numero">{livrePesou ? gTxt(mediaLivre) : "—"}</td></tr>
              <tr><td className="py-1.5 font-semibold text-texto">Livre direto (sem pesar)<span className="block text-xs font-normal text-texto-suave">peso estimado pela média do livre que pesou no mesmo dia</span></td><td className="text-right font-numero">{livreDireto}</td><td className="text-right font-numero">~{kgTxt(livreEstimado)}</td><td className="text-right font-numero">{livreDireto && livreEstimado ? `~${gTxt(livreEstimado / livreDireto)}` : "—"}</td></tr>
            </tbody>
            <tfoot><tr className="border-t-2 border-borda-forte font-semibold"><td className="py-1.5">Total</td><td className="text-right font-numero">{kgPratos + livrePesou + livreDireto}</td><td className="text-right font-numero">~{kgTxt(totalKgEstimado)}</td><td></td></tr></tfoot>
          </table>
        </section>
      )}

      <VendidosClient linhas={linhas} total={totalValor} agrupar={agrupar} periodo={`${de} a ${ate}`} />

      {(cancelados.length > 0 || excluidas.length > 0) && (
        <details className="mt-6 rounded-cartao border border-red-200 dark:border-red-900">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-400">
            ✗ Cancelados no período: {brl(cancelValor)} ({cancelados.length} {cancelados.length === 1 ? "item" : "itens"}, {excluidas.length} {excluidas.length === 1 ? "comanda excluída" : "comandas excluídas"}) — clique pra ver
          </summary>
          <div className="space-y-3 px-4 pb-4">
            {excluidas.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-sm">
                  <thead className="rotulo text-left"><tr><th className="py-1">Comanda excluída</th><th className="py-1">Mesa</th><th className="py-1">Motivo</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Quando</th></tr></thead>
                  <tbody className="divide-y divide-borda">
                    {excluidas.map((e, i) => (
                      <tr key={i}><td className="py-1">nº {e.comanda_numero ?? "—"}</td><td className="py-1 text-texto-suave">{e.mesa ?? "—"}</td><td className="py-1 text-texto-suave">{e.motivo ?? "—"}</td><td className="py-1 text-right text-red-600">{brl(Number(e.valor))}</td><td className="py-1 text-right text-texto-suave">{horaBR(e.excluido_em)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cancelados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-sm">
                  <thead className="rotulo text-left"><tr><th className="py-1">Item cancelado</th><th className="py-1 text-right">Qtd</th><th className="py-1">Motivo</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Quando</th></tr></thead>
                  <tbody className="divide-y divide-borda">
                    {cancelados.map((c, i) => (
                      <tr key={i}><td className="py-1">{(c.descricao ?? "Item").split("\n")[0]}</td><td className="py-1 text-right">{Number(c.qtd)}</td><td className="py-1 text-texto-suave">{c.motivo ?? "—"}</td><td className="py-1 text-right text-red-600">{brl(Number(c.valor))}</td><td className="py-1 text-right text-texto-suave">{horaBR(c.cancelado_em)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
