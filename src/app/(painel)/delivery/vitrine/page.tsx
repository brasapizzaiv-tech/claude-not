import { createClient } from "@/lib/supabase/server";
import { VitrineClient, type DadosVitrine } from "./vitrine-client";

export const metadata = { title: "Vitrine do app · Delivery" };
export const dynamic = "force-dynamic";

// VITRINE DO APP (migration 0236, protótipo aprovado pelo Rafael em 15/10/2026):
// destaques do topo, sugestões "Quer adicionar?" e gatilhos de cupom do /pedir.
// Os números do topo são dos últimos 7 dias.
export default async function VitrinePage() {
  const supabase = await createClient();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const seteDias = new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - 6 * 86400000).toLocaleDateString("en-CA");
  const desde = `${seteDias}T03:00:00.000Z`;

  const [
    { data: destaques }, { data: sugestoes }, { data: gatilhos }, { data: cupons }, { data: itens }, { data: cats },
    { count: abriram }, { count: carrinho }, { data: pedidos }, { data: tamanhos }, { data: sabores },
  ] = await Promise.all([
    supabase.from("vitrine_destaques").select("id, titulo, subtitulo, item_id, pizza_tamanho_id, pizza_sabor_id, preco_de, preco_por, foto_url, selo, inicio, fim, ativo").order("ordem").order("criado_em"),
    supabase.from("vitrine_sugestoes").select("id, momento, categoria, item_id").order("ordem").order("criado_em"),
    supabase.from("vitrine_gatilhos").select("chave, ativo, cupom, minutos, validade_min"),
    supabase.from("cupons").select("codigo, tipo, valor, minimo, ativo").order("codigo"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco, promo_preco").eq("ativo", true).eq("delivery", true).order("nome").limit(1000),
    supabase.from("pdv_categorias").select("nome").order("ordem"),
    supabase.from("vitrine_eventos").select("id", { count: "exact", head: true }).eq("tipo", "abriu").gte("dia", seteDias),
    supabase.from("vitrine_eventos").select("id", { count: "exact", head: true }).eq("tipo", "carrinho").gte("dia", seteDias),
    supabase.from("delivery_pedidos").select("comanda_id, taxa_entrega, desconto, desconto_motivo").eq("origem", "app").neq("status", "cancelado").gte("criado_em", desde).limit(1000),
    supabase.from("pdv_pizza_tamanhos").select("id, nome").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // Ticket médio do app e desconto dado em cupom (7 dias).
  type Ped = { comanda_id: string | null; taxa_entrega: number; desconto: number; desconto_motivo: string | null };
  const peds = (pedidos as Ped[]) ?? [];
  const ids = peds.map((p) => p.comanda_id).filter(Boolean) as string[];
  const somaComanda = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: its } = await supabase.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", ids.slice(i, i + 200)).limit(5000);
    for (const it of its ?? []) somaComanda.set(it.comanda_id as string, (somaComanda.get(it.comanda_id as string) ?? 0) + Number(it.qtd) * Number(it.preco_unit || 0));
  }
  const totais = peds.map((p) => (somaComanda.get(p.comanda_id ?? "") ?? 0) + Number(p.taxa_entrega || 0) - Number(p.desconto || 0));
  const ticket = totais.length ? totais.reduce((s, n) => s + n, 0) / totais.length : null;
  const comCupom = peds.filter((p) => /cupom/i.test(p.desconto_motivo ?? ""));
  const descontoCupom = comCupom.reduce((s, p) => s + Number(p.desconto || 0), 0);

  const listaItens = ((itens as { id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null }[]) ?? [])
    .map((i) => ({ id: i.id, nome: i.nome, categoria: i.categoria || "Outros", preco: Number(i.promo_preco) > 0 ? Number(i.promo_preco) : Number(i.preco) || 0 }));
  const categorias = [
    ...(((tamanhos as unknown[]) ?? []).length ? [{ valor: "__pizzas__", rotulo: "Quando pede pizza" }] : []),
    ...[...new Set([...(((cats as { nome: string }[]) ?? []).map((c) => c.nome)), ...listaItens.map((i) => i.categoria)])]
      .filter((c) => listaItens.some((i) => i.categoria === c))
      .map((c) => ({ valor: c, rotulo: `Quando pede ${c.toLowerCase()}` })),
  ];

  const dados: DadosVitrine = {
    numeros: {
      abriram: abriram ?? 0,
      carrinho: carrinho ?? 0,
      ticket,
      pedidosApp: peds.length,
      descontoCupom,
      pedidosComCupom: comCupom.length,
    },
    destaques: ((destaques as DadosVitrine["destaques"]) ?? []).map((d) => ({ ...d, preco_de: d.preco_de != null ? Number(d.preco_de) : null, preco_por: d.preco_por != null ? Number(d.preco_por) : null })),
    sugestoes: (sugestoes as DadosVitrine["sugestoes"]) ?? [],
    gatilhos: (gatilhos as DadosVitrine["gatilhos"]) ?? [],
    cupons: ((cupons as DadosVitrine["cupons"]) ?? []).map((c) => ({ ...c, valor: Number(c.valor), minimo: c.minimo != null ? Number(c.minimo) : null })),
    itens: listaItens,
    pizzaTamanhos: (tamanhos as { id: string; nome: string }[]) ?? [],
    pizzaSabores: (sabores as { id: string; nome: string }[]) ?? [],
    categorias,
  };
  return <VitrineClient d={dados} />;
}
