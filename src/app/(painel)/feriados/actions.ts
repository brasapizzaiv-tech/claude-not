"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { calendarioOficial, type SituacaoFeriado } from "@/lib/feriados";

const SITUACOES: SituacaoFeriado[] = ["indefinido", "abre", "fecha", "especial"];

function hojeSp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Marca o que a casa faz no dia. É a única coisa que a equipe precisa saber,
 *  e por isso é um clique só nas telas. */
export async function decidirFeriado(id: string, situacao: string, detalhe: string) {
  await exigirAcesso("/feriados");
  if (!SITUACOES.includes(situacao as SituacaoFeriado)) return { ok: false as const, erro: "Situação inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("feriados")
    .update({ situacao, detalhe: detalhe.trim() || null })
    .eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}

/** Data que não está no calendário oficial: aniversário da cidade, emenda,
 *  o dia da confraternização da equipe. */
export async function criarFeriado(fd: FormData) {
  await exigirAcesso("/feriados");
  const data = String(fd.get("data") ?? "").trim();
  const nome = String(fd.get("nome") ?? "").trim();
  const situacao = String(fd.get("situacao") ?? "indefinido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false as const, erro: "Escolha uma data." };
  if (!nome) return { ok: false as const, erro: "Dê um nome à data." };
  if (!SITUACOES.includes(situacao as SituacaoFeriado)) return { ok: false as const, erro: "Situação inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("feriados").insert({ data, nome, situacao });
  // A data é única por empresa: repetir é erro de digitação, não um feriado novo.
  if (error) {
    return {
      ok: false as const,
      erro: error.code === "23505" ? "Já existe uma data cadastrada nesse dia." : error.message,
    };
  }
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}

export async function excluirFeriado(id: string) {
  await exigirAcesso("/feriados");
  const supabase = await createClient();
  const { error } = await supabase.from("feriados").delete().eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}

/** Traz as datas do calendário oficial que ainda não estão cadastradas, todas
 *  como "a definir". Não mexe em nenhuma decisão já tomada: o que já está lá
 *  fica como está. */
export async function trazerCalendario() {
  await exigirAcesso("/feriados");
  const supabase = await createClient();
  const hoje = hojeSp();

  const { data: jaTem } = await supabase.from("feriados").select("data").gte("data", hoje);
  const conhecidas = new Set(((jaTem as { data: string }[]) ?? []).map((f) => String(f.data).slice(0, 10)));

  const novas = calendarioOficial(hoje).filter((f) => !conhecidas.has(f.data));
  if (novas.length === 0) {
    revalidatePath("/feriados");
    return { ok: true as const, adicionados: 0 };
  }

  const { error } = await supabase.from("feriados").insert(novas.map((f) => ({ data: f.data, nome: f.nome })));
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const, adicionados: novas.length };
}
