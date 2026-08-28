import { createClient } from "@/lib/supabase/server";
import { GarcomPedido, type ItemMenu } from "./garcom-pedido";

export default async function GarcomMesaPage({
  params,
}: {
  params: Promise<{ mesa: string }>;
}) {
  const { mesa: mesaRaw } = await params;
  const mesa = decodeURIComponent(mesaRaw);
  const supabase = await createClient();

  const [{ data: itensRows }, { data: catRows }] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem, disponivel").eq("disponivel", true).order("ordem"),
  ]);

  const itens: ItemMenu[] = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria || "Outros",
    preco: Number(i.preco) || 0,
  }));

  // Ordem das categorias: as do cardápio (com itens) + as que sobraram.
  const comItens = new Set(itens.map((i) => i.categoria));
  const ordenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome).filter((c) => comItens.has(c));
  const categorias = [...ordenadas, ...[...comItens].filter((c) => !ordenadas.includes(c)).sort()];

  return <GarcomPedido mesa={mesa} itens={itens} categorias={categorias} />;
}
