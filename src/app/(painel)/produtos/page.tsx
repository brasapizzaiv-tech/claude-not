import { createClient } from "@/lib/supabase/server";
import type { Produto, Categoria } from "@/lib/types";
import { ProdutosClient } from "./client";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  const supabase = await createClient();
  const [{ data: produtos }, { data: categorias }, { data: fornecedores }, { data: vinculos }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("*, categorias(nome)")
        .eq("ativo", true)
        .order("nome"),
      supabase.from("categorias").select("id, nome").order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("fornecedor_produto").select("produto_id, fornecedor_id"),
    ]);

  return (
    <ProdutosClient
      produtos={(produtos as Produto[]) ?? []}
      categorias={(categorias as Categoria[]) ?? []}
      categoriaInicial={categoria ?? ""}
      fornecedores={(fornecedores as { id: string; nome: string }[]) ?? []}
      vinculos={(vinculos as { produto_id: string; fornecedor_id: string }[]) ?? []}
    />
  );
}
