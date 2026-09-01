import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { disponivelAgora, type Horarios } from "@/lib/disponibilidade";
import { PedirClient } from "./pedir-client";

export const metadata: Metadata = {
  title: "Peça online · Brasa Pizzaria e Restaurante",
  description: "Monte seu pedido e receba em casa ou retire no balcão.",
};
export const dynamic = "force-dynamic";

export default async function PedirPage() {
  const admin = createAdminClient();

  const desde = new Date(new Date().getTime() - 60 * 86400000).toISOString();
  const [
    { data: itensRows }, { data: catRows }, { data: gruposItem },
    { data: tamanhos }, { data: sabores }, { data: saborPrecos }, { data: bordas }, { data: bordaPrecos },
    { data: grupos }, { data: opcoes }, { data: cfg }, { data: vendidos },
  ] = await Promise.all([
    admin.from("pdv_itens").select("id, nome, categoria, preco, promo_preco, foto_url, descricao, horarios").eq("ativo", true).eq("delivery", true).eq("disponivel", true).order("nome"),
    admin.from("pdv_categorias").select("nome, ordem, horarios, canal_app").eq("disponivel", true).order("ordem"),
    admin.from("pdv_item_grupos").select("item_id"),
    admin.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, fatias, ordem").order("ordem"),
    admin.from("pdv_pizza_sabores").select("id, nome, foto_url, descricao").eq("ativo", true).order("ordem"),
    admin.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
    admin.from("pdv_pizza_bordas").select("id, nome").eq("ativo", true).order("ordem"),
    admin.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
    admin.from("pdv_item_grupos").select("id, item_id, nome, min, max, permite_repetir, ordem").order("ordem"),
    admin.from("pdv_item_opcoes").select("id, grupo_id, nome, preco").eq("ativo", true).order("ordem"),
    admin.from("delivery_config").select("aberto, tempo_preparo_min, aviso").eq("id", 1).maybeSingle(),
    admin.from("pdv_comanda_itens").select("item_id").not("item_id", "is", null).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(1000),
  ]);

  // Horários de disponibilidade (categoria e item) — só o que está no horário
  // aparece pro cliente agora.
  const agora = new Date().getTime();
  const cats = ((catRows as { nome: string; horarios: Horarios; canal_app: boolean }[]) ?? []);
  const catHorarios = new Map(cats.map((c) => [c.nome, c.horarios]));
  // Categoria cadastrada mas desligada pro App esconde os produtos dela.
  const catBloqueada = new Set(cats.filter((c) => c.canal_app === false).map((c) => c.nome));
  const itens = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null; foto_url: string | null; descricao: string | null; horarios: Horarios }[]) ?? [])
    .filter((i) => !catBloqueada.has(i.categoria || "Outros"))
    .filter((i) => disponivelAgora(i.horarios, agora))
    .filter((i) => disponivelAgora(catHorarios.get(i.categoria || "Outros") ?? null, agora))
    .map((i) => {
      const promo = Number(i.promo_preco ?? 0);
      return {
        id: i.id, nome: i.nome, categoria: i.categoria || "Outros",
        preco: promo > 0 ? promo : Number(i.preco) || 0,
        preco_antigo: promo > 0 ? Number(i.preco) || 0 : null,
        foto_url: i.foto_url, descricao: i.descricao,
      };
    });

  // "Os mais vendidos": itens do cardápio mais lançados nos últimos 60 dias.
  const cont = new Map<string, number>();
  for (const v of (vendidos as { item_id: string }[]) ?? []) cont.set(v.item_id, (cont.get(v.item_id) ?? 0) + 1);
  const maisVendidos = itens
    .filter((i) => cont.has(i.id))
    .sort((a, b) => (cont.get(b.id) ?? 0) - (cont.get(a.id) ?? 0))
    .slice(0, 6)
    .map((i) => i.id);
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
        tamanhos: ((tamanhos as { id: string; nome: string; max_sabores: number; fatias: number | null }[]) ?? []),
        sabores: ((sabores as { id: string; nome: string; foto_url: string | null; descricao: string | null }[]) ?? []),
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
      aviso={((cfg as { aviso?: string | null } | null)?.aviso || "").trim() || null}
      maisVendidos={maisVendidos}
    />
  );
}
