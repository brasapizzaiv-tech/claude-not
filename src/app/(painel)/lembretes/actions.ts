"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f-]{36}$/i;

// Cria ou muda um lembrete (formulário do painel).
export async function salvarLembrete(fd: FormData) {
  await exigirAcesso("/lembretes");
  const t = (k: string) => String(fd.get(k) ?? "").trim();
  const id = t("id");
  const titulo = t("titulo").slice(0, 120);
  if (titulo.length < 2) return { ok: false as const, erro: "Escreva o lembrete." };
  const tipo = t("tipo") === "tarefa" ? "tarefa" : "aviso";
  const para = t("para") === "setores" ? "setores" : t("para") === "pessoas" ? "pessoas" : "todos";
  const setorIds = fd.getAll("setor_ids").map(String).filter((x) => UUID.test(x));
  const colaboradorIds = fd.getAll("colaborador_ids").map(String).filter((x) => UUID.test(x));
  if (para === "setores" && setorIds.length === 0) return { ok: false as const, erro: "Marque pelo menos um setor." };
  if (para === "pessoas" && colaboradorIds.length === 0) return { ok: false as const, erro: "Marque pelo menos uma pessoa." };
  const repeticao = ["uma_vez", "diario", "semanal", "mensal"].includes(t("repeticao")) ? t("repeticao") : "uma_vez";
  const data = t("data");
  if (!DATA.test(data)) return { ok: false as const, erro: repeticao === "uma_vez" ? "Escolha o dia." : "Escolha a partir de quando." };
  const ate = DATA.test(t("ate")) ? t("ate") : null;
  if (ate && ate < data) return { ok: false as const, erro: "O \"até\" é antes do começo." };
  const dias = fd.getAll("dias").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (repeticao === "semanal" && dias.length === 0) return { ok: false as const, erro: "Marque os dias da semana." };
  const diaMes = Number(t("dia_mes"));
  if (repeticao === "mensal" && !(diaMes >= 1 && diaMes <= 31)) return { ok: false as const, erro: "Escolha o dia do mês (1 a 31)." };
  const hora = HORA.test(t("hora")) ? t("hora") : null;

  const row = {
    titulo,
    texto: t("texto").slice(0, 1000) || null,
    tipo, para,
    setor_ids: para === "setores" ? setorIds : [],
    colaborador_ids: para === "pessoas" ? colaboradorIds : [],
    repeticao, data,
    ate: repeticao === "uma_vez" ? null : ate,
    dias: repeticao === "semanal" ? dias : [],
    dia_mes: repeticao === "mensal" ? diaMes : null,
    hora,
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("lembretes").update(row).eq("id", id);
    if (error) return { ok: false as const, erro: error.message };
  } else {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("lembretes").insert({ ...row, criado_por: auth.user?.id ?? null });
    if (error) return { ok: false as const, erro: error.message };
  }
  revalidatePath("/lembretes");
  return { ok: true as const };
}

export async function ligarLembrete(id: string, ativo: boolean) {
  await exigirAcesso("/lembretes");
  const supabase = await createClient();
  await supabase.from("lembretes").update({ ativo }).eq("id", id);
  revalidatePath("/lembretes");
}

export async function apagarLembrete(id: string) {
  await exigirAcesso("/lembretes");
  const supabase = await createClient();
  await supabase.from("lembretes").delete().eq("id", id);
  revalidatePath("/lembretes");
}
