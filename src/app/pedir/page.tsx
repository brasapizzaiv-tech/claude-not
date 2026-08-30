import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { PedirClient } from "./pedir-client";

export const metadata: Metadata = {
  title: "Peça online · Brasa Pizzaria e Restaurante",
  description: "Monte seu pedido e receba em casa ou retire no balcão.",
};
export const dynamic = "force-dynamic";

export default async function PedirPage() {
  const admin = createAdminClient();

  const [
    { data: itensRows }, { data: catRows }, { data: gruposItem },
    { data: tamanhos }, { data: sabores }, { data: saborPrecos }, { data: bordas }, { data: bordaPrecos },
    { data: grupos }, { data: opcoes }, { data: cfg },
  ] = await Promise.all([
    admin.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).eq("delivery", true).order("nome"),
    admin.from("pdv_categorias").select("nome, ordem").eq("disponivel", true).order("ordem"),
    admin.from("pdv_item_grupos").select("item_id"),
    admin.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, ordem").order("ordem"),
    admin.from("pdv_pizza_sabores").select("id, nome").eq("ativo", true).order("ordem"),
    admin.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
    admin.from("pdv_pizza_bordas").select("id, nome").eq("ativo", true).order("ordem"),
    admin.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
    admin.from("pdv_item_grupos").select("id, item_id, nome, min, max, permite_repetir, ordem").order("ordem"),
    admin.from("pdv_item_opcoes").select("id, grupo_id, nome, preco").eq("ativo", true).order("ordem"),
    admin.from("delivery_config").select("aberto, tempo_preparo_min").eq("id", 1).maybeSingle(),
  ]);

  const itens = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []).map((i) => ({
    id: i.id, nome: i.nome, categoria: i.categoria || "Outros", preco: Number(i.preco) || 0,
  }));
  const comItens = new Set(itens.map((i) => i.categoria));
  const ordenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome).filter((c) => comItens.has(c));
  const categorias = [...ordenadas, ...[...comItens].filter((c) => !ordenadas.includes(c)).sort()];
  const comComplemento = new Set(((gruposItem as { item_id: string }[]) ?? []).map((g) => g.item_id));

  return (
    <PedirClient
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
      aberto={(cfg as { aberto?: boolean } | null)?.aberto !== false}
      tempoPreparo={Number((cfg as { tempo_preparo_min?: number } | null)?.tempo_preparo_min ?? 40)}
    />
  );
}
