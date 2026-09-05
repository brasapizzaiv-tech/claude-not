"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { numBR, parseAniversario } from "@/lib/equipe";

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
  const fazEtiquetas = formData.get("faz_etiquetas") === "on";
  const fazContas = formData.get("faz_contas") === "on";
  const temFolga = formData.get("tem_folga") === "on";

  // Quadro de funcionários (migration 0126)
  const turno = (formData.get("turno") as string) || "dia";
  const simNao = (k: string) => { const v = formData.get(k); return v === "sim" ? true : v === "nao" ? false : null; };
  const diasDe = (k: string) => formData.getAll(k).map(Number).filter((n) => n >= 0 && n <= 6);
  const quadro = {
    nascimento: parseAniversario((formData.get("nascimento") as string) ?? ""),
    turno,
    vinculo: (formData.get("vinc") as string) === "clt" ? "clt" : "freelance",
    funcao: (formData.get("funcao_c") as string)?.trim() || null,
    salario_base: numBR(formData.get("salario_base")),
    valor_dia: numBR(formData.get("valor_dia")),
    valor_noite: numBR(formData.get("valor_noite")),
    recebe_10: formData.get("recebe_10") === "on",
    peso_10: numBR(formData.get("peso_10")) ?? 1,
    esporadico: formData.get("esporadico") === "on",
    filhos: simNao("filhos"),
    conjuge: simNao("conjuge"),
    uniforme_estilo: (formData.get("uniforme_estilo") as string)?.trim() || null,
    uniforme_qtd: numBR(formData.get("uniforme_qtd")),
    uniforme_tamanho: (formData.get("uniforme_tamanho") as string)?.trim() || null,
    dias_dia: diasDe("dias_dia"),
    dias_noite: diasDe("dias_noite"),
  };

  let colaboradorId = id;
  let token: string | null = null;

  if (id) {
    await supabase
      .from("colaboradores")
      .update({ nome, whatsapp, faz_contagem: fazContagem, faz_etiquetas: fazEtiquetas, faz_contas: fazContas, ...quadro })
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
      .insert({ nome, whatsapp, token, faz_contagem: fazContagem, faz_etiquetas: fazEtiquetas, faz_contas: fazContas, ...quadro })
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
  revalidatePath("/colaboradores/semana");
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
