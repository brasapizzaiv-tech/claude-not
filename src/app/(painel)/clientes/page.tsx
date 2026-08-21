import { createClient } from "@/lib/supabase/server";
import { ClientesClient, type Cliente } from "./client";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("*")
    .eq("ativo", true)
    .order("nome");
  return <ClientesClient clientes={(data as Cliente[]) ?? []} />;
}
