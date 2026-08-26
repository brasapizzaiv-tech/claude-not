"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DadosReserva = {
  nome: string;
  telefone: string;
  data: string;
  turno: string;
  chegada: string | null;
  adultos: number;
  criancas: number;
  lugar: string | null;
  mesa: string | null;
  ocasiao: string | null;
  observacao: string | null;
  status?: string;
};

const limpo = (s: string | null | undefined) => (s ?? "").trim() || null;

export async function criarReserva(d: DadosReserva) {
  const supabase = await createClient();
  const pessoas = Math.max(0, d.adultos) + Math.max(0, d.criancas);
  if (!d.nome.trim() || !d.telefone.trim() || !d.data)
    return { ok: false, erro: "Precisa de nome, telefone e dia." };
  if (pessoas < 1) return { ok: false, erro: "Quantas pessoas vão?" };

  const { error } = await supabase.from("reservas").insert({
    nome: d.nome.trim(),
    telefone: d.telefone.trim(),
    data: d.data,
    turno: d.turno,
    chegada: limpo(d.chegada),
    pessoas,
    adultos: d.adultos,
    criancas: d.criancas,
    lugar: limpo(d.lugar),
    ocasiao: limpo(d.ocasiao),
    observacao: limpo(d.observacao),
    status: d.status ?? "confirmada",
    origem: "interno",
  });
  if (error) return { ok: false, erro: "Não consegui salvar." };
  revalidatePath("/reservas");
  return { ok: true };
}

export async function salvarReserva(id: string, d: DadosReserva) {
  const supabase = await createClient();
  const pessoas = Math.max(0, d.adultos) + Math.max(0, d.criancas);
  if (pessoas < 1) return { ok: false, erro: "Precisa de pelo menos uma pessoa." };

  const { error } = await supabase
    .from("reservas")
    .update({
      nome: d.nome.trim(),
      telefone: d.telefone.trim(),
      data: d.data,
      turno: d.turno,
      chegada: limpo(d.chegada),
      pessoas,
      adultos: d.adultos,
      criancas: d.criancas,
      lugar: limpo(d.lugar),
      mesa: limpo(d.mesa),
      ocasiao: limpo(d.ocasiao),
      observacao: limpo(d.observacao),
      ...(d.status ? { status: d.status } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, erro: "Não consegui salvar." };
  revalidatePath("/reservas");
  return { ok: true };
}

// Confirmar, cancelar ou voltar para "nova".
export async function definirStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("reservas").update({ status }).eq("id", id);
  revalidatePath("/reservas");
  return { ok: true };
}

// Marca que a mesa chegou (ou desfaz).
export async function marcarChegou(id: string, chegou: boolean) {
  const supabase = await createClient();
  await supabase
    .from("reservas")
    .update({ chegou_em: chegou ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/reservas");
  return { ok: true };
}

export async function apagarReserva(id: string) {
  const supabase = await createClient();
  await supabase.from("reservas").delete().eq("id", id);
  revalidatePath("/reservas");
  return { ok: true };
}

export async function bloquearData(
  data: string,
  turno: string,
  motivo: string | null,
) {
  const supabase = await createClient();
  if (!data) return { ok: false, erro: "Escolha o dia." };
  await supabase
    .from("reservas_bloqueios")
    .insert({ data, turno, motivo: limpo(motivo) });
  revalidatePath("/reservas");
  return { ok: true };
}

export async function liberarBloqueio(id: string) {
  const supabase = await createClient();
  await supabase.from("reservas_bloqueios").delete().eq("id", id);
  revalidatePath("/reservas");
  return { ok: true };
}

export async function salvarLimites(
  linhas: { turno: string; max_reservas: number; max_pessoas: number; grupo_grande: number }[],
) {
  const supabase = await createClient();
  await supabase.from("reservas_limites").upsert(linhas, { onConflict: "turno" });
  revalidatePath("/reservas");
  return { ok: true };
}

export async function salvarMensagens(msgs: { chave: string; valor: string }[]) {
  const supabase = await createClient();
  await supabase.from("reservas_config").upsert(msgs, { onConflict: "chave" });
  revalidatePath("/reservas");
  return { ok: true };
}
