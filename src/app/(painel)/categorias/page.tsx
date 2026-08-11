import { createClient } from "@/lib/supabase/server";
import type { DreCategoria } from "@/lib/types";
import { CategoriasClient, type CategoriaComContagem } from "./client";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const [{ data }, { data: dreData }] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nome, dre_categoria_id, produtos(count)")
      .order("nome"),
    supabase
      .from("dre_categorias")
      .select("*")
      .in("tipo", ["cmv", "despesa_fixa"])
      .order("ordem"),
  ]);

  const categorias: CategoriaComContagem[] = (data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    dreCategoriaId: (c.dre_categoria_id as string) ?? null,
    qtdProdutos:
      Array.isArray(c.produtos) && c.produtos.length > 0
        ? (c.produtos[0] as { count: number }).count
        : 0,
  }));

  const dreCategorias = (dreData as DreCategoria[]) ?? [];

  return (
    <CategoriasClient categorias={categorias} dreCategorias={dreCategorias} />
  );
}
