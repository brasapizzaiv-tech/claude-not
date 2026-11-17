import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { SugestoesClient, type Sugestao } from "./client";

export const metadata = { title: "Sugestões do sistema" };

// Ideias que a equipe mandou pelo Ajudante quando o sistema ainda não fazia
// alguma coisa. Só o dono vê (rota em SO_DONO).
export default async function SugestoesPage() {
  await exigirAcesso("/sugestoes");
  const supabase = await createClient();
  const { data } = await supabase
    .from("sistema_sugestoes")
    .select("id, nome, pedido, contexto, tela, status, resposta, criado_em, respondido_em")
    .order("criado_em", { ascending: false })
    .limit(500);
  return <SugestoesClient lista={(data as Sugestao[]) ?? []} />;
}
