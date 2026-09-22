import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CategoriasDreClient, type CategoriaDre } from "./client";

export const metadata = { title: "Categorias do DRE · Brasa" };

// Categorias que o CÓDIGO procura pelo NOME, não pelo id. Renomear qualquer
// uma destas quebra uma automação em silêncio:
//   • o fechamento do caixa lança o faturamento do dia nelas;
//   • a conferência e o lançamento de nota jogam a compra em "Compras
//     (Pedidos)";
//   • a semana da equipe acha a diarista por "eventual/diarista".
// A tela avisa e não deixa apagar. Renomear ela permite, mas com aviso —
// travar de vez impediria o Rafael de corrigir um erro de digitação.
const NOMES_DO_SISTEMA = new Set([
  "Dinheiro",
  "PIX/Transferência",
  "Cartão",
  "Vendas do Fiado",
  "Saldo",
  "Compras (Pedidos)",
  "CMO Eventual / Diaristas",
]);

export const dynamic = "force-dynamic";

// Onde cada despesa e cada receita cai no relatório. As categorias existiam
// desde sempre, criadas por migração, e nunca tiveram tela.
//
// A tela mostra QUANTAS contas usam cada uma, porque é esse número que decide
// o que a pessoa pode fazer: categoria com uso não se apaga, se desativa.
export default async function CategoriasDrePage() {
  const supabase = await createClient();

  // SEIS tabelas apontam pra categoria. A tela precisa saber de todas, não só
  // dos lançamentos: oferecer "apagar" numa categoria presa a um fornecedor
  // seria oferecer o que o servidor vai recusar.
  const ligacoes: { tabela: string; coluna: string }[] = [
    { tabela: "lancamentos", coluna: "categoria_id" },
    { tabela: "categorias", coluna: "dre_categoria_id" },
    { tabela: "orcamentos", coluna: "categoria_id" },
    { tabela: "notas_fiscais", coluna: "dre_categoria_id" },
    { tabela: "fornecedores", coluna: "dre_categoria_id" },
    { tabela: "fatura_regras", coluna: "categoria_id" },
  ];

  const [{ data: cats }, ...refs] = await Promise.all([
    supabase
      .from("dre_categorias")
      .select("id, tipo, grupo, nome, ativo")
      .order("tipo")
      .order("grupo")
      .order("nome"),
    ...ligacoes.map((l) => supabase.from(l.tabela).select(l.coluna)),
  ]);

  // Contas lançadas contam à parte: é o número que importa pra pessoa ("12
  // contas nesta categoria"). As outras cinco só dizem se dá pra apagar.
  const contas = new Map<string, number>();
  const presas = new Set<string>();
  refs.forEach((r, i) => {
    const coluna = ligacoes[i].coluna;
    for (const linha of (r.data as unknown as Record<string, string | null>[]) ?? []) {
      const id = linha[coluna];
      if (!id) continue;
      presas.add(id);
      if (ligacoes[i].tabela === "lancamentos") {
        contas.set(id, (contas.get(id) ?? 0) + 1);
      }
    }
  });

  const linhas: CategoriaDre[] = ((cats as CategoriaDre[]) ?? []).map((c) => ({
    ...c,
    usos: contas.get(c.id) ?? 0,
    presa: presas.has(c.id),
    doSistema: NOMES_DO_SISTEMA.has(c.nome),
  }));

  return (
    <div className="w-full p-5">
      <Link href="/financeiro" className="text-sm text-texto-suave hover:underline">
        Financeiro
      </Link>
      <h1 className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">
        Categorias do DRE
      </h1>
      <p className="mt-0.5 mb-5 max-w-[70ch] text-sm text-texto-suave">
        Cada conta lançada entra numa destas categorias, e é assim que o
        relatório se monta. Categoria que já tem conta lançada não pode ser
        apagada — desative, que ela some das listas novas e o histórico
        continua certo.
      </p>

      <CategoriasDreClient linhas={linhas} />
    </div>
  );
}
