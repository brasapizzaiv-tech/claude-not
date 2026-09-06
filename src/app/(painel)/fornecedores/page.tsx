import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/lib/types";
import { FornecedoresClient } from "./client";

export default async function FornecedoresPage() {
  const supabase = await createClient();
  const [{ data }, { data: catData }] = await Promise.all([
    supabase.from("fornecedores").select("*").eq("ativo", true).order("nome"),
    // Categorias de despesa (DRE) pro padrão do fornecedor.
    supabase.from("dre_categorias").select("id, tipo, grupo, nome").eq("ativo", true).order("grupo").order("ordem"),
  ]);
  const categorias = ((catData as { id: string; tipo: string; grupo: string; nome: string }[]) ?? []).filter(
    (c) => c.tipo !== "receita" && c.tipo !== "deducao",
  );

  return <FornecedoresClient fornecedores={(data as Fornecedor[]) ?? []} categorias={categorias} />;
}
