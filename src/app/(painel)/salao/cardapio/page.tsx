import { createClient } from "@/lib/supabase/server";
import { CardapioClient } from "./client";

export default async function CardapioPage() {
  const supabase = await createClient();
  const [{ data: cfg }, { data: itens }, { data: cats }] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco, ativo").order("nome"),
    supabase.from("pdv_categorias").select("id, nome, ordem, disponivel").order("ordem"),
  ]);
  const config: Record<string, string> = {};
  for (const r of cfg ?? []) config[r.chave] = r.valor;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cardápio</h1>
      <p className="mb-6 mt-1 text-zinc-500">
        Aqui você define o que o cliente pode pedir. Categorias e produtos alimentam as comandas.
      </p>
      <CardapioClient
        config={config}
        itens={
          (itens as {
            id: string;
            nome: string;
            categoria: string | null;
            preco: number;
            ativo: boolean;
          }[]) ?? []
        }
        categorias={
          (cats as { id: string; nome: string; ordem: number; disponivel: boolean }[]) ?? []
        }
      />
    </div>
  );
}
