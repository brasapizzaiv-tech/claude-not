import { createClient } from "@/lib/supabase/server";
import { Board, type PedidoBoard, type EntregadorOpt } from "./board";

export const metadata = { title: "Delivery · Brasa" };

// (fora do componente por causa da regra de pureza do React)
const agoraMs = () => Date.now();

// Pedidos do delivery — layout novo (out/2026, protótipo em
// docs/referencia-layout/pedidos-delivery.html): abre na LISTA com o painel
// do pedido ao lado; o quadro de colunas e o mapa ficam a um botão.
export default async function DeliveryPage() {
  const agora = agoraMs();
  const supabase = await createClient();

  const [{ data: pedidosRaw }, { data: entregadores }, { data: cfgMapa }] = await Promise.all([
    supabase
      .from("delivery_pedidos")
      .select(
        "id, comanda_id, nome, telefone, tipo, logradouro, numero_casa:numero, complemento, bairro, cidade, status, origem, forma_pagamento, pago, taxa_entrega, desconto, criado_em, previsao_em, agendado_para, aceito_em, preparo_em, pronto_em, saiu_em, entregue_em, entregador_id, lat, lng, pdv_comandas(numero)",
      )
      .order("criado_em", { ascending: false })
      .limit(120),
    supabase.from("entregadores").select("id, nome, ultima_lat, ultima_lng, ultima_pos_em").eq("ativo", true).order("nome"),
    supabase.from("delivery_config").select("origem_lat, origem_lng").maybeSingle(),
  ]);
  const cfgM = cfgMapa as { origem_lat?: number | null; origem_lng?: number | null } | null;
  const origemMapa = cfgM?.origem_lat != null && cfgM?.origem_lng != null
    ? { lat: Number(cfgM.origem_lat), lng: Number(cfgM.origem_lng) }
    : null;

  const linhas = (pedidosRaw as unknown as (Omit<PedidoBoard, "numero" | "subtotal" | "entregadorNome" | "itens"> & {
    comanda_id: string | null;
    pdv_comandas: { numero: number } | { numero: number }[] | null;
  })[]) ?? [];

  // Itens (pra lista mostrar o resumo e o painel a conta) numa consulta só.
  const comandaIds = [...new Set(linhas.map((l) => l.comanda_id).filter(Boolean))] as string[];
  const itensDe = new Map<string, PedidoBoard["itens"]>();
  for (let i = 0; i < comandaIds.length; i += 200) {
    const { data: itens } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, descricao, qtd, preco_unit")
      .in("comanda_id", comandaIds.slice(i, i + 200))
      .order("criado_em")
      .limit(5000);
    for (const it of itens ?? []) {
      const lista = itensDe.get(it.comanda_id as string) ?? [];
      lista.push({ descricao: it.descricao as string, qtd: Number(it.qtd), preco: Number(it.preco_unit || 0) });
      itensDe.set(it.comanda_id as string, lista);
    }
  }

  const entrMap = new Map((entregadores ?? []).map((e) => [e.id, e.nome]));
  const pedidos: PedidoBoard[] = linhas.map((l) => {
    const c = Array.isArray(l.pdv_comandas) ? l.pdv_comandas[0] : l.pdv_comandas;
    const itens = itensDe.get(l.comanda_id ?? "") ?? [];
    return {
      ...l,
      numero: c?.numero ?? null,
      itens,
      subtotal: Math.round(itens.reduce((s, i) => s + i.qtd * i.preco, 0) * 100) / 100,
      entregadorNome: l.entregador_id ? entrMap.get(l.entregador_id) ?? null : null,
    };
  });

  return (
    <Board
      pedidos={pedidos}
      entregadores={((entregadores ?? []) as { id: string; nome: string }[]).map((e) => ({ id: e.id, nome: e.nome })) as EntregadorOpt[]}
      boys={((entregadores ?? []) as { id: string; nome: string; ultima_lat: number | null; ultima_lng: number | null; ultima_pos_em: string | null }[])
        .filter((e) => e.ultima_lat != null && e.ultima_lng != null && e.ultima_pos_em && agora - new Date(e.ultima_pos_em).getTime() < 20 * 60000)
        .map((e) => ({ id: e.id, nome: e.nome, lat: Number(e.ultima_lat), lng: Number(e.ultima_lng), em: e.ultima_pos_em as string }))}
      origemMapa={origemMapa}
      googleKey={process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || null}
    />
  );
}
