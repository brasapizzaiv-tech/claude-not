import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: qtdFornecedores }, { count: qtdProdutos }] =
    await Promise.all([
      supabase
        .from("fornecedores")
        .select("*", { count: "exact", head: true })
        .eq("ativo", true),
      supabase
        .from("produtos")
        .select("*", { count: "exact", head: true })
        .eq("ativo", true),
    ]);

  const cards = [
    {
      titulo: "Fornecedores",
      valor: qtdFornecedores ?? 0,
      href: "/fornecedores",
      icon: "🚚",
    },
    {
      titulo: "Produtos",
      valor: qtdProdutos ?? 0,
      href: "/produtos",
      icon: "📦",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Início
      </h1>
      <p className="mt-1 text-zinc-500">Visão geral do sistema.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.titulo}
            href={c.href}
            className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{c.icon}</span>
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {c.valor}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {c.titulo}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          Próximos passos
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Cadastre (ou importe) seus fornecedores e produtos.</li>
          <li>Faça a contagem de estoque (em breve).</li>
          <li>Gere a cotação e compare os preços (em breve).</li>
        </ol>
      </div>
    </div>
  );
}
