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

  const [{ data: produtos }, { data: itens }] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, unidade, estoque_minimo, categorias(nome)")
      .eq("ativo", true)
      .order("nome"),
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
