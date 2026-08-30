import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Detalhe, type PedidoDetalhe } from "./detalhe";

export const metadata = { title: "Pedido · Delivery" };

export default async function DeliveryDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ped } = await supabase
    .from("delivery_pedidos")
    .select("*, pdv_comandas(numero)")
    .eq("id", id)
    .maybeSingle();
  if (!ped) notFound();

  const p = ped as Record<string, unknown> & { comanda_id: string | null; pdv_comandas: { numero: number } | { numero: number }[] | null };

  const [{ data: itensRaw }, { data: entregadores }, { count: histCount }] = await Promise.all([
    p.comanda_id
      ? supabase.from("pdv_comanda_itens").select("descricao, qtd, preco_unit").eq("comanda_id", p.comanda_id).order("criado_em")
      : Promise.resolve({ data: [] as { descricao: string; qtd: number; preco_unit: number | null }[] }),
    supabase.from("entregadores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("delivery_pedidos").select("id", { count: "exact", head: true }).eq("telefone", (p.telefone as string) ?? "___").neq("id", id),
  ]);

  const com = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas;
  const itens = ((itensRaw as { descricao: string; qtd: number; preco_unit: number | null }[]) ?? []).map((i) => ({
    descricao: i.descricao, qtd: Number(i.qtd), preco: Number(i.preco_unit || 0),
  }));

  const pedido: PedidoDetalhe = {
    id,
    numero: com?.numero ?? null,
    nome: (p.nome as string) ?? "",
    telefone: (p.telefone as string) ?? "",
    tipo: (p.tipo as "entrega" | "retirada") ?? "entrega",
    endereco: {
      logradouro: (p.logradouro as string) ?? "", numero: (p.numero as string) ?? "",
      complemento: (p.complemento as string) ?? "", bairro: (p.bairro as string) ?? "",
      cidade: (p.cidade as string) ?? "", referencia: (p.referencia as string) ?? "",
    },
    status: (p.status as string) ?? "pendente",
    origem: (p.origem as string) ?? "balcao",
    formaPagamento: (p.forma_pagamento as string) ?? null,
    trocoPara: (p.troco_para as number) ?? null,
    pago: !!p.pago,
    taxaEntrega: Number(p.taxa_entrega ?? 0),
    desconto: Number(p.desconto ?? 0),
    descontoMotivo: (p.desconto_motivo as string) ?? null,
    observacao: (p.observacao as string) ?? null,
    entregadorId: (p.entregador_id as string) ?? null,
    previsaoEm: (p.previsao_em as string) ?? null,
    carimbos: {
      criado_em: p.criado_em as string, aceito_em: (p.aceito_em as string) ?? null,
      preparo_em: (p.preparo_em as string) ?? null, pronto_em: (p.pronto_em as string) ?? null,
      saiu_em: (p.saiu_em as string) ?? null, entregue_em: (p.entregue_em as string) ?? null,
      cancelado_em: (p.cancelado_em as string) ?? null,
    },
    itens,
    historicoCliente: histCount ?? 0,
  };

  return (
    <div className="p-4">
      <Link href="/delivery" className="text-sm text-emerald-600">← Voltar pro painel</Link>
      <Detalhe pedido={pedido} entregadores={(entregadores ?? []) as { id: string; nome: string }[]} />
    </div>
  );
}
