import { createClient } from "@/lib/supabase/server";
import { Board, type PedidoBoard, type EntregadorOpt } from "./board";
import { empresaAtualId } from "@/lib/empresa";
import { AvisoSaude } from "@/components/aviso-saude";
import { buscarTodas } from "@/lib/supabase/todas";
import Link from "next/link";

export const metadata = { title: "Delivery" };

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
        "id, comanda_id, nome, telefone, tipo, logradouro, numero_casa:numero, complemento, bairro, cidade, status, origem, forma_pagamento, pago, taxa_entrega, desconto, criado_em, previsao_em, agendado_para, aceito_em, preparo_em, pronto_em, saiu_em, entregue_em, entregador_id, lat, lng, turno, turno_data, numero_turno, pdv_comandas(numero)",
      )
      .order("criado_em", { ascending: false })
      .limit(120),
    supabase.from("entregadores").select("id, nome, ultima_lat, ultima_lng, ultima_pos_em").eq("ativo", true).order("nome"),
    supabase.from("delivery_config").select("origem_lat, origem_lng").maybeSingle(),
  ]);
  // DEL-12: entregue e não recebido de DIA ANTERIOR sumia de todas as telas
  // (a lista e a trava do fechamento só olham o dia). Fica num aviso aqui até alguém receber.
  const hojeIni = `${new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00-03:00`;
  const { data: velhosRaw } = await supabase
    .from("delivery_pedidos")
    .select("id, nome, numero_turno, forma_pagamento, entregue_em")
    .eq("status", "entregue").eq("pago", false).lt("entregue_em", hojeIni)
    .order("entregue_em").limit(30);
  const semReceber = (velhosRaw as { id: string; nome: string; numero_turno: number | null; forma_pagamento: string | null; entregue_em: string }[]) ?? [];
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
    const { data: itens } = await buscarTodas<Record<string, unknown>>((de, ate) => supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, descricao, qtd, preco_unit")
      .in("comanda_id", comandaIds.slice(i, i + 200))
      .order("criado_em").order("id").range(de, ate)).then((data) => ({ data }));
    for (const it of itens ?? []) {
      const lista = itensDe.get(it.comanda_id as string) ?? [];
      lista.push({ descricao: it.descricao as string, qtd: Number(it.qtd), preco: Number(it.preco_unit || 0) });
      itensDe.set(it.comanda_id as string, lista);
    }
  }

  const entrMap = new Map((entregadores ?? []).map((e) => [e.id, e.nome]));
  // Turno de agora (pro filtro já abrir nele).
  const empresaId = await empresaAtualId();
  const { data: agoraT } = empresaId ? await supabase.rpc("delivery_turno_de", { p_empresa: empresaId, p_quando: new Date(agora).toISOString() }) : { data: null };
  const t0 = ((agoraT as { turno: string; turno_data: string }[] | null) ?? [])[0];
  const turnoAtual = t0 ? `${t0.turno_data}|${t0.turno}` : null;

  const pedidos: PedidoBoard[] = linhas.map((l) => {
    const c = Array.isArray(l.pdv_comandas) ? l.pdv_comandas[0] : l.pdv_comandas;
    const itens = itensDe.get(l.comanda_id ?? "") ?? [];
    return {
      ...l,
      // Nº do delivery por turno (migration 0237); pedido antigo cai no da comanda.
      numero: (l as { numero_turno?: number | null }).numero_turno ?? c?.numero ?? null,
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
      turnoAtual={turnoAtual}
      aviso={<>
        <AvisoSaude empresaId={await empresaAtualId()} />
        {semReceber.length > 0 && (
          <div role="alert" className="cartao mb-3 p-4">
            <p className="font-semibold text-urgente-texto">{semReceber.length === 1 ? "1 pedido entregue em outro dia ainda não foi recebido" : `${semReceber.length} pedidos entregues em outros dias ainda não foram recebidos`}</p>
            <p className="mt-0.5 text-sm text-texto-suave">Abra o pedido e use &quot;Receber&quot;. Se não vai receber, cancele com o motivo.</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {semReceber.map((v) => (
                <li key={v.id}>
                  <Link href={`/delivery/${v.id}`} className="pilula pilula-urgente inline-flex min-h-11 items-center">
                    #{v.numero_turno ?? "?"} · {v.nome} · {new Date(v.entregue_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}{v.forma_pagamento ? ` · ${v.forma_pagamento}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>}
    />
  );
}
