import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ItensClient, type ItemRow, type CatRow } from "./itens-client";

export default async function ItensEtiquetaPage() {
  const supabase = await createClient();
  const [{ data: cats }, { data: its }] = await Promise.all([
    supabase.from("etiqueta_categorias").select("id, nome, ordem, ativo").order("ordem").order("nome"),
    supabase
      .from("etiqueta_itens")
      .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente, ativo")
      .order("nome"),
  ]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link href="/etiquetas" className="text-sm text-zinc-500 hover:text-orange-600">← Etiquetas</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Itens e categorias de etiqueta</h1>
      <p className="mt-1 mb-6 text-zinc-500">
        As preparações da cozinha que ganham etiqueta, agrupadas em categorias (botões no app), com a validade em dias por conservação.
      </p>
      <ItensClient categorias={(cats as CatRow[]) ?? []} itens={(its as ItemRow[]) ?? []} />
    </div>
  );
}
