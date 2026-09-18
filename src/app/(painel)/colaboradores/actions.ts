"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { numBR, parseAniversario } from "@/lib/equipe";
import { exigirAcesso } from "@/lib/permissoes-server";

function novoToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Salva o colaborador e, junto, o perfil de folga dele (se marcado). Mantém o
// token (link pessoal) sincronizado entre colaborador e folga.
export async function salvarColaborador(formData: FormData) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return { erro: "Informe o nome." };
  const whatsapp = (formData.get("whatsapp") as string)?.trim() || null;
  const fazContagem = formData.get("faz_contagem") === "on";
  const fazEtiquetas = formData.get("faz_etiquetas") === "on";
  const fazContas = formData.get("faz_contas") === "on";
  const fazGarcom = formData.get("faz_garcom") === "on";
  const fazCardapio = formData.get("faz_cardapio") === "on";
  const temFolga = formData.get("tem_folga") === "on";

  // Quadro de funcionários (migration 0126)
  const turno = (formData.get("turno") as string) || "dia";
  const simNao = (k: string) => { const v = formData.get(k); return v === "sim" ? true : v === "nao" ? false : null; };
  const diasDe = (k: string) => formData.getAll(k).map(Number).filter((n) => n >= 0 && n <= 6);
  const quadro = {
    nascimento: parseAniversario((formData.get("nascimento") as string) ?? ""),
    turno,
    vinculo: (formData.get("vinc") as string) === "clt" ? "clt" : "freelance",
    vinculo_noite:
      turno === "ambos" ? ((formData.get("vinc_noite") as string) === "clt" ? "clt" : "freelance") : null,
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
    const { error } = await supabase
      .from("colaboradores")
      .update({ nome, whatsapp, faz_contagem: fazContagem, faz_etiquetas: fazEtiquetas, faz_contas: fazContas, faz_garcom: fazGarcom, faz_cardapio: fazCardapio, ...quadro })
      .eq("id", id);
    if (error) return { erro: `Não salvou: ${error.message}` };
    token = (await supabase.from("colaboradores").select("token").eq("id", id).maybeSingle()).data?.token ?? null;
    if (!token) {
      token = novoToken();
      await supabase.from("colaboradores").update({ token }).eq("id", id);
    }
  } else {
    token = novoToken();
    const { data, error } = await supabase
      .from("colaboradores")
      .insert({ nome, whatsapp, token, faz_contagem: fazContagem, faz_etiquetas: fazEtiquetas, faz_contas: fazContas, faz_garcom: fazGarcom, faz_cardapio: fazCardapio, ...quadro })
      .select("id")
      .single();
    if (error) return { erro: `Não salvou: ${error.message}` };
    colaboradorId = data?.id ?? null;
  }
  if (!colaboradorId) return { erro: "Não salvou." };

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
  return { ok: true };
}

// (Re)gera o link pessoal e sincroniza com o perfil de folga.
export async function gerarTokenColaborador(formData: FormData) {
  await exigirAcesso("/colaboradores");
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
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ pin: null }).eq("id", id);
  revalidatePath("/colaboradores");
}

// Desligar (demitido, pediu a conta, parou de trabalhar): fica no cadastro com
// data e motivo, sai das listas e PERDE O ACESSO AO APP na hora — o link
// pessoal (token) e o PIN são apagados, então nenhum atalho salvo no celular
// abre mais (o app e todas as telas conferem token + ativo no servidor).
export async function desligarColaborador(id: string, motivo: string, data: string) {
  await exigirAcesso("/colaboradores");
  const mot = (motivo || "").trim();
  if (mot.length < 3) return { ok: false as const, mensagem: "Escreva o motivo do desligamento." };
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from("colaboradores")
    .update({ ativo: false, desligado_em: dt, desligado_motivo: mot, token: null, pin: null })
    .eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  await supabase.from("folgas_funcionarios").update({ ativo: false }).eq("colaborador_id", id);
  revalidatePath("/colaboradores");
  revalidatePath("/folgas");
  return { ok: true as const };
}

// Voltou a trabalhar: reativa o cadastro. O link do app é gerado de novo
// ("Gerar link") e a pessoa cria um PIN novo.
export async function reativarColaborador(formData: FormData) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("colaboradores").update({ ativo: true, desligado_em: null, desligado_motivo: null }).eq("id", id);
  revalidatePath("/colaboradores");
}
