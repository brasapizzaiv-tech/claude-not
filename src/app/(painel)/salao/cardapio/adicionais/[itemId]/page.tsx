import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdicionaisClient } from "./client";

export default async function AdicionaisPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("pdv_itens")
    .select("id, nome, preco")
    .eq("id", itemId)
    .single();
  if (!item) notFound();

  const { data: gruposRows } = await supabase
    .from("pdv_item_grupos")
    .select("id, nome, min, max, ordem")
    .eq("item_id", itemId)
    .order("ordem");
  const grupos = (gruposRows as { id: string; nome: string; min: number; max: number }[]) ?? [];

  let opcoes: { id: string; grupo_id: string; nome: string; preco: number; ativo: boolean }[] = [];
  if (grupos.length) {
    const { data } = await supabase
      .from("pdv_item_opcoes")
      .select("id, grupo_id, nome, preco, ativo")
      .in("grupo_id", grupos.map((g) => g.id))
      .order("ordem");
    opcoes = (data as typeof opcoes) ?? [];
  }

  const gruposComOpcoes = grupos.map((g) => ({
    ...g,
    opcoes: opcoes
      .filter((o) => o.grupo_id === g.id)
      .map((o) => ({ id: o.id, nome: o.nome, preco: Number(o.preco), ativo: o.ativo })),
  }));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/salao/cardapio" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Cardápio
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Adicionais — {item.nome}
      </h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">
        Ligue/desligue os adicionais e ajuste preços. Só os <strong>ativos</strong> aparecem na comanda.
      </p>
      <AdicionaisClient itemId={itemId} grupos={gruposComOpcoes} />
    </div>
  );
}
