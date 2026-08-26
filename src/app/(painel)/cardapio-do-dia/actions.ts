"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DadosCardapio = {
  proteinas: string;
  carboidratos: string;
  especial: string;
  preco_livre: number | null;
  preco_kg: number | null;
};

// Salva o cardápio de um dia. publicado = true já solta no site.
export async function salvarCardapio(
  data: string,
  d: DadosCardapio,
  publicado: boolean,
) {
  const supabase = await createClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return { ok: false, erro: "Dia inválido." };

  const { error } = await supabase.from("cardapio_dia").upsert(
    {
      data,
      proteinas: d.proteinas.trim() || null,
      carboidratos: d.carboidratos.trim() || null,
      especial: d.especial.trim() || null,
      preco_livre: d.preco_livre,
      preco_kg: d.preco_kg,
      publicado,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "data" },
  );
  if (error) return { ok: false, erro: "Não consegui salvar." };

  revalidatePath("/cardapio-do-dia");
  return { ok: true };
}

// Tira do ar sem apagar o que foi escrito.
export async function despublicarCardapio(data: string) {
  const supabase = await createClient();
  await supabase.from("cardapio_dia").update({ publicado: false }).eq("data", data);
  revalidatePath("/cardapio-do-dia");
  return { ok: true };
}

export async function apagarCardapio(data: string) {
  const supabase = await createClient();
  await supabase.from("cardapio_dia").delete().eq("data", data);
  revalidatePath("/cardapio-do-dia");
  return { ok: true };
}
