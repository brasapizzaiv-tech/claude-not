import { createClient } from "@/lib/supabase/server";
import type { Fornecedor } from "@/lib/types";
import { FornecedoresClient } from "./client";

export default async function FornecedoresPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  return <FornecedoresClient fornecedores={(data as Fornecedor[]) ?? []} />;
}
