import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Contagem, Produto, ContagemItem } from "@/lib/types";
import { ContarClient } from "./contar";

export default async function ContagemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contagem } = await supabase
    .from("contagens")
    .select("*")
    .eq("id", id)
    .single();

  if (!contagem) notFound();

  // Se a contagem tem categorias atribuídas (divisão/avulsa/agendada), mostra
  // SÓ essas seções. Sem atribuição = contagem geral (todos os produtos).
  const { data: atrib } = await supabase
    .from("contagem_atribuicoes")
    .select("categoria_id")
    .eq("contagem_id", id);
  const catIds = [
    ...new Set((atrib ?? []).map((a) => a.categoria_id).filter(Boolean)),
  ];

  let prodQuery = supabase
    .from("produtos")
    .select("id, nome, unidade, estoque_minimo, categorias(nome)")
    .eq("ativo", true)
    .order("nome");
  if (catIds.length) prodQuery = prodQuery.in("categoria_id", catIds);

  const [{ data: produtos }, { data: itens }] = await Promise.all([
    prodQuery,
    supabase
      .from("contagem_itens")
      .select("produto_id, qtd_estoque, qtd_pedir")
      .eq("contagem_id", id),
  ]);

  return (
    <ContarClient
      contagem={contagem as Contagem}
      produtos={(produtos as unknown as Produto[]) ?? []}
      itens={(itens as Pick<
        ContagemItem,
        "produto_id" | "qtd_estoque" | "qtd_pedir"
      >[]) ?? []}
    />
  );
}
