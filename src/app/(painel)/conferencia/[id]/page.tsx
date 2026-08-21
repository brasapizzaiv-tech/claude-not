import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConferirClient, type ItemLinha } from "./conferir-client";

export default async function ConferirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select(
      "id, data, status, observacoes, fornecedores(nome), cotacoes(descricao), pedido_itens(id, qtd, preco_unit, qtd_recebida, preco_recebido, obs, produtos(nome, unidade))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const { data: prodData } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  const produtos = (prodData as { id: string; nome: string }[]) ?? [];

  type Row = {
    id: string;
    data: string;
    status: string;
    observacoes: string | null;
    fornecedores: { nome?: string } | null;
    cotacoes: { descricao?: string } | null;
    pedido_itens: {
      id: string;
      qtd: number;
      preco_unit: number | null;
      qtd_recebida: number | null;
      preco_recebido: number | null;
      obs: string | null;
      produtos: { nome?: string; unidade?: string } | null;
    }[];
  };
  const ped = data as unknown as Row;

  const itens: ItemLinha[] = (ped.pedido_itens ?? [])
    .map((i) => ({
      id: i.id,
      nome: i.produtos?.nome ?? "—",
      unidade: i.produtos?.unidade ?? "",
      qtd: i.qtd,
      preco_unit: i.preco_unit,
      qtd_recebida: i.qtd_recebida,
      preco_recebido: i.preco_recebido,
      obs: i.obs,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <ConferirClient
      pedidoId={ped.id}
      fornecedor={ped.fornecedores?.nome ?? "—"}
      cotacao={ped.cotacoes?.descricao ?? ""}
      data={ped.data}
      status={ped.status}
      observacoes={ped.observacoes ?? ""}
      itens={itens}
      produtos={produtos}
    />
  );
}
