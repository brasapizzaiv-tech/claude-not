import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CardapioAppClient } from "./client";

export const metadata = { title: "Cardápio do app · Delivery" };

export default async function CardapioAppPage() {
  const supabase = await createClient();
  const [{ data: itens }, { data: cats }, { data: tamanhos }, { data: sabores }] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco, ativo, delivery, foto_url, descricao").eq("ativo", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem").order("ordem"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores, fatias, ordem").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome, ativo, foto_url, descricao").eq("ativo", true).order("ordem"),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <h1 className="mb-1 mt-2 text-xl font-bold">🖼️ Cardápio do app</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Fotos e descrições que aparecem no app do cliente (/pedir). Preços e itens são os mesmos do cardápio do salão.
      </p>
      <CardapioAppClient
        itens={(itens as { id: string; nome: string; categoria: string | null; preco: number; delivery: boolean; foto_url: string | null; descricao: string | null }[]) ?? []}
        categorias={((cats as { nome: string }[]) ?? []).map((c) => c.nome)}
        tamanhos={(tamanhos as { id: string; nome: string; max_sabores: number; fatias: number | null }[]) ?? []}
        sabores={(sabores as { id: string; nome: string; foto_url: string | null; descricao: string | null }[]) ?? []}
      />
    </div>
  );
}
