"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function novoToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Salva o colaborador e, junto, o perfil de folga dele (se marcado). Mantém o
// token (link pessoal) sincronizado entre colaborador e folga.
export async function salvarColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;
  const whatsapp = (formData.get("whatsapp") as string)?.trim() || null;
  const fazContagem = formData.get("faz_contagem") === "on";
  const temFolga = formData.get("tem_folga") === "on";

  let colaboradorId = id;
  let token: string | null = null;

  if (id) {
    await supabase
      .from("colaboradores")
      .update({ nome, whatsapp, faz_contagem: fazContagem })
      .eq("id", id);
    token = (await supabase.from("colaboradores").select("token").eq("id", id).maybeSingle()).data?.token ?? null;
    if (!token) {
      token = novoToken();
      await supabase.from("colaboradores").update({ token }).eq("id", id);
    }
  } else {
    token = novoToken();
    const { data } = await supabase
      .from("colaboradores")
      .insert({ nome, whatsapp, token, faz_contagem: fazContagem })
      .select("id")
      .single();
    colaboradorId = data?.id ?? null;
  }
  if (!colaboradorId) return;

  // perfil de folga
  const existente = (
    await supabase.from("folgas_funcionarios").select("id").eq("colaborador_id", colaboradorId).maybeSingle()
  ).data;

  if (temFolga) {
    const grupo = (formData.get("grupo") as string) || "almoco";
    const vinculo = (formData.get("vinculo") as string) || "Freelance";
    const funcao = (formData.get("funcao") as string)?.trim() || null;
    const dias = formData.getAll("dias").map((d) => Number(d)).filter((n) => n >= 0);
    const grupo2 = (formData.get("grupo2") as string) || null;
    const dias2 = grupo2 ? formData.getAll("dias2").map((d) => Number(d)).filter((n) => n >= 0) : null;
    const gerente = formData.get("gerente") === "on";

    const row = {
      nome, grupo, vinculo, funcao, dias, grupo2: grupo2 || null, dias2,
      gerente, ativo: true, colaborador_id: colaboradorId, token,
    };
    if (existente) {
      await supabase.from("folgas_funcionarios").update(row).eq("id", existente.id);
    } else {
      await supabase.from("folgas_funcionarios").insert(row);
    }
  } else if (existente) {
    // desmarcou folga: apenas desativa o perfil (mantém o histórico de pedidos).
    await supabase.from("folgas_funcionarios").update({ ativo: false }).eq("id", existente.id);
  }

  revalidatePath("/colaboradores");
  revalidatePath("/folgas");
}

// (Re)gera o link pessoal e sincroniza com o perfil de folga.
export async function gerarTokenColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const token = novoToken();
  await supabase.from("colaboradores").update({ token }).eq("id", id);
  await supabase.from("folgas_funcionarios").update({ token }).eq("colaborador_id", id);
  revalidatePath("/colaboradores");
  revalidatePath("/folgas");
}

// Zera o PIN do colaborador (ele cria um novo no próximo acesso ao app).
export async function zerarPinColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ pin: null }).eq("id", id);
  revalidatePath("/colaboradores");
}

export async function excluirColaborador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ ativo: false }).eq("id", id);
  await supabase.from("folgas_funcionarios").update({ ativo: false }).eq("colaborador_id", id);
  revalidatePath("/colaboradores");
  revalidatePath("/folgas");
}
