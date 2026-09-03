import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { agruparContas, type LinhaConta } from "@/app/(painel)/financeiro/contas/consulta";
import { colabContas } from "./contas-actions";
import { ContasColab, type ContaApp } from "./lista";

export const metadata = { title: "Contas a pagar · Brasa" };

export default async function ContasColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const colab = await colabContas(token);

  if (!colab) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Você não tem acesso às contas — ou precisa entrar com o PIN de novo.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("lancamentos")
    .select("id, nota_id, data, lancamento_em, descricao, valor, vencimento, pago, pago_em, banco, forma_pagamento, origem, ajuste, categoria_id, dre_categorias(nome, tipo), fornecedores(nome)")
    .eq("pago", false)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(2000);

  // Mesmo agrupamento da tela do painel: uma nota (vários lançamentos) = um boleto.
  const linhas = agruparContas(
    ((data as unknown as LinhaConta[]) ?? []).filter((l) => {
      const cat = Array.isArray(l.dre_categorias) ? (l.dre_categorias as { tipo?: string }[])[0] : l.dre_categorias;
      return cat?.tipo !== "receita";
    }),
  );
  const contas: ContaApp[] = linhas.map((l) => {
    const cat = Array.isArray(l.dre_categorias) ? (l.dre_categorias as { nome?: string }[])[0] : l.dre_categorias;
    const forn = Array.isArray(l.fornecedores) ? (l.fornecedores as { nome?: string }[])[0] : l.fornecedores;
    return {
      id: l.id,
      ids: l.ids ?? [l.id],
      descricao: l.descricao ?? forn?.nome ?? "Despesa",
      fornecedor: forn?.nome ?? null,
      categoria: cat?.nome ?? null,
      valor: Number(l.valor),
      vencimento: l.vencimento,
      banco: l.banco,
      forma: l.forma_pagamento,
    };
  });
  const hoje = new Date(new Date().getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 pb-32 dark:bg-zinc-950">
      <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">💰 Contas a pagar</h1>
      <p className="mb-4 text-sm text-zinc-500">Olá, {colab.nome.split(" ")[0]} — marque as que foram pagas e dê baixa.</p>
      <ContasColab token={token} contas={contas} hoje={hoje} />
    </div>
  );
}
