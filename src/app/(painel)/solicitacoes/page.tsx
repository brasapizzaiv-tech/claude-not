import { createClient } from "@/lib/supabase/server";
import { SolicitacoesClient, type Pessoa, type Solic } from "./client";
import { buscarTodas } from "@/lib/supabase/todas";

export const metadata = { title: "Pedidos da equipe" };

export default async function SolicitacoesPage() {
  const supabase = await createClient();
  const [{ data: lista }, { data: colabs }] = await Promise.all([
    buscarTodas<Record<string, unknown>>((de, ate) => supabase
      .from("solicitacoes_compra")
      .select("id, colaborador_id, nome, tipo, item, quantidade, motivo, urgente, status, resposta, respondido_em, criado_em")
      .order("criado_em", { ascending: false }).order("id").range(de, ate)).then((data) => ({ data })),
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // Pendentes primeiro (urgentes no topo, depois os mais antigos); o resto por data.
  const ordenada = ((lista as Solic[]) ?? []).sort((a, b) => {
    if (a.status === "pendente" && b.status === "pendente") {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return a.criado_em.localeCompare(b.criado_em);
    }
    return b.criado_em.localeCompare(a.criado_em);
  });

  return <SolicitacoesClient lista={ordenada} pessoas={(colabs as Pessoa[]) ?? []} />;
}
