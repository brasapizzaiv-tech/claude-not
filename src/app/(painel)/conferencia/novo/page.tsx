import { createClient } from "@/lib/supabase/server";
import { NovoPedidoClient } from "./novo-client";

export default async function NovoPedidoManualPage() {
  const supabase = await createClient();
  const [{ data: forns }, { data: prods }] = await Promise.all([
    supabase.from("fornecedores").select("id, nome, whatsapp").eq("ativo", true).order("nome"),
    supabase
      .from("produtos")
      .select("id, nome, unidade, preco_referencia")
      .eq("ativo", true)
      .order("nome"),
  ]);

  return (
    <NovoPedidoClient
      fornecedores={(forns as { id: string; nome: string; whatsapp: string | null }[]) ?? []}
      produtos={
        (prods as {
          id: string;
          nome: string;
          unidade: string;
          preco_referencia: number | null;
        }[]) ?? []
      }
    />
  );
}
