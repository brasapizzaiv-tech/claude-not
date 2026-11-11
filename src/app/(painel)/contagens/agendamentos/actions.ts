"use server";
import { exigirAcesso } from "@/lib/permissoes-server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function salvarAgendamento(formData: FormData) {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;

  const frequencia = (formData.get("frequencia") as string) || "semanal";
  const modo = (formData.get("modo") as string) || "repetir_ultima";
  const horario = (formData.get("horario") as string) || "08:00";
  // CRN-04: a rotina roda de 15 em 15 min — arredonda pra rodada mais perto, no máximo 23:45.
  const [h0, m0] = horario.split(":").map(Number);
  const total = Math.min(23 * 60 + 45, Math.round(((Number.isFinite(h0) ? h0 : 8) * 60 + (Number.isFinite(m0) ? m0 : 0)) / 15) * 15);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const diaRaw = formData.get("dia_semana") as string;
  const dia_semana =
    frequencia === "diario" ? null : diaRaw ? Number(diaRaw) : 1;

  // Divisão personalizada: [{ categoria_id, colaborador_id }, ...]
  let divisao: { categoria_id: string; colaborador_id: string }[] | null = null;
  if (modo === "personalizado") {
    try {
      const arr = JSON.parse((formData.get("divisao") as string) || "[]");
      divisao = Array.isArray(arr)
        ? arr.filter((x) => x?.categoria_id && x?.colaborador_id)
        : [];
    } catch {
      divisao = [];
    }
  }

  const dados = {
    nome,
    frequencia,
    dia_semana,
    hora: Number.isFinite(h) ? h : 8,
    minuto: Number.isFinite(m) ? m : 0,
    modo,
    divisao,
  };

  if (id) {
    await supabase.from("contagem_agendamentos").update(dados).eq("id", id);
  } else {
    await supabase.from("contagem_agendamentos").insert({ ...dados, ativo: true });
  }
  revalidatePath("/contagens/agendamentos");
}

export async function alternarAgendamento(formData: FormData) {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "true";
  await supabase
    .from("contagem_agendamentos")
    .update({ ativo })
    .eq("id", id);
  revalidatePath("/contagens/agendamentos");
}

export async function excluirAgendamento(formData: FormData) {
  await exigirAcesso("/contagens");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("contagem_agendamentos").delete().eq("id", id);
  revalidatePath("/contagens/agendamentos");
}
