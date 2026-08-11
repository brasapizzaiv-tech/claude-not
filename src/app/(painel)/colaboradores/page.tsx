import { createClient } from "@/lib/supabase/server";
import type { Colaborador } from "@/lib/types";
import { ColaboradoresClient } from "./client";

export default async function ColaboradoresPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  return (
    <ColaboradoresClient colaboradores={(data as Colaborador[]) ?? []} />
  );
}
