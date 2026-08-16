import { createClient } from "@/lib/supabase/server";
import { CardapioClient } from "./client";

export default async function CardapioPage() {
  const supabase = await createClient();
  const [{ data: cfg }, { data: itens }] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).order("nome"),
  ]);
  const config: Record<string, string> = {};
  for (const r of cfg ?? []) config[r.chave] = r.valor;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Cardápio do salão
      </h1>
      <p className="mb-6 mt-1 text-zinc-500">
        Itens e preços do salão, e o preço por quilo do buffet. Base para as
        comandas e o caixa (próximas fases).
      </p>
      <CardapioClient
        config={config}
        itens={
          (itens as { id: string; nome: string; categoria: string | null; preco: number }[]) ??
          []
        }
      />
    </div>
  );
}
