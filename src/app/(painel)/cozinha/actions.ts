"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import type { PedidoRodizio } from "@/lib/rodizio";

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
  if (error) return { ok: false as const, mensagem: error.message };
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
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/cozinha");
  return { ok: true as const };
}
