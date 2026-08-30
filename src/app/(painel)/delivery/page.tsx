import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Board, type PedidoBoard, type EntregadorOpt } from "./board";

export const metadata = { title: "Delivery · Brasa" };

export default async function DeliveryPage() {
  const supabase = await createClient();

  const [{ data: pedidosRaw }, { data: entregadores }] = await Promise.all([
    supabase
      .from("delivery_pedidos")
      .select(
        "id, comanda_id, nome, telefone, tipo, logradouro, bairro, cidade, status, origem, forma_pagamento, pago, taxa_entrega, desconto, criado_em, previsao_em, entregador_id, pdv_comandas(numero)",
      )
      .order("criado_em", { ascending: false })
      .limit(120),
    supabase.from("entregadores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const linhas = (pedidosRaw as unknown as (Omit<PedidoBoard, "numero" | "subtotal" | "entregadorNome"> & {
    comanda_id: string | null;
    pdv_comandas: { numero: number } | { numero: number }[] | null;
  })[]) ?? [];

  // Subtotais (soma dos itens por comanda) numa consulta só.
  const comandaIds = [...new Set(linhas.map((l) => l.comanda_id).filter(Boolean))] as string[];
  const somaDe = new Map<string, number>();
  if (comandaIds.length) {
    const { data: itens } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, qtd, preco_unit")
      .in("comanda_id", comandaIds);
    for (const it of itens ?? []) {
      const v = Number(it.qtd) * Number(it.preco_unit || 0);
      somaDe.set(it.comanda_id as string, (somaDe.get(it.comanda_id as string) ?? 0) + v);
    }
  }

  const entrMap = new Map((entregadores ?? []).map((e) => [e.id, e.nome]));
  const pedidos: PedidoBoard[] = linhas.map((l) => {
    const c = Array.isArray(l.pdv_comandas) ? l.pdv_comandas[0] : l.pdv_comandas;
    return {
      ...l,
      numero: c?.numero ?? null,
      subtotal: Math.round((somaDe.get(l.comanda_id ?? "") ?? 0) * 100) / 100,
      entregadorNome: l.entregador_id ? entrMap.get(l.entregador_id) ?? null : null,
    };
  });

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">🛵 Delivery</h1>
        <Link href="/delivery/novo" className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">+ Novo pedido</Link>
        <div className="ml-auto flex gap-3 text-sm text-zinc-500">
          <Link href="/delivery/cardapio" className="hover:underline">🖼️ Cardápio do app</Link>
          <Link href="/delivery/relatorios" className="hover:underline">📊 Relatórios</Link>
          <Link href="/delivery/entregadores" className="hover:underline">🛵 Entregadores</Link>
          <Link href="/delivery/config" className="hover:underline">⚙️ Config</Link>
        </div>
      </div>
      <Board pedidos={pedidos} entregadores={(entregadores ?? []) as EntregadorOpt[]} />
    </div>
  );
}
