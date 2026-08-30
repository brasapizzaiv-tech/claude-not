import { createClient } from "@/lib/supabase/server";
import { NovoPedido } from "./novo-client";

export const metadata = { title: "Novo pedido · Delivery" };

export default async function NovoPedidoPage() {
  const supabase = await createClient();

  const [
    { data: itensRows }, { data: catRows }, { data: gruposItem },
    { data: tamanhos }, { data: sabores }, { data: saborPrecos }, { data: bordas }, { data: bordaPrecos },
    { data: grupos }, { data: opcoes }, { data: cfg },
  ] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).eq("delivery", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem").eq("disponivel", true).order("ordem"),
    supabase.from("pdv_item_grupos").select("item_id"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, ordem").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome").eq("ativo", true).order("ordem"),
    supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
    supabase.from("pdv_pizza_bordas").select("id, nome").eq("ativo", true).order("ordem"),
    supabase.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
    supabase.from("pdv_item_grupos").select("id, item_id, nome, min, max, permite_repetir, ordem").order("ordem"),
    supabase.from("pdv_item_opcoes").select("id, grupo_id, nome, preco").eq("ativo", true).order("ordem"),
    supabase.from("delivery_config").select("taxa_base, preco_km, tempo_preparo_min").eq("id", 1).maybeSingle(),
  ]);

  const itens = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []).map((i) => ({
    id: i.id, nome: i.nome, categoria: i.categoria || "Outros", preco: Number(i.preco) || 0,
  }));
  const comItens = new Set(itens.map((i) => i.categoria));
  const ordenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome).filter((c) => comItens.has(c));
  const categorias = [...ordenadas, ...[...comItens].filter((c) => !ordenadas.includes(c)).sort()];
  const comComplemento = new Set(((gruposItem as { item_id: string }[]) ?? []).map((g) => g.item_id));

  return (
    <NovoPedido
      itens={itens}
      categorias={categorias}
      comComplemento={[...comComplemento]}
      pizza={{
        tamanhos: ((tamanhos as { id: string; nome: string; max_sabores: number }[]) ?? []),
        sabores: ((sabores as { id: string; nome: string }[]) ?? []),
        saborPrecos: ((saborPrecos as { sabor_id: string; tamanho_id: string; preco: number }[]) ?? []).map((p) => ({ ...p, preco: Number(p.preco) })),
        bordas: ((bordas as { id: string; nome: string }[]) ?? []),
        bordaPrecos: ((bordaPrecos as { borda_id: string; tamanho_id: string; preco: number }[]) ?? []).map((p) => ({ ...p, preco: Number(p.preco) })),
      }}
      complementos={{
        grupos: ((grupos as { id: string; item_id: string; nome: string; min: number; max: number; permite_repetir: boolean }[]) ?? []),
        opcoes: ((opcoes as { id: string; grupo_id: string; nome: string; preco: number }[]) ?? []).map((o) => ({ ...o, preco: Number(o.preco) })),
      }}
      cfg={{
        taxaBase: Number((cfg as { taxa_base?: number } | null)?.taxa_base ?? 0),
        precoKm: Number((cfg as { preco_km?: number } | null)?.preco_km ?? 0),
        tempoPreparo: Number((cfg as { tempo_preparo_min?: number } | null)?.tempo_preparo_min ?? 40),
      }}
    />
  );
}
