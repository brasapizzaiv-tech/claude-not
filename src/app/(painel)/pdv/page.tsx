import { createClient } from "@/lib/supabase/server";
import { PdvClient, type ItemMenu } from "./pdv-client";

export const metadata = { title: "PDV · Brasa" };

export default async function PdvPage() {
  const supabase = await createClient();
  const [{ data: itensRows }, { data: catRows }] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).eq("canal_pdv", true).eq("disponivel", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem, disponivel").eq("disponivel", true).order("ordem"),
  ]);

  const itens: ItemMenu[] = ((itensRows as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria || "Outros",
    preco: Number(i.preco) || 0,
  }));

  const comItens = new Set(itens.map((i) => i.categoria));
  const ordenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome).filter((c) => comItens.has(c));
  const categorias = [...ordenadas, ...[...comItens].filter((c) => !ordenadas.includes(c)).sort()];

  return <PdvClient itens={itens} categorias={categorias} />;
}
