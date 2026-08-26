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

const GRUPOS = ["proteinas", "carboidratos", "especial"] as const;
export type Grupo = (typeof GRUPOS)[number];

const linhas = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// Salva o cardápio de um dia. publicado = true já solta no site.
// Todo item usado entra (ou sobe) no catálogo, então a busca vai ficando
// melhor sozinha conforme vocês publicam os dias.
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

  await contarUsos(
    { proteinas: linhas(d.proteinas), carboidratos: linhas(d.carboidratos), especial: linhas(d.especial) },
  );

  revalidatePath("/cardapio-do-dia");
  return { ok: true };
}

// Garante o item no catálogo e soma 1 no contador de usos.
async function contarUsos(porGrupo: Record<Grupo, string[]>) {
  const supabase = await createClient();
  const { data } = await supabase.from("cardapio_itens").select("id, grupo, nome, usos");
  const atuais = (data as { id: string; grupo: string; nome: string; usos: number }[]) ?? [];

  for (const grupo of GRUPOS) {
    for (const nome of porGrupo[grupo]) {
      const achado = atuais.find((i) => i.grupo === grupo && i.nome === nome);
      if (achado) {
        await supabase
          .from("cardapio_itens")
          .update({ usos: achado.usos + 1, ativo: true })
          .eq("id", achado.id);
      } else {
        await supabase.from("cardapio_itens").insert({ grupo, nome, usos: 1 });
      }
    }
  }
}

// Cadastra itens no catálogo (um por linha) sem mexer em nenhum dia.
export async function criarItens(grupo: Grupo, texto: string) {
  const supabase = await createClient();
  const nomes = [...new Set(linhas(texto))];
  if (nomes.length === 0) return { ok: false, erro: "Nada para cadastrar." };

  const { error } = await supabase
    .from("cardapio_itens")
    .upsert(
      nomes.map((nome) => ({ grupo, nome })),
      { onConflict: "grupo,nome", ignoreDuplicates: true },
    );
  if (error) return { ok: false, erro: "Não consegui cadastrar." };

  revalidatePath("/cardapio-do-dia");
  return { ok: true, total: nomes.length };
}

// Tira o item da busca (não mexe nos cardápios já publicados).
export async function apagarItem(id: string) {
  const supabase = await createClient();
  await supabase.from("cardapio_itens").delete().eq("id", id);
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
