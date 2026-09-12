import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BANCOS } from "@/lib/financeiro";
import { FaturaClient } from "./fatura-client";

export const metadata = { title: "Fatura do cartão · Brasa" };

export default async function FaturaPage() {
  const supabase = await createClient();

  const [{ data: catData }, { data: transData }] = await Promise.all([
    supabase
      .from("dre_categorias")
      .select("id, nome, grupo, tipo")
      .eq("ativo", true)
      .neq("tipo", "receita")
      .order("grupo")
      .order("ordem"),
    // Débitos ainda não conciliados: a fatura costuma ser um deles.
    supabase
      .from("transacoes_banco")
      .select("id, data, valor, descricao")
      .is("lancamento_id", null)
      .lt("valor", 0)
      .order("data", { ascending: false })
      .limit(120),
  ]);

  const categorias = ((catData as { id: string; nome: string; grupo: string }[]) ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    grupo: c.grupo,
  }));
  const transacoes = ((transData as { id: string; data: string; valor: number; descricao: string | null }[]) ?? []).map((t) => ({
    id: t.id,
    data: t.data,
    valor: Number(t.valor),
    descricao: t.descricao,
  }));

  return (
    <div className="p-4 md:p-6">
      <Link href="/financeiro" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Voltar ao financeiro
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">💳 Fatura do cartão</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Cada compra da fatura vira um lançamento na sua categoria — assim o DRE mostra onde o dinheiro foi,
        em vez de uma linha só de &quot;cartão de crédito&quot;.
      </p>
      <FaturaClient categorias={categorias} bancos={BANCOS} transacoes={transacoes} />
    </div>
  );
}
