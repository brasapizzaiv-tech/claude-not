import { createClient } from "@/lib/supabase/server";
import { ClientesClient, type Cliente } from "./client";

export default async function ClientesPage() {
  const supabase = await createClient();
  // O PostgREST devolve no máximo 1000 linhas por consulta e já são 3.000+
  // clientes: sem paginar, quem estava depois do 1000º na ordem alfabética
  // "sumia" (parecia que o cadastro não salvava). Busca em blocos.
  const todos: Cliente[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await supabase.from("clientes").select("*").eq("ativo", true).order("nome").order("id").range(de, de + 999);
    const lote = (data as Cliente[]) ?? [];
    todos.push(...lote);
    if (lote.length < 1000) break;
  }
  return <ClientesClient clientes={todos} />;
}
