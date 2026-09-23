"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import type { StatusEvento } from "@/lib/eventos";

const STATUS: StatusEvento[] = ["marcado", "confirmado", "cancelado"];

function limpo(fd: FormData, campo: string) {
  const v = String(fd.get(campo) ?? "").trim();
  return v || null;
}

export async function salvarEvento(fd: FormData) {
  await exigirAcesso("/feriados");
  const id = String(fd.get("id") ?? "").trim();
  const data = String(fd.get("data") ?? "").trim();
  const titulo = String(fd.get("titulo") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false as const, erro: "Escolha a data do evento." };
  if (!titulo) return { ok: false as const, erro: "Diga o que é o evento." };

  // Quantas pessoas é o número que decide tudo o resto (cozinha, mesas,
  // escala), mas ninguém sabe o número exato na hora de marcar: zero é
  // resposta válida e quer dizer "ainda a combinar".
  const pessoas = Math.max(0, Math.min(2000, Number(fd.get("pessoas")) || 0));

  const linha = {
    data,
    hora: limpo(fd, "hora"),
    titulo,
    pessoas,
    lugar: limpo(fd, "lugar"),
    contato: limpo(fd, "contato"),
    telefone: limpo(fd, "telefone"),
    cardapio: limpo(fd, "cardapio"),
    observacao: limpo(fd, "observacao"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("eventos").update(linha).eq("id", id)
    : await supabase.from("eventos").insert(linha);
  if (error) return { ok: false as const, erro: error.message };

  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}

/** Marcado → confirmado → cancelado. O status muda sozinho de tela em tela, e
 *  por isso é um botão só, e não um formulário. */
export async function statusDoEvento(id: string, status: string) {
  await exigirAcesso("/feriados");
  if (!STATUS.includes(status as StatusEvento)) return { ok: false as const, erro: "Status inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("eventos").update({ status }).eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}

export async function excluirEvento(id: string) {
  await exigirAcesso("/feriados");
  const supabase = await createClient();
  const { error } = await supabase.from("eventos").delete().eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/feriados");
  revalidatePath("/mural");
  return { ok: true as const };
}
