import { createClient } from "@/lib/supabase/server";
import { GarcomPedido, type ItemMenu } from "./garcom-pedido";

export default async function GarcomMesaPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesa: string }>;
  searchParams: Promise<{ comanda?: string }>;
}) {
  const { mesa: mesaRaw } = await params;
  const { comanda: comandaInicial } = await searchParams;
  const mesa = decodeURIComponent(mesaRaw);
  const supabase = await createClient();

  const [
    { data: itensRows }, { data: catRows }, { data: comRows }, { data: cfgRows },
    { data: gruposItem }, { data: tamanhos }, { data: sabores }, { data: saborPrecos },
    { data: bordas }, { data: bordaPrecos }, { data: grupos }, { data: opcoes },
  ] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco, promo_preco").eq("ativo", true).eq("canal_garcom", true).eq("disponivel", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem, disponivel, canal_garcom").eq("disponivel", true).order("ordem"),
    supabase.from("pdv_comandas").select("id, numero, valor_buffet").eq("mesa", mesa).eq("status", "aberta").order("numero"),
    supabase.from("pdv_config").select("chave, valor").eq("chave", "qtd_mesas"),
    supabase.from("pdv_item_grupos").select("item_id"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, ordem").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome, foto_url, descricao").eq("ativo", true).order("ordem"),
    supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
    supabase.from("pdv_pizza_bordas").select("id, nome").eq("ativo", true).order("ordem"),
    supabase.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
    supabase.from("pdv_item_grupos").select("id, item_id, nome, min, max, permite_repetir, ordem").order("ordem"),
    supabase.from("pdv_item_opcoes").select("id, grupo_id, nome, preco").eq("ativo", true).order("ordem"),
  ]);
  const comRaw = (comRows as { id: string; numero: number; valor_buffet: number | null }[]) ?? [];

  // Itens lançados de cada comanda (histórico) + total (itens + buffet).
  const comandaIds = comRaw.map((c) => c.id);
  const itensPorComanda = new Map<string, { descricao: string; qtd: number; preco: number }[]>();
  if (comandaIds.length > 0) {
    const { data: itRows } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, descricao, qtd, preco_unit, criado_em")
      .in("comanda_id", comandaIds)
      .order("criado_em", { ascending: true });
    for (const it of (itRows as { comanda_id: string; descricao: string; qtd: number; preco_unit: number }[]) ?? []) {
      const lista = itensPorComanda.get(it.comanda_id) ?? [];
      lista.push({ descricao: it.descricao, qtd: Number(it.qtd), preco: Number(it.preco_unit) });
      itensPorComanda.set(it.comanda_id, lista);
    }
  }
  const comandas = comRaw.map((c) => {
    const itens = itensPorComanda.get(c.id) ?? [];
    const totalItens = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    return {
      id: c.id,
      numero: c.numero,
      buffet: Number(c.valor_buffet ?? 0),
      itens,
      total: totalItens + Number(c.valor_buffet ?? 0),
    };
  });

  // Lista de mesas para o "Trocar mesa" (todas, menos a atual).
  const qtdMesas = Number((cfgRows as { valor: string }[] | null)?.[0]?.valor || 40);
  const mesas = ["Balcão", ...Array.from({ length: qtdMesas }, (_, i) => `Mesa ${i + 1}`), "Balança"].filter(
    (m) => m !== mesa,
  );

  // Categoria desligada pro canal Garçom esconde os produtos dela.
  const catBloqueada = new Set(
    (((catRows as { nome: string; canal_garcom?: boolean }[]) ?? [])).filter((c) => c.canal_garcom === false).map((c) => c.nome),
  );
  const itens: ItemMenu[] = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number; promo_preco?: number | null }[]) ?? [])
    .filter((i) => !catBloqueada.has(i.categoria || "Outros"))
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      categoria: i.categoria || "Outros",
      preco: Number(i.promo_preco ?? 0) > 0 ? Number(i.promo_preco) : Number(i.preco) || 0,
    }));

  // Ordem das categorias: as do cardápio (com itens) + as que sobraram.
  const comItens = new Set(itens.map((i) => i.categoria));
  const ordenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome).filter((c) => comItens.has(c));
  const categorias = [...ordenadas, ...[...comItens].filter((c) => !ordenadas.includes(c)).sort()];

  return (
    <GarcomPedido
      mesa={mesa}
      itens={itens}
      categorias={categorias}
      comandas={comandas}
      mesas={mesas}
      comandaInicial={comandas.some((c) => c.id === comandaInicial) ? comandaInicial : undefined}
      comComplemento={[...new Set(((gruposItem as { item_id: string }[]) ?? []).map((g) => g.item_id))]}
      pizza={{
        tamanhos: ((tamanhos as { id: string; nome: string; max_sabores: number }[]) ?? []),
        sabores: ((sabores as { id: string; nome: string; foto_url: string | null; descricao: string | null }[]) ?? []),
        saborPrecos: ((saborPrecos as { sabor_id: string; tamanho_id: string; preco: number }[]) ?? []).map((p) => ({ ...p, preco: Number(p.preco) })),
        bordas: ((bordas as { id: string; nome: string }[]) ?? []),
        bordaPrecos: ((bordaPrecos as { borda_id: string; tamanho_id: string; preco: number }[]) ?? []).map((p) => ({ ...p, preco: Number(p.preco) })),
      }}
      complementos={{
        grupos: ((grupos as { id: string; item_id: string; nome: string; min: number; max: number; permite_repetir: boolean }[]) ?? []),
        opcoes: ((opcoes as { id: string; grupo_id: string; nome: string; preco: number }[]) ?? []).map((o) => ({ ...o, preco: Number(o.preco) })),
      }}
    />
  );
}
