import { createClient } from "@/lib/supabase/server";
import { RetiradasClient, type Retirada, type Produto, type Pessoa } from "./client";

export const metadata = { title: "Compras internas · Brasa" };

export default async function RetiradasPage() {
  const supabase = await createClient();
  const [{ data: colabs }, { data: prods }, { data: rets }] = await Promise.all([
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("retirada_produtos").select("id, nome, categoria, preco, ativo").order("nome"),
    supabase
      .from("retiradas")
      .select("id, colaborador_id, nome, produto_id, item, valor, peso, data, status, data_pagamento, observacao")
      .order("data", { ascending: false })
      .limit(2000),
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
