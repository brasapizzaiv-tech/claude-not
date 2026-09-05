"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deYmd, diasDaSemana } from "@/lib/equipe";

export type Turno = "dia" | "noite";

// Marca/desmarca que a pessoa trabalhou naquele dia/turno.
export async function marcarPresenca(colaboradorId: string, data: string, turno: Turno, marcar: boolean) {
  const supabase = await createClient();
  if (marcar) {
    const { error } = await supabase
      .from("presencas")
      .upsert({ colaborador_id: colaboradorId, data, turno }, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: error.message };
  } else {
    const { error } = await supabase.from("presencas").delete().match({ colaborador_id: colaboradorId, data, turno });
    if (error) return { erro: error.message };
  }
  return { ok: true };
}

// Valor do 10% arrecadado na noite (digitado à mão por enquanto).
export async function salvarDezPorCento(data: string, valor: number, obs?: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dez_por_cento_noites")
    .upsert({ data, valor: Math.max(0, valor || 0), obs: obs?.trim() || null }, { onConflict: "data" });
  if (error) return { erro: error.message };
  return { ok: true };
}

// Preenche a semana com a escala fixa de cada pessoa (dias_dia / dias_noite).
// Só acrescenta — não apaga o que já foi marcado à mão.
export async function preencherEscalaFixa(segunda: string) {
  const supabase = await createClient();
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, dias_dia, dias_noite")
    .eq("ativo", true)
    .eq("esporadico", false);
  const linhas: { colaborador_id: string; data: string; turno: Turno }[] = [];
  for (const d of diasDaSemana(segunda)) {
    const dow = deYmd(d).getDay();
    for (const c of (colabs ?? []) as { id: string; dias_dia: number[] | null; dias_noite: number[] | null }[]) {
      if (c.dias_dia?.includes(dow)) linhas.push({ colaborador_id: c.id, data: d, turno: "dia" });
      if (c.dias_noite?.includes(dow)) linhas.push({ colaborador_id: c.id, data: d, turno: "noite" });
    }
  }
  if (linhas.length) {
    const { error } = await supabase
      .from("presencas")
      .upsert(linhas, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: error.message };
  }
  revalidatePath("/colaboradores/semana");
  return { ok: true, n: linhas.length };
}

// Cadastro rápido de um free esporádico direto da tela da semana.
export async function criarEsporadico(nome: string, valorDia: number | null, valorNoite: number | null) {
  const supabase = await createClient();
  const n = nome.trim();
  if (!n) return { erro: "Informe o nome." };
  const { data, error } = await supabase
    .from("colaboradores")
    .insert({
      nome: n,
      token: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      esporadico: true,
      turno: valorDia && valorNoite ? "ambos" : valorDia ? "dia" : "noite",
      vinculo: "freelance",
      valor_dia: valorDia,
      valor_noite: valorNoite,
      recebe_10: !!valorNoite,
    })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  revalidatePath("/colaboradores");
  return { ok: true, id: data.id as string };
}
