import { createClient } from "@/lib/supabase/server";
import { EstacaoHub, type Impressora } from "./hub";

export const metadata = { title: "Estações de impressão · Brasa" };

export default async function EstacoesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("impressoras")
    .select("id, nome, ativo")
    .order("criado_em");
  return <EstacaoHub impressoras={(data as Impressora[]) ?? []} />;
}
