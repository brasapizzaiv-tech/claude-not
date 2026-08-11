import { createClient } from "@/lib/supabase/server";
import { CategoriasClient, type CategoriaComContagem } from "./client";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categorias")
    .select("id, nome, produtos(count)")
    .order("nome");

  const categorias: CategoriaComContagem[] = (data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    qtdProdutos:
      Array.isArray(c.produtos) && c.produtos.length > 0
        ? (c.produtos[0] as { count: number }).count
        : 0,
  }));

  return <CategoriasClient categorias={categorias} />;
}
