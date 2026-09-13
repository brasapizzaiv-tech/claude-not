"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import type { AreaEntrega, PromoTele } from "@/lib/delivery-areas";

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

export async function salvarArea(input: { id?: string | null; nome: string; cor: string; valor: number; taxaMotoboy: number | null; tempoMin: number | null; poligono: [number, number][] }) {
  await exigirAcesso("/delivery");
  const nome = (input.nome || "").trim().slice(0, 60);
  if (nome.length < 2) return { ok: false as const, mensagem: "Dê um nome pra área." };
  const pol = (Array.isArray(input.poligono) ? input.poligono : []).filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pol.length < 3) return { ok: false as const, mensagem: "Desenhe a área no mapa (pelo menos 3 pontos)." };
  const supabase = await createClient();
  const row = {
    nome, cor: /^#[0-9a-f]{6}$/i.test(input.cor) ? input.cor : "#C78340",
    valor: Math.max(0, num(input.valor)),
    taxa_motoboy: input.taxaMotoboy != null && input.taxaMotoboy !== ("" as unknown) ? Math.max(0, num(input.taxaMotoboy)) : null,
    tempo_min: input.tempoMin ? Math.max(0, Math.round(num(input.tempoMin))) : null,
    poligono: pol,
  };
  const { data, error } = input.id
    ? await supabase.from("delivery_areas").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("delivery_areas").insert(row).select("id").single();
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const, id: (data as { id: string }).id };
}

export async function alternarArea(id: string, ativo: boolean) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_areas").update({ ativo }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const };
}

export async function excluirArea(id: string) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_areas").delete().eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const };
}

export async function salvarPromoTele(input: {
  id?: string | null; nome: string; tipo: PromoTele["tipo"]; valor: number; areaIds: string[] | null;
  pedidoMinimo: number | null; dias: number[] | null; horaIni: string | null; horaFim: string | null; validade: string | null;
}) {
  await exigirAcesso("/delivery");
  const nome = (input.nome || "").trim().slice(0, 60);
  if (nome.length < 2) return { ok: false as const, mensagem: "Dê um nome pra promoção (ex.: Quarta grátis)." };
  if (!["gratis", "percent", "valor"].includes(input.tipo)) return { ok: false as const, mensagem: "Tipo inválido." };
  const hhmm = (v: string | null) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null);
  const supabase = await createClient();
  const row = {
    nome, tipo: input.tipo, valor: Math.max(0, num(input.valor)),
    area_ids: input.areaIds && input.areaIds.length ? input.areaIds : null,
    pedido_minimo: input.pedidoMinimo && input.pedidoMinimo > 0 ? num(input.pedidoMinimo) : null,
    dias: input.dias && input.dias.length ? input.dias.filter((d) => d >= 0 && d <= 6) : null,
    hora_ini: hhmm(input.horaIni), hora_fim: hhmm(input.horaFim),
    validade: input.validade && /^\d{4}-\d{2}-\d{2}$/.test(input.validade) ? input.validade : null,
  };
  const { error } = input.id
    ? await supabase.from("delivery_promocoes_tele").update(row).eq("id", input.id)
    : await supabase.from("delivery_promocoes_tele").insert(row);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const };
}

export async function alternarPromoTele(id: string, ativo: boolean) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_promocoes_tele").update({ ativo }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const };
}

export async function excluirPromoTele(id: string) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_promocoes_tele").delete().eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/areas");
  return { ok: true as const };
}

export type AreaLinha = AreaEntrega;
export type PromoLinha = PromoTele;
