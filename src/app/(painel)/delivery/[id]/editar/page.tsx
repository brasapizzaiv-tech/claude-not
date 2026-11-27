import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NovoPedido, type EditarPedido } from "../../novo/novo-client";
import { dadosDoPedido } from "../../novo/dados";

export const metadata = { title: "Editar pedido · Delivery" };

// Editar o pedido já lançado: a mesma tela do Novo pedido, preenchida.
export default async function EditarPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: ped } = await supabase
    .from("delivery_pedidos")
    .select("id, numero_turno, status, comanda_id, cliente_id, nome, telefone, tipo, logradouro, numero, complemento, bairro, cidade, referencia, cep, taxa_entrega, desconto, desconto_motivo, forma_pagamento, troco_para, observacao, pago")
    .eq("id", id)
    .maybeSingle();
  if (!ped) notFound();
  const p = ped as Record<string, unknown> & { comanda_id: string | null; status: string };

  if (["saiu", "entregue", "cancelado"].includes(p.status)) {
    return (
      <div className="pagina">
        <Link href={`/delivery/${id}`} className="text-sm font-semibold text-texto-marca hover:underline">← Voltar pro pedido</Link>
        <p className="cartao mt-4 p-6 text-texto">Este pedido já saiu (ou foi encerrado): não dá mais pra editar.</p>
      </div>
    );
  }

  const { data: itensRaw } = p.comanda_id
    ? await supabase.from("pdv_comanda_itens").select("id, descricao, qtd, preco_unit").eq("comanda_id", p.comanda_id).order("criado_em").order("id")
    : { data: [] };
  const obs = ((p.observacao as string) ?? "").trim();
  const editar: EditarPedido = {
    id,
    numero: (p.numero_turno as number | null) ?? null,
    nome: (p.nome as string) ?? "",
    telefone: (p.telefone as string) ?? "",
    clienteId: (p.cliente_id as string) ?? null,
    tipo: p.tipo === "retirada" ? "retirada" : "entrega",
    end: {
      logradouro: (p.logradouro as string) ?? "", numero: (p.numero as string) ?? "", complemento: (p.complemento as string) ?? "",
      bairro: (p.bairro as string) ?? "", cidade: (p.cidade as string) ?? "", referencia: (p.referencia as string) ?? "", cep: (p.cep as string) ?? "",
    },
    taxa: Number(p.taxa_entrega ?? 0),
    desconto: Number(p.desconto ?? 0),
    descMotivo: (p.desconto_motivo as string) ?? "",
    forma: (p.forma_pagamento as string) ?? "",
    troco: p.troco_para != null ? Number(p.troco_para) : null,
    obs,
    pago: !!p.pago,
    // A observação do pedido vai colada no 1º item (é como sai na cozinha): aqui
    // ela aparece só no campo de observação.
    existentes: ((itensRaw as { id: string; descricao: string; qtd: number; preco_unit: number | null }[]) ?? []).map((i) => ({
      id: i.id,
      descricao: obs && i.descricao.endsWith(`\nObs: ${obs}`) ? i.descricao.slice(0, -`\nObs: ${obs}`.length) : i.descricao,
      qtd: Number(i.qtd),
      preco: Number(i.preco_unit ?? 0),
    })),
  };

  return <NovoPedido {...await dadosDoPedido()} editar={editar} />;
}
