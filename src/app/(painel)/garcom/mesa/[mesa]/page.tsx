import { createClient } from "@/lib/supabase/server";
import { GarcomPedido, type ItemMenu } from "./garcom-pedido";

export default async function GarcomMesaPage({
  params,
  searchParams,
}: {
  params: Promise<{ mesa: string }>;
  searchParams: Promise<{ comanda?: string }>;
}) {
  const { mesa: mesaRaw } = await params;
  const { comanda: comandaInicial } = await searchParams;
  const mesa = decodeURIComponent(mesaRaw);
  const supabase = await createClient();

  const [{ data: itensRows }, { data: catRows }, { data: comRows }, { data: cfgRows }] = await Promise.all([
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).eq("canal_garcom", true).eq("disponivel", true).order("nome"),
    supabase.from("pdv_categorias").select("nome, ordem, disponivel").eq("disponivel", true).order("ordem"),
    supabase.from("pdv_comandas").select("id, numero, valor_buffet").eq("mesa", mesa).eq("status", "aberta").order("numero"),
    supabase.from("pdv_config").select("chave, valor").eq("chave", "qtd_mesas"),
  ]);
  const comRaw = (comRows as { id: string; numero: number; valor_buffet: number | null }[]) ?? [];

  // Itens lançados de cada comanda (histórico) + total (itens + buffet).
  const comandaIds = comRaw.map((c) => c.id);
  const itensPorComanda = new Map<string, { descricao: string; qtd: number; preco: number }[]>();
  if (comandaIds.length > 0) {
    const { data: itRows } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, descricao, qtd, preco_unit, criado_em")
      .in("comanda_id", comandaIds)
      .order("criado_em", { ascending: true });
    for (const it of (itRows as { comanda_id: string; descricao: string; qtd: number; preco_unit: number }[]) ?? []) {
      const lista = itensPorComanda.get(it.comanda_id) ?? [];
      lista.push({ descricao: it.descricao, qtd: Number(it.qtd), preco: Number(it.preco_unit) });
      itensPorComanda.set(it.comanda_id, lista);
    }
  }
  const comandas = comRaw.map((c) => {
    const itens = itensPorComanda.get(c.id) ?? [];
    const totalItens = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    return {
      id: c.id,
      numero: c.numero,
      buffet: Number(c.valor_buffet ?? 0),
      itens,
      total: totalItens + Number(c.valor_buffet ?? 0),
    };
  });

  // Lista de mesas para o "Trocar mesa" (todas, menos a atual).
  const qtdMesas = Number((cfgRows as { valor: string }[] | null)?.[0]?.valor || 40);
  const mesas = ["Balcão", ...Array.from({ length: qtdMesas }, (_, i) => `Mesa ${i + 1}`), "Balança"].filter(
    (m) => m !== mesa,
  );

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

  return (
    <GarcomPedido
      mesa={mesa}
      itens={itens}
      categorias={categorias}
      comandas={comandas}
      mesas={mesas}
      comandaInicial={comandas.some((c) => c.id === comandaInicial) ? comandaInicial : undefined}
    />
  );
}
