import { createClient } from "@/lib/supabase/server";
import { RetiradasClient, type Retirada, type Produto, type Pessoa } from "./client";
import { buscarTodas } from "@/lib/supabase/todas";

export const metadata = { title: "Compras internas" };

export default async function RetiradasPage() {
  const supabase = await createClient();
  const [{ data: colabs }, { data: prods }, { data: rets }] = await Promise.all([
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("retirada_produtos").select("id, nome, categoria, preco, ativo").order("nome"),
    buscarTodas<Record<string, unknown>>((de, ate) => supabase
      .from("retiradas")
      .select("id, colaborador_id, nome, produto_id, item, valor, peso, data, status, data_pagamento, observacao, obs_pagamento")
      .order("data", { ascending: false }).order("id").range(de, ate)).then((data) => ({ data })),
  ]);

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <RetiradasClient
      pessoas={(colabs as Pessoa[]) ?? []}
      produtos={(prods as Produto[]) ?? []}
      retiradas={(rets as Retirada[]) ?? []}
      hojeIso={hojeIso}
    />
  );
}
