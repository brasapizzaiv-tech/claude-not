"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import type { PedidoRodizio } from "@/lib/rodizio";
import { explicarErro } from "@/lib/erro-amigavel";
import { DELIVERY_PRONTO_SOME_SEG, type PedidoCozinha } from "@/lib/cozinha-delivery";
import { agendadoLiberado, lerLibera } from "@/lib/delivery-agendados";
import { avisarPedido } from "@/lib/whatsapp";

const CAMPOS = "id, mesa, sabor, tipo, fracao, quantidade, observacao, status, criado_em, forno_em, pronto_em, garcom";

// Fila atual (pendentes + no forno + prontos recentes) pro tablet.
export async function filaRodizio(): Promise<PedidoRodizio[]> {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("pedidos_rodizio")
    .select(CAMPOS)
    .or(`status.in.(pendente,forno),and(status.eq.pronto,pronto_em.gte.${desde})`)
    .order("criado_em", { ascending: true })
    .limit(200);
  return (data as PedidoRodizio[]) ?? [];
}

// pendente → forno → pronto. Só avança; cada passo carimba a hora.
export async function avancarRodizio(id: string, para: "forno" | "pronto") {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const de = para === "forno" ? "pendente" : "forno";
  const carimbo = para === "forno" ? { forno_em: new Date().toISOString() } : { pronto_em: new Date().toISOString() };
  const { data, error } = await supabase
    .from("pedidos_rodizio")
    .update({ status: para, ...carimbo })
    .eq("id", id)
    .eq("status", de) // se outro tablet já avançou, não volta nem repete
    .select("id");
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  if (!data || data.length === 0) return { ok: false as const, mensagem: "Este pedido já mudou de status." };
  revalidatePath("/cozinha");
  return { ok: true as const };
}

export async function cancelarRodizio(id: string) {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pedidos_rodizio")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pendente", "forno"]);
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  revalidatePath("/cozinha");
  return { ok: true as const };
}

// ── Delivery no tablet da cozinha (KDS) ─────────────────────────────────────
// Mostra o que já foi pra cozinha (aceito/em preparo), os prontos recentes e
// os agendados guardados pra mais tarde. Convênio (Kern) fica de fora: sai por
// etiqueta no app do convênio.
export async function filaDeliveryCozinha(): Promise<PedidoCozinha[]> {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const agora = Date.now();
  const desdeCriado = new Date(agora - 24 * 3600 * 1000).toISOString();
  const prontoDesde = new Date(agora - (DELIVERY_PRONTO_SOME_SEG + 30) * 1000).toISOString();
  const [{ data: peds }, { data: cfg }] = await Promise.all([
    supabase
      .from("delivery_pedidos")
      .select("id, numero_turno, nome, tipo, status, agendado_para, previsao_em, preparo_em, aceito_em, criado_em, pronto_em, observacao, origem, comanda_id, pdv_comandas(numero)")
      .gte("criado_em", desdeCriado)
      .or(`status.in.(aceito,em_preparo),and(status.eq.pronto,pronto_em.gte.${prontoDesde})`)
      .order("criado_em")
      .limit(150),
    supabase.from("delivery_config").select("config").limit(1).maybeSingle(),
  ]);
  const libera = lerLibera((cfg as { config?: unknown } | null)?.config);
  type Linha = {
    id: string; numero_turno: number | null; nome: string; tipo: string; status: string;
    agendado_para: string | null; previsao_em: string | null; preparo_em: string | null; aceito_em: string | null;
    criado_em: string; pronto_em: string | null; observacao: string | null; comanda_id: string | null; origem: string | null;
    pdv_comandas: { numero: number } | { numero: number }[] | null;
  };
  const linhas = ((peds as unknown as Linha[]) ?? [])
    // Agendado pra outro dia ainda não interessa à cozinha.
    .filter((l) => l.origem !== "convenio")
    .filter((l) => !l.agendado_para || Date.parse(l.agendado_para) < agora + 18 * 3600 * 1000);
  const comandas = [...new Set(linhas.map((l) => l.comanda_id).filter(Boolean))] as string[];
  const itensDe = new Map<string, { qtd: number; descricao: string }[]>();
  if (comandas.length) {
    const { data: itens } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, qtd, descricao")
      .in("comanda_id", comandas)
      .order("criado_em").order("id")
      .limit(1000);
    for (const it of (itens as { comanda_id: string; qtd: number; descricao: string }[]) ?? []) {
      const l = itensDe.get(it.comanda_id) ?? [];
      l.push({ qtd: Number(it.qtd), descricao: it.descricao });
      itensDe.set(it.comanda_id, l);
    }
  }
  return linhas.map((l) => {
    const c = Array.isArray(l.pdv_comandas) ? l.pdv_comandas[0] : l.pdv_comandas;
    const naCozinha = l.status === "em_preparo" || l.status === "pronto"
      || (l.status === "aceito" && (!l.agendado_para || agendadoLiberado(l.agendado_para, libera, agora)));
    return {
      id: l.id,
      numero: l.numero_turno ?? c?.numero ?? null,
      nome: l.nome,
      tipo: l.tipo === "retirada" ? "retirada" : "entrega",
      status: l.status as PedidoCozinha["status"],
      naCozinha,
      agendado_para: l.agendado_para,
      previsao_em: l.previsao_em,
      desde: l.preparo_em ?? l.aceito_em ?? l.criado_em,
      pronto_em: l.pronto_em,
      observacao: l.observacao,
      itens: itensDe.get(l.comanda_id ?? "") ?? [],
    };
  });
}

// Cozinha marca pronto: vale o mesmo do painel do delivery (carimbo + aviso de
// "pronto pra retirar" no WhatsApp quando é retirada).
export async function deliveryPronto(id: string) {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_pedidos")
    .update({ status: "pronto", pronto_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["aceito", "em_preparo"]) // outro aparelho já mudou: não repete
    .select("id");
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  if (!data || data.length === 0) return { ok: false as const, mensagem: "Este pedido já mudou de etapa." };
  await avisarPedido(id, "pronto").catch(() => null);
  revalidatePath("/delivery");
  return { ok: true as const };
}

// Toque errado: volta pra "em preparo" enquanto o pronto ainda está na tela
// (e o pedido não saiu com o motoboy).
export async function deliveryVoltarPreparo(id: string) {
  await exigirAcesso("/cozinha");
  const supabase = await createClient();
  const limite = new Date(Date.now() - (DELIVERY_PRONTO_SOME_SEG + 60) * 1000).toISOString();
  const { data, error } = await supabase
    .from("delivery_pedidos")
    .update({ status: "em_preparo", pronto_em: null })
    .eq("id", id)
    .eq("status", "pronto")
    .gte("pronto_em", limite)
    .select("id");
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  if (!data || data.length === 0) return { ok: false as const, mensagem: "Este pedido já seguiu adiante." };
  revalidatePath("/delivery");
  return { ok: true as const };
}
