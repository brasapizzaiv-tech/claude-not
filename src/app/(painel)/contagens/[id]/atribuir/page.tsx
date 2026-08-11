import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Contagem, Colaborador } from "@/lib/types";
import { AtribuirClient, type CategoriaLinha } from "./atribuir-client";

export default async function AtribuirPage({
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

  const [{ data: cats }, { data: colabs }, { data: atrib }, { data: links }] =
    await Promise.all([
      supabase.from("categorias").select("id, nome, produtos(count)").order("nome"),
      supabase
        .from("colaboradores")
        .select("*")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("contagem_atribuicoes")
        .select("categoria_id, colaborador_id")
        .eq("contagem_id", id),
      supabase
        .from("contagem_links")
        .select("colaborador_id, token")
        .eq("contagem_id", id),
    ]);

  const atribMap = new Map(
    (atrib ?? []).map((a) => [a.categoria_id, a.colaborador_id]),
  );

  const categorias: CategoriaLinha[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    qtdProdutos:
      Array.isArray(c.produtos) && c.produtos.length > 0
        ? (c.produtos[0] as { count: number }).count
        : 0,
    colaboradorId: (atribMap.get(c.id as string) as string | null) ?? null,
  }));

  const linksMap = Object.fromEntries(
    (links ?? []).map((l) => [l.colaborador_id as string, l.token as string]),
  );

  return (
    <AtribuirClient
      contagem={contagem as Contagem}
      categorias={categorias}
      colaboradores={(colabs as Colaborador[]) ?? []}
      links={linksMap}
    />
  );
}
