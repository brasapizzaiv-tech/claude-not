"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";
import { apagarAfdRepetidas, marcarPresencasDoPonto, receberAfd } from "@/lib/ponto-server";
import { pisValido, turnoDaBatida } from "@/lib/ponto-core";
import { AVISO_FECHADO, diaFechado } from "@/lib/ponto-espelho";

/** Mês fechado (migration 0258): a batida desse dia não muda mais. */
async function batidaTravada(supabase: Awaited<ReturnType<typeof createClient>>, id: string, outroDia?: string) {
  const { data } = await supabase.from("ponto_batidas").select("colaborador_id, data").eq("id", id).maybeSingle();
  const b = data as { colaborador_id: string | null; data: string } | null;
  if (!b?.colaborador_id) return false;
  return diaFechado(supabase, b.colaborador_id, [String(b.data).slice(0, 10), ...(outroDia ? [outroDia] : [])]);
}

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
  if (await diaFechado(supabase, col.id, [dia])) return { ok: false as const, erro: AVISO_FECHADO };
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
  const { data: b } = await supabase.from("ponto_batidas").select("data").eq("colaborador_id", colaboradorId).eq("origem", "manual").eq("data_hora", dataHoraIso).maybeSingle();
  if (b && (await diaFechado(supabase, colaboradorId, [String((b as { data: string }).data).slice(0, 10)]))) return { ok: false as const, erro: AVISO_FECHADO };
  await supabase.from("ponto_batidas").delete().eq("colaborador_id", colaboradorId).eq("origem", "manual").eq("data_hora", dataHoraIso);
  revalidar();
}

/** Justificativa de um ou mais dias: atestado (tira o prêmio) ou abono (não tira). Arquivo opcional. */
export async function justificar(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const colaborador = String(fd.get("colaborador_id") ?? "");
  const inicio = String(fd.get("inicio") ?? "");
  const fim = String(fd.get("fim") ?? "") || inicio;
  if (!colaborador || !DATA.test(inicio) || !DATA.test(fim) || fim < inicio) return { ok: false as const, erro: "Escolha a pessoa e as datas." };
  const supabase = await createClient();
  // Tipo de justificativa (migration 0258): diz o que faz no ponto e se tira o prêmio.
  const tipoId = String(fd.get("tipo_id") ?? "");
  const { data: tj } = tipoId ? await supabase.from("justificativa_tipos").select("id, efeito, tira_premio").eq("id", tipoId).maybeSingle() : { data: null };
  const tipoJ = tj as { id: string; efeito: "dia" | "horas" | "ajuste"; tira_premio: boolean } | null;
  if (!tipoJ) return { ok: false as const, erro: "Escolha o tipo de justificativa." };
  const tipo = tipoJ.tira_premio ? "atestado" : "abono";
  let minutos: number | null = null;
  if (tipoJ.efeito !== "dia") {
    const txt = String(fd.get("minutos") ?? "").trim();
    const m = txt.match(/^(-)?(\d{1,2}):([0-5]\d)$/);
    minutos = m ? (Number(m[2]) * 60 + Number(m[3])) * (m[1] ? -1 : 1) : NaN;
    if (!Number.isFinite(minutos) || minutos === 0) return { ok: false as const, erro: "Diga quanto tempo (hh:mm, ex.: 01:30; no ajuste, -00:30 tira)." };
    if (tipoJ.efeito === "horas") minutos = Math.abs(minutos);
  }
  if (await diaFechado(supabase, colaborador, [inicio, fim])) return { ok: false as const, erro: AVISO_FECHADO };
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
    colaborador_id: colaborador, inicio, fim, tipo, tipo_id: tipoJ.id, minutos, arquivo_url: arquivo,
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
  if (await batidaTravada(await createClient(), id)) return { ok: false as const, erro: AVISO_FECHADO };
  return ajustar(id, { desconsiderada: desconsiderar });
}

/** Deslocar pra direita (+1: pula uma coluna) ou pra esquerda (−1). */
export async function deslocarBatida(id: string, direcao: 1 | -1) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  if (await batidaTravada(supabase, id)) return { ok: false as const, erro: AVISO_FECHADO };
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
  if (await batidaTravada(supabase, id, novoDia)) return { ok: false as const, erro: AVISO_FECHADO };
  // Indo pro dia anterior é saída de madrugada: noite. Indo pro seguinte, pela hora.
  const hora = Number(new Date(b.data_hora).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).slice(0, 2));
  const turno = delta < 0 ? "noite" : hora < 16 ? "dia" : "noite";
  return ajustar(id, { data: novoDia, turno, deslocamento: 0 });
}

/**
 * Batida do relógio com CPF que não está em nenhum cadastro: diz de quem é.
 * Grava o CPF no colaborador (as próximas batidas já chegam ligadas), liga as
 * batidas que já vieram e marca as presenças desses dias (mesma regra do relógio).
 */
export async function vincularCpfPonto(cpf: string, colaboradorId: string) {
  await exigirAcesso("/colaboradores");
  const empresaId = await empresaAtualId();
  const c = String(cpf || "").replace(/\D/g, "");
  if (!empresaId || c.length !== 11) return { ok: false as const, erro: "CPF inválido." };
  if (!colaboradorId) return { ok: false as const, erro: "Escolha o colaborador." };
  const supabase = await createClient();
  const { data: col } = await supabase.from("colaboradores").select("id, nome, cpf").eq("id", colaboradorId).maybeSingle();
  if (!col) return { ok: false as const, erro: "Colaborador não encontrado." };
  const atual = String((col as { cpf: string | null }).cpf ?? "").replace(/\D/g, "");
  // O relógio manda o PIS de quem foi cadastrado nele pelo PIS (migration 0251):
  // número que é PIS válido (e não é o CPF da pessoa) vai pro campo PIS.
  const ehPis = pisValido(c) && c !== atual;
  if (!ehPis && atual && atual !== c) return { ok: false as const, erro: `${(col as { nome: string }).nome} já tem outro CPF no cadastro. Confira em Colaboradores.` };
  const { data: outro } = await supabase.from("colaboradores").select("nome").or(`cpf.eq.${c},pis.eq.${c}`).neq("id", colaboradorId).limit(1).maybeSingle();
  if (outro) return { ok: false as const, erro: `Esse número já é de ${(outro as { nome: string }).nome}.` };
  const { error } = await supabase.from("colaboradores").update(ehPis ? { pis: c } : { cpf: c }).eq("id", colaboradorId);
  if (error) return { ok: false as const, erro: error.message };
  const { data: ligadas, error: e2 } = await supabase.from("ponto_batidas").update({ colaborador_id: colaboradorId })
    .eq("cpf", c).is("colaborador_id", null).select("data");
  if (e2) return { ok: false as const, erro: e2.message };
  // Histórico que veio duas vezes (RHiD com o CPF, relógio com o PIS): fica a do relógio.
  await apagarAfdRepetidas(empresaId, colaboradorId);
  const dias = [...new Set(((ligadas ?? []) as { data: string }[]).map((b) => String(b.data).slice(0, 10)))];
  const presencas = await marcarPresencasDoPonto(empresaId, dias.map((data) => ({ colaboradorId, data })));
  revalidar();
  revalidatePath("/dashboard");
  return { ok: true as const, batidas: ligadas?.length ?? 0, presencas };
}

// ---------- Fechamento do mês (migration 0258, "Arquivar cálculos" do RHiD) ----------

/** Fecha o ciclo de uma ou mais pessoas: trava os ajustes e libera a assinatura no app. */
export async function fecharMes(de: string, ate: string, pessoaIds: string[]) {
  await exigirAcesso("/colaboradores");
  if (!DATA.test(de) || !DATA.test(ate) || ate < de || !pessoaIds.length) return { ok: false as const, erro: "Período inválido." };
  const supabase = await createClient();
  const { data: ja } = await supabase.from("ponto_fechamentos").select("colaborador_id").eq("de", de).is("reaberto_em", null).in("colaborador_id", pessoaIds);
  const fechadas = new Set(((ja ?? []) as { colaborador_id: string }[]).map((x) => x.colaborador_id));
  const { data: auth } = await supabase.auth.getUser();
  const novas = pessoaIds.filter((p) => !fechadas.has(p)).map((p) => ({ colaborador_id: p, de, ate, fechado_por: auth.user?.id ?? null }));
  if (novas.length) {
    const { error } = await supabase.from("ponto_fechamentos").insert(novas);
    if (error) return { ok: false as const, erro: error.message };
  }
  revalidar();
  return { ok: true as const, fechadas: novas.length };
}

/** Reabre o ciclo de uma pessoa (fica registrado quem e quando); depois de corrigir, fecha de novo e ela assina de novo. */
export async function reabrirMes(de: string, pessoaId: string) {
  await exigirAcesso("/colaboradores");
  if (!DATA.test(de)) return { ok: false as const, erro: "Período inválido." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("ponto_fechamentos").update({ reaberto_em: new Date().toISOString(), reaberto_por: auth.user?.id ?? null })
    .eq("colaborador_id", pessoaId).eq("de", de).is("reaberto_em", null);
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  return { ok: true as const };
}

/** Grava as regras de inconsistência (o que marca um dia como "tem problema"). */
export async function salvarInconsistencias(regras: { nome: string; campo: string; a_partir: number; ativo: boolean }[]) {
  await exigirAcesso("/colaboradores");
  const campos = new Set(["falta", "atraso", "extra", "incompleto"]);
  const limpas = regras.filter((r) => campos.has(r.campo) && String(r.nome ?? "").trim())
    .map((r) => ({ nome: String(r.nome).trim().slice(0, 60), campo: r.campo, a_partir: Math.max(1, Math.min(600, Math.round(Number(r.a_partir) || 1))), ativo: !!r.ativo }));
  const supabase = await createClient();
  const { data: cfg } = await supabase.from("assiduidade_config").select("id").maybeSingle();
  if (!cfg) return { ok: false as const, erro: "Configuração do ponto não encontrada." };
  const { error } = await supabase.from("assiduidade_config").update({ inconsistencias: limpas }).eq("id", (cfg as { id: string }).id);
  if (error) return { ok: false as const, erro: error.message };
  revalidar();
  revalidatePath("/colaboradores/ponto/regras");
  return { ok: true as const };
}

/** Cria ou altera um tipo de justificativa. */
export async function salvarTipoJustificativa(t: { id?: string; nome: string; efeito: string; tira_premio: boolean; ativo: boolean }) {
  await exigirAcesso("/colaboradores");
  const nome = String(t.nome ?? "").trim().slice(0, 60);
  if (nome.length < 2) return { ok: false as const, erro: "Escreva o nome." };
  if (!["dia", "horas", "ajuste"].includes(t.efeito)) return { ok: false as const, erro: "Escolha o que o tipo faz." };
  const linha = { nome, efeito: t.efeito, tira_premio: !!t.tira_premio, ativo: !!t.ativo };
  const supabase = await createClient();
  const { error } = t.id ? await supabase.from("justificativa_tipos").update(linha).eq("id", t.id) : await supabase.from("justificativa_tipos").insert(linha);
  if (error) return { ok: false as const, erro: error.message.includes("duplicate") ? "Já existe um tipo com esse nome." : error.message };
  revalidatePath("/colaboradores/ponto/regras");
  revalidar();
  return { ok: true as const };
}
