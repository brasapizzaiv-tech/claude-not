import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import type { AreaEntrega, PromoTele } from "@/lib/delivery-areas";
import { AreasClient } from "./areas-client";

export const metadata = { title: "Áreas de entrega · Delivery" };
export const dynamic = "force-dynamic";

// Áreas desenhadas no mapa (valor por área) + promoções da taxa de entrega.
// Com pelo menos uma área ativa, a taxa passa a ser por área; sem nenhuma,
// continua o cálculo por distância da Config.
export default async function AreasPage() {
  const supabase = await createClient();
  const [{ data: areas }, { data: promos }, { data: cfg }] = await Promise.all([
    supabase.from("delivery_areas").select("id, nome, cor, valor, taxa_motoboy, tempo_min, poligono, ativo, ordem").order("ordem").order("criado_em"),
    supabase.from("delivery_promocoes_tele").select("id, nome, tipo, valor, area_ids, pedido_minimo, dias, hora_ini, hora_fim, validade, ativo").order("criado_em"),
    supabase.from("delivery_config").select("origem_lat, origem_lng").maybeSingle(),
  ]);
  const c = cfg as { origem_lat?: number | null; origem_lng?: number | null } | null;
  const origem = c?.origem_lat != null && c?.origem_lng != null ? { lat: Number(c.origem_lat), lng: Number(c.origem_lng) } : null;

  return (
    <div className="p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 flex items-center gap-2 text-xl font-bold"><Icone nome="mapa" tamanho={19} /> Áreas de entrega e promoções da tele</h1>
      <p className="mb-4 text-sm text-texto-suave">
        Desenhe cada área no mapa e defina o valor da entrega. O cliente cai na área onde o endereço dele está; fora de todas = não entregamos.
        Sem nenhuma área ativa, vale o cálculo por km da Config.
      </p>
      <AreasClient
        areasIniciais={((areas as unknown as AreaEntrega[]) ?? []).map((a) => ({ ...a, valor: Number(a.valor), taxa_motoboy: a.taxa_motoboy != null ? Number(a.taxa_motoboy) : null }))}
        promosIniciais={((promos as unknown as PromoTele[]) ?? []).map((p) => ({ ...p, valor: Number(p.valor), pedido_minimo: p.pedido_minimo != null ? Number(p.pedido_minimo) : null }))}
        origem={origem}
      />
    </div>
  );
}
