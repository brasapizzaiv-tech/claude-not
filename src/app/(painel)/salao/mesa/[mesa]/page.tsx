import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "../../util";
import { MesaDetalhe, type ComandaMesa } from "./mesa-detalhe";

export default async function MesaPage({
  params,
}: {
  params: Promise<{ mesa: string }>;
}) {
  const { mesa: mesaRaw } = await params;
  const mesa = decodeURIComponent(mesaRaw);
  const supabase = await createClient();

  const { data: cfgRows } = await supabase.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const fator = 1 + servicoAgora(cfg) / 100;

  const { data: comandas } = await supabase
    .from("pdv_comandas")
    .select("id, numero, aberta_em, valor_buffet, buffet_pago, buffet_valor_pago")
    .eq("mesa", mesa)
    .eq("status", "aberta")
    .order("numero");

  const comIds = (comandas ?? []).map((c) => c.id as string);
  const itensPorCom = new Map<string, ComandaMesa["itens"]>();
  if (comIds.length) {
    const { data: itc } = await supabase
      .from("pdv_comanda_itens")
      .select("id, comanda_id, descricao, qtd, preco_unit, pago, valor_pago")
      .in("comanda_id", comIds)
      .order("criado_em");
    for (const i of itc ?? []) {
      const arr = itensPorCom.get(i.comanda_id as string) ?? [];
      arr.push({
        id: i.id as string,
        descricao: (i.descricao as string) || "Item",
        qtd: Number(i.qtd),
        preco: Number(i.preco_unit),
        pago: !!i.pago,
        valorPago: Number(i.valor_pago ?? 0),
      });
      itensPorCom.set(i.comanda_id as string, arr);
    }
  }

  const dados: ComandaMesa[] = (comandas ?? []).map((c) => ({
    id: c.id as string,
    numero: c.numero as number,
    abertaEm: (c.aberta_em as string) ?? null,
    buffet:
      Number(c.valor_buffet ?? 0) > 0
        ? { valor: Number(c.valor_buffet), pago: !!c.buffet_pago, valorPago: Number(c.buffet_valor_pago ?? 0) }
        : null,
    itens: itensPorCom.get(c.id as string) ?? [],
  }));

  return <MesaDetalhe mesa={mesa} comandas={dados} fator={fator} />;
}
