import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FiadoClient, type ClienteFiado } from "./fiado-client";

export const metadata = { title: "Fiado de clientes · Caixa" };

const FORMAS = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito"];

export default async function FiadoPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("cliente_fiado")
    .select("id, cliente_id, tipo, valor, descricao, forma_pagamento, criado_em, clientes(nome, telefone)")
    .order("criado_em", { ascending: false })
    .limit(3000);

  type Row = { id: string; cliente_id: string; tipo: string; valor: number; descricao: string | null; forma_pagamento: string | null; criado_em: string; clientes: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null };
  const porCliente = new Map<string, ClienteFiado>();
  for (const r of ((rows as unknown as Row[]) ?? [])) {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes;
    const c = porCliente.get(r.cliente_id) ?? { id: r.cliente_id, nome: cli?.nome ?? "Cliente", telefone: cli?.telefone ?? null, saldo: 0, lancamentos: [] };
    const v = Number(r.valor);
    c.saldo = Math.round((c.saldo + (r.tipo === "debito" ? v : -v)) * 100) / 100;
    c.lancamentos.push({
      id: r.id,
      tipo: r.tipo as "debito" | "pagamento",
      valor: v,
      descricao: r.descricao,
      forma: r.forma_pagamento,
      quando: new Date(r.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    });
    porCliente.set(r.cliente_id, c);
  }
  const clientes = [...porCliente.values()].sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome));
  const totalAberto = clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/salao/caixa" className="text-sm text-zinc-500 hover:text-orange-600">← Caixa</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">👥 Fiado de clientes</h1>
      <p className="mb-4 mt-1 text-sm text-zinc-500">
        Contas recebidas como &quot;Saldo cliente&quot; no caixa. Quando o cliente pagar, clique em Receber: entra no caixa do dia com a forma usada.
        Em aberto: <b className="text-zinc-800 dark:text-zinc-100">{totalAberto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>
      </p>
      <FiadoClient clientes={clientes} formas={FORMAS} />
    </div>
  );
}
