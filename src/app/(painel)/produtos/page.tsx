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
  const [{ data: produtos }, { data: categorias }, { data: fornecedores }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("*, categorias(nome)")
        .eq("ativo", true)
        .order("nome"),
      supabase.from("categorias").select("id, nome").order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  // fornecedor_produto pode passar de 1000 linhas (o PostgREST corta em 1000),
  // então busca paginando por faixas até trazer tudo.
  const vinculos: { produto_id: string; fornecedor_id: string }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data: pagina } = await supabase
      .from("fornecedor_produto")
      .select("produto_id, fornecedor_id")
      .range(de, de + 999);
    if (!pagina || pagina.length === 0) break;
    vinculos.push(...(pagina as { produto_id: string; fornecedor_id: string }[]));
    if (pagina.length < 1000) break;
  }

  return (
    <ProdutosClient
      produtos={(produtos as Produto[]) ?? []}
      categorias={(categorias as Categoria[]) ?? []}
      categoriaInicial={categoria ?? ""}
      fornecedores={(fornecedores as { id: string; nome: string }[]) ?? []}
      vinculos={vinculos}
    />
  );
}
