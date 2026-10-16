"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

// Turnos do delivery (migration 0237): troca a lista inteira de uma vez.
export async function salvarTurnosDelivery(lista: { nome: string; inicio: string; fim: string }[]) {
  await exigirAcesso("/delivery");
  const limpa = (lista ?? []).map((t) => ({ nome: (t.nome || "").trim().slice(0, 30), inicio: t.inicio, fim: t.fim }));
  if (limpa.length === 0) return { ok: false as const, mensagem: "Deixe pelo menos um turno." };
  if (limpa.some((t) => !t.nome)) return { ok: false as const, mensagem: "Dê um nome pra cada turno." };
  if (limpa.some((t) => !/^\d{2}:\d{2}$/.test(t.inicio) || !/^\d{2}:\d{2}$/.test(t.fim))) return { ok: false as const, mensagem: "Preencha o horário de começo e fim de cada turno." };
  if (new Set(limpa.map((t) => t.nome.toLowerCase())).size !== limpa.length) return { ok: false as const, mensagem: "Dois turnos com o mesmo nome." };
  if (limpa.some((t) => t.nome.toLowerCase() === "extra")) return { ok: false as const, mensagem: "\"Extra\" é o nome reservado pro horário fora dos turnos." };

  const supabase = await createClient();
  const { data: antes } = await supabase.from("delivery_turnos").select("id");
  const { error } = await supabase.from("delivery_turnos").insert(limpa.map((t, i) => ({ ...t, ordem: i + 1 })));
  if (error) return { ok: false as const, mensagem: error.message };
  const velhos = ((antes as { id: string }[]) ?? []).map((x) => x.id);
  if (velhos.length) await supabase.from("delivery_turnos").delete().in("id", velhos);
  revalidatePath("/delivery/config");
  revalidatePath("/delivery");
  return { ok: true as const };
}
