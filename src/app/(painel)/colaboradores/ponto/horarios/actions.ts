"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { periodosDoDia, type DiaHorarioSalvo } from "@/lib/ponto-horarios-core";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export type HorarioEntrada = {
  id?: string;
  nome: string;
  ativo: boolean;
  dias: Record<string, DiaHorarioSalvo>;
  tolerancia_extra: number;
  tolerancia_falta: number;
  limite_extra: number;
  limite_falta: number;
  noturno_inicio: string;
  noturno_fim: string;
};

function revalidar() {
  revalidatePath("/colaboradores/ponto");
  revalidatePath("/colaboradores/ponto/horarios");
  revalidatePath("/colaboradores/assiduidade");
  revalidatePath("/colaboradores");
}

const minutos = (n: unknown, padrao: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 && v <= 120 ? v : padrao;
};

/** Cria ou altera um horário (tela Editar horário). Devolve o id. */
export async function salvarHorario(h: HorarioEntrada) {
  await exigirAcesso("/colaboradores");
  const nome = (h.nome ?? "").trim().slice(0, 80);
  if (nome.length < 2) return { ok: false as const, erro: "Dê um nome pro horário." };
  if (!HORA.test(h.noturno_inicio) || !HORA.test(h.noturno_fim)) return { ok: false as const, erro: "Confira o horário noturno." };
  const dias: Record<string, DiaHorarioSalvo> = {};
  for (let dow = 0; dow <= 6; dow++) {
    const d = h.dias?.[String(dow)];
    if (!d) continue;
    const brutos = (d.p ?? []).filter(([e, s]) => e || s);
    if (brutos.some(([e, s]) => !HORA.test(e) || !HORA.test(s))) return { ok: false as const, erro: "Preencha entrada e saída de cada período (hh:mm)." };
    const p = periodosDoDia({ p: brutos });
    if (!p.length && !d.compensado && !d.neutro) continue;
    dias[String(dow)] = { p, ...(d.almoco_livre ? { almoco_livre: true } : {}), ...(d.compensado ? { compensado: true } : {}), ...(d.neutro ? { neutro: true } : {}) };
  }
  const linha = {
    nome, ativo: !!h.ativo, dias,
    tolerancia_extra: minutos(h.tolerancia_extra, 5), tolerancia_falta: minutos(h.tolerancia_falta, 5),
    limite_extra: minutos(h.limite_extra, 10), limite_falta: minutos(h.limite_falta, 10),
    noturno_inicio: h.noturno_inicio, noturno_fim: h.noturno_fim,
  };
  const supabase = await createClient();
  if (h.id) {
    const { error } = await supabase.from("ponto_horarios").update(linha).eq("id", h.id);
    if (error) return { ok: false as const, erro: error.message };
    revalidar();
    return { ok: true as const, id: h.id };
  }
  const { data, error } = await supabase.from("ponto_horarios").insert(linha).select("id").single();
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const, id: (data as { id: string }).id };
}

/**
 * Coloca a pessoa num horário a partir de uma data (Histórico de horários do
 * RHiD): o horário anterior termina no dia antes; o que começava depois dessa
 * data é substituído. O espelho dos dias antes da data não muda.
 */
export async function definirHorarioPessoa(colaboradorId: string, horarioId: string, de: string) {
  await exigirAcesso("/colaboradores");
  if (!colaboradorId || !horarioId || !DATA.test(de)) return { ok: false as const, erro: "Escolha a pessoa, o horário e a data." };
  const supabase = await createClient();
  const { data: atuais } = await supabase.from("colaborador_horarios").select("id, horario_id, de, ate").eq("colaborador_id", colaboradorId);
  const lista = (atuais ?? []) as { id: string; horario_id: string; de: string; ate: string | null }[];
  const vigente = lista.find((v) => v.de < de && (!v.ate || v.ate >= de));
  if (vigente?.horario_id === horarioId && !vigente.ate) return { ok: true as const };
  const [a, m, d] = de.split("-").map(Number);
  const vespera = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  const { data: auth } = await supabase.auth.getUser();
  // O que começa nessa data ou depois sai (a troca nova manda daqui pra frente).
  const depois = lista.filter((v) => v.de >= de).map((v) => v.id);
  if (depois.length) await supabase.from("colaborador_horarios").delete().in("id", depois);
  if (vigente) await supabase.from("colaborador_horarios").update({ ate: vespera }).eq("id", vigente.id);
  const { error } = await supabase.from("colaborador_horarios").insert({ colaborador_id: colaboradorId, horario_id: horarioId, de, criado_por: auth.user?.id ?? null });
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const };
}

/** Apaga o horário se ninguém nunca usou; senão só desativa (o histórico aponta pra ele). */
export async function apagarHorario(id: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { count } = await supabase.from("colaborador_horarios").select("id", { count: "exact", head: true }).eq("horario_id", id);
  if (count) {
    await supabase.from("ponto_horarios").update({ ativo: false }).eq("id", id);
    revalidar();
    return { ok: true as const, desativado: true };
  }
  const { error } = await supabase.from("ponto_horarios").delete().eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const, desativado: false };
}
