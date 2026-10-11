"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";
import { marcarPresencasDoPonto, receberAfd } from "@/lib/ponto-server";
import { turnoDaBatida } from "@/lib/ponto-core";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidar() {
  revalidatePath("/colaboradores/ponto");
  revalidatePath("/colaboradores/assiduidade");
  revalidatePath("/colaboradores/semana");
}

/** AFD exportado do RHiD (histórico): mesma leitura do relógio; repetidas são ignoradas. */
export async function importarAfdRhid(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const empresaId = await empresaAtualId();
  const f = fd.get("arquivo");
  if (!empresaId || !(f instanceof File) || f.size === 0) return { ok: false as const, erro: "Escolha o arquivo AFD (.txt) exportado do RHiD." };
  if (f.size > 5 * 1024 * 1024) return { ok: false as const, erro: "Arquivo grande demais (máximo 5 MB). Exporte um período menor." };
  try {
    const r = await receberAfd(empresaId, "RHID-AFD", await f.text(), [], "afd");
    revalidar();
    if (r.recebidas === 0) return { ok: false as const, erro: "Não achei batidas nesse arquivo. Exporte o AFD no formato da Portaria 671." };
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : "erro ao importar" };
  }
}

/** Batida que a pessoa esqueceu: dia do turno + hora (até 04:59 = madrugada seguinte). */
export async function incluirBatida(colaboradorId: string, dia: string, hora: string, obs: string) {
  await exigirAcesso("/colaboradores");
  if (!DATA.test(dia) || !HORA.test(hora)) return { ok: false as const, erro: "Confira o dia e a hora." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("colaboradores").select("id, cpf, nome, bate_ponto").eq("id", colaboradorId).maybeSingle();
  const col = c as { id: string; cpf: string | null; nome: string; bate_ponto: boolean } | null;
  if (!col) return { ok: false as const, erro: "Pessoa não encontrada." };
  const madrugada = Number(hora.slice(0, 2)) < 5;
  const [a, m, d] = dia.split("-").map(Number);
  const diaCivil = madrugada ? new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10) : dia;
  const local = `${diaCivil}T${hora}:00-03:00`;
  const { data: turnoDia, turno } = turnoDaBatida(local);
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("ponto_batidas").insert({
    equipamento: "manual", nsr: Date.now(), data_hora: new Date(local).toISOString(), cpf: col.cpf ?? "",
    nome: col.nome, colaborador_id: col.id, data: turnoDia, turno, origem: "manual",
    obs: obs.trim().slice(0, 200) || null, criado_por: auth.user?.id ?? null,
  });
  if (error) return { ok: false as const, erro: error.message };
  const empresaId = await empresaAtualId();
  if (empresaId) await marcarPresencasDoPonto(empresaId, [{ colaboradorId: col.id, data: turnoDia }]);
  revalidar();
  return { ok: true as const };
}

export async function apagarBatidaManual(colaboradorId: string, dataHoraIso: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  await supabase.from("ponto_batidas").delete().eq("colaborador_id", colaboradorId).eq("origem", "manual").eq("data_hora", dataHoraIso);
  revalidar();
}

/** Justificativa de um ou mais dias: atestado (tira o prêmio) ou abono (não tira). Arquivo opcional. */
export async function justificar(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const colaborador = String(fd.get("colaborador_id") ?? "");
  const inicio = String(fd.get("inicio") ?? "");
  const fim = String(fd.get("fim") ?? "") || inicio;
  const tipo = fd.get("tipo") === "abono" ? "abono" : "atestado";
  if (!colaborador || !DATA.test(inicio) || !DATA.test(fim) || fim < inicio) return { ok: false as const, erro: "Escolha a pessoa e as datas." };
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  let arquivo: string | null = null;
  const f = fd.get("arquivo");
  if (f instanceof File && f.size > 0) {
    if (f.size > 8 * 1024 * 1024) return { ok: false as const, erro: "Arquivo grande demais (máximo 8 MB)." };
    if (!/^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(f.type)) return { ok: false as const, erro: "Use foto (JPG/PNG) ou PDF." };
    const ext = f.type === "application/pdf" ? "pdf" : f.type.split("/")[1].replace("jpeg", "jpg");
    const caminho = `${empresaId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("atestados").upload(caminho, f, { contentType: f.type, upsert: false });
    if (error) return { ok: false as const, erro: `Não subiu o arquivo: ${error.message}` };
    arquivo = caminho;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("atestados").insert({
    colaborador_id: colaborador, inicio, fim, tipo, arquivo_url: arquivo,
    motivo: String(fd.get("motivo") ?? "").trim().slice(0, 200) || null, criado_por: auth.user?.id ?? null,
  });
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const };
}

/** Link de 5 minutos pra abrir o arquivo do atestado (o bucket é privado). */
export async function linkArquivoAtestado(caminho: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data } = await supabase.storage.from("atestados").createSignedUrl(caminho, 300);
  return data?.signedUrl ?? null;
}

// ---------- Alterações de ponto (menu da batida no espelho, como no RHiD) ----------
// A batida original nunca some: só ganha a marca, e fica quem mexeu e quando.

async function ajustar(id: string, campos: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("ponto_batidas")
    .update({ ...campos, ajustada_por: auth.user?.id ?? null, ajustada_em: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const };
}

/** Desconsiderar marcação (ou considerar de novo). */
export async function desconsiderarBatida(id: string, desconsiderar: boolean) {
  await exigirAcesso("/colaboradores");
  return ajustar(id, { desconsiderada: desconsiderar });
}

/** Deslocar pra direita (+1: pula uma coluna) ou pra esquerda (−1). */
export async function deslocarBatida(id: string, direcao: 1 | -1) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data } = await supabase.from("ponto_batidas").select("deslocamento").eq("id", id).maybeSingle();
  const atual = Number((data as { deslocamento: number } | null)?.deslocamento ?? 0);
  const novo = Math.max(0, Math.min(6, atual + direcao));
  if (novo === atual) return { ok: false as const, erro: direcao < 0 ? "Já está na primeira coluna livre." : "Não dá pra deslocar mais." };
  return ajustar(id, { deslocamento: novo });
}

/** Deslocar pro dia anterior (−1) ou pro próximo dia (+1): muda o dia do turno. */
export async function moverBatidaDia(id: string, delta: 1 | -1) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data } = await supabase.from("ponto_batidas").select("data, data_hora").eq("id", id).maybeSingle();
  const b = data as { data: string; data_hora: string } | null;
  if (!b) return { ok: false as const, erro: "Batida não encontrada." };
  const [a, m, d] = String(b.data).slice(0, 10).split("-").map(Number);
  const novoDia = new Date(Date.UTC(a, m - 1, d + delta)).toISOString().slice(0, 10);
  // Indo pro dia anterior é saída de madrugada: noite. Indo pro seguinte, pela hora.
  const hora = Number(new Date(b.data_hora).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).slice(0, 2));
  const turno = delta < 0 ? "noite" : hora < 16 ? "dia" : "noite";
  return ajustar(id, { data: novoDia, turno, deslocamento: 0 });
}
