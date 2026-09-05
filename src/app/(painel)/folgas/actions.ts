"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";

function ok() {
  revalidatePath("/folgas");
  return { ok: true as const };
}
function erro(mensagem: string) {
  return { ok: false as const, mensagem };
}

// ---- pedidos ----
export async function decidirPedido(id: number, aprovar: boolean, motivoNeg?: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("folgas_pedidos")
    .update({
      status: aprovar ? "Aprovado" : "Negado",
      motivo_negativa: aprovar ? null : (motivoNeg?.trim() || null),
      decidido_em: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function reabrirPedido(id: number) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("folgas_pedidos")
    .update({ status: "Pendente", motivo_negativa: null, decidido_em: null })
    .eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function lancarFolga(funcionarioId: number, data: string, motivo: string, grupoAlvo?: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  if (!funcionarioId || !data) return erro("Escolha a pessoa e a data.");
  const trava = (await supabase.from("folgas_bloqueios").select("motivo").eq("data", data).maybeSingle()).data;
  // gestão pode lançar mesmo com data travada (a trava só barra o app).
  void trava;
  const { error } = await supabase.from("folgas_pedidos").insert({
    funcionario_id: funcionarioId,
    data,
    motivo: motivo?.trim() || null,
    status: "Aprovado",
    origem: "gestao",
    grupo_alvo: grupoAlvo || null,
    decidido_em: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") return erro("Essa pessoa já tem folga nesse dia/turno.");
    return erro(error.message);
  }
  return ok();
}

export async function editarPedido(id: number, data: string, motivo: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("folgas_pedidos")
    .update({ data, motivo: motivo?.trim() || null })
    .eq("id", id);
  return error ? erro(error.message) : ok();
}

export async function excluirPedido(id: number) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase.from("folgas_pedidos").delete().eq("id", id);
  return error ? erro(error.message) : ok();
}

// ---- equipe ----
type FuncPayload = {
  id?: number;
  nome: string;
  grupo: string;
  vinculo: string;
  funcao: string | null;
  dias: number[];
  grupo2: string | null;
  dias2: number[] | null;
  gerente: boolean;
};

export async function salvarFuncionario(p: FuncPayload) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const nome = p.nome?.trim();
  if (!nome) return erro("Informe o nome.");
  const row = {
    nome,
    grupo: p.grupo,
    vinculo: p.vinculo,
    funcao: p.funcao?.trim() || null,
    dias: p.dias ?? [],
    grupo2: p.grupo2 || null,
    dias2: p.grupo2 ? (p.dias2 ?? []) : null,
    gerente: !!p.gerente,
  };
  if (p.id) {
    const { error } = await supabase.from("folgas_funcionarios").update(row).eq("id", p.id);
    if (error) return erro(error.message);
  } else {
    const { error } = await supabase.from("folgas_funcionarios").insert({ ...row, ativo: true });
    if (error) {
      if (error.code === "23505") return erro("Já existe alguém com esse nome.");
      return erro(error.message);
    }
  }
  return ok();
}

export async function definirAtivo(id: number, ativo: boolean) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase.from("folgas_funcionarios").update({ ativo }).eq("id", id);
  return error ? erro(error.message) : ok();
}

// Gera (ou regenera) o link pessoal do funcionário.
export async function gerarLink(id: number) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const { error } = await supabase.from("folgas_funcionarios").update({ token }).eq("id", id);
  if (error) return erro(error.message);
  revalidatePath("/folgas");
  return { ok: true as const, token };
}

// ---- limites padrão ----
export async function salvarLimites(rows: { grupo: string; dia_semana: number; limite: number | null }[]) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase
    .from("folgas_limites")
    .upsert(rows, { onConflict: "grupo,dia_semana" });
  return error ? erro(error.message) : ok();
}

// ---- ajuste de um dia específico (calendário) ----
export async function definirAjuste(data: string, grupo: string, limite: number) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  if (limite < 0) return erro("Limite inválido.");
  const { error } = await supabase
    .from("folgas_ajustes")
    .upsert({ data, grupo, limite }, { onConflict: "data,grupo" });
  return error ? erro(error.message) : ok();
}

export async function limparAjuste(data: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase.from("folgas_ajustes").delete().eq("data", data);
  return error ? erro(error.message) : ok();
}

// ---- travar / destravar data ----
export async function travarData(data: string, motivo: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const m = motivo?.trim();
  if (!m) return erro("Informe o motivo da trava.");
  const { error } = await supabase
    .from("folgas_bloqueios")
    .upsert({ data, motivo: m }, { onConflict: "data" });
  return error ? erro(error.message) : ok();
}

export async function destravarData(data: string) {
  await exigirAcesso("/folgas");
  const supabase = await createClient();
  const { error } = await supabase.from("folgas_bloqueios").delete().eq("data", data);
  return error ? erro(error.message) : ok();
}
