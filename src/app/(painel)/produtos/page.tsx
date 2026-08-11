import { createClient } from "@/lib/supabase/server";
import type { Produto } from "@/lib/types";
import { ProdutosClient } from "./client";

export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("produtos")
    .select("*, categorias(nome)")
    .eq("ativo", true)
    .order("nome");

  return <ProdutosClient produtos={(data as Produto[]) ?? []} />;
}
