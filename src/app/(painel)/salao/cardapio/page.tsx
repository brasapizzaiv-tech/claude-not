import { createClient } from "@/lib/supabase/server";
import { CardapioClient } from "./client";
import type { Horarios } from "@/lib/disponibilidade";

export default async function CardapioPage() {
  const supabase = await createClient();
  const [{ data: cfg }, { data: itens }, { data: cats }, { data: gruposRows }, { data: tamanhos }, { data: sabores }, { data: precos }] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_itens")
      .select("id, nome, categoria, preco, promo_preco, ativo, delivery, canal_garcom, canal_pdv, disponivel, horarios, foto_url, descricao")
      .order("nome"),
    supabase.from("pdv_categorias").select("id, nome, ordem, disponivel, horarios, canal_app, canal_garcom, canal_pdv").order("ordem"),
    supabase.from("pdv_item_grupos").select("item_id"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, fatias, ordem").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome, ativo, foto_url, descricao, tipo, rodizio").eq("ativo", true).order("ordem"),
    supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
  ]);
  const config: Record<string, string> = {};
  for (const r of cfg ?? []) config[r.chave] = r.valor;
  const comAdicionais = [...new Set(((gruposRows as { item_id: string }[]) ?? []).map((g) => g.item_id))];

  return (
    <div className="w-full p-8">
      <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Cardápio</h1>
      <p className="mb-6 mt-1 text-texto-suave">
        Um cardápio só, para tudo: salão, garçom, PDV e o app do cliente. Em cada produto você escolhe os canais, a foto e a disponibilidade.
      </p>
      <CardapioClient
        config={config}
        itens={
          (itens as {
            id: string; nome: string; categoria: string | null; preco: number; promo_preco: number | null; ativo: boolean;
            delivery: boolean; canal_garcom: boolean; canal_pdv: boolean; disponivel: boolean;
            horarios: Horarios; foto_url: string | null; descricao: string | null;
          }[]) ?? []
        }
        categorias={
          (cats as { id: string; nome: string; ordem: number; disponivel: boolean; horarios: Horarios; canal_app: boolean; canal_garcom: boolean; canal_pdv: boolean }[]) ?? []
        }
        comAdicionais={comAdicionais}
        tamanhos={(tamanhos as { id: string; nome: string; max_sabores: number; fatias: number | null }[]) ?? []}
        sabores={(sabores as { id: string; nome: string; foto_url: string | null; descricao: string | null }[]) ?? []}
        precos={(precos as { sabor_id: string; tamanho_id: string; preco: number }[]) ?? []}
      />
    </div>
  );
}
