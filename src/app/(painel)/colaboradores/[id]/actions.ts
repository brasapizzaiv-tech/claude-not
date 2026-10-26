"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { parseAniversario } from "@/lib/equipe";
import { pisValido } from "@/lib/ponto-core";
import { COLUNAS_DATA, COLUNAS_FICHA, COLUNAS_NUMEROS } from "@/lib/ficha-core";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function revalidar(id: string) {
  revalidatePath(`/colaboradores/${id}`);
  revalidatePath("/colaboradores");
  revalidatePath("/colaboradores/ponto");
}
const vespera = (d: string) => { const [a, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(a, m - 1, dd - 1)).toISOString().slice(0, 10); };

/** Grava os campos de uma aba da ficha (só as colunas conhecidas). */
export async function salvarFicha(id: string, campos: Record<string, string>) {
  await exigirAcesso("/colaboradores");
  const upd: Record<string, string | null> = {};
  for (const [k, bruto] of Object.entries(campos)) {
    if (!COLUNAS_FICHA.has(k)) continue;
    let v = String(bruto ?? "").trim().slice(0, 500);
    if (COLUNAS_NUMEROS.has(k)) v = v.replace(/\D/g, "");
    if (k === "nascimento") { upd[k] = v ? parseAniversario(v) : null; if (v && !upd[k]) return { ok: false as const, erro: "Data de nascimento: use dd/mm/aaaa." }; continue; }
    if (COLUNAS_DATA.has(k) && v && !DATA.test(v)) return { ok: false as const, erro: "Confira as datas." };
    if ((k === "departamento_id" || k === "superior_id") && v && !UUID.test(v)) continue;
    if (k === "cpf" && v && v.length !== 11) return { ok: false as const, erro: "O CPF precisa ter 11 números." };
    if (k === "pis" && v && !pisValido(v)) return { ok: false as const, erro: "Esse PIS não é válido (confira os números)." };
    if (k === "uf") v = v.toUpperCase().slice(0, 2);
    upd[k] = v || null;
  }
  if (upd.superior_id === id) return { ok: false as const, erro: "A pessoa não pode ser superior dela mesma." };
  if (!Object.keys(upd).length) return { ok: true as const };
  const supabase = await createClient();
  const { error } = await supabase.from("colaboradores").update(upd).eq("id", id);
  if (error) return { ok: false as const, erro: error.message.includes("duplicate") ? "Esse CPF já está em outro cadastro." : error.message };
  revalidar(id);
  return { ok: true as const };
}

/**
 * Troca o cargo a partir de uma data (Histórico de cargos do RHiD): o anterior
 * termina na véspera, o novo entra, e a "função" do cadastro vira o nome do cargo.
 */
export async function trocarCargo(id: string, cargoId: string, de: string) {
  await exigirAcesso("/colaboradores");
  if (!UUID.test(cargoId) || !DATA.test(de)) return { ok: false as const, erro: "Escolha o cargo e a data." };
  const supabase = await createClient();
  const [{ data: cargo }, { data: hist }] = await Promise.all([
    supabase.from("cargos").select("nome").eq("id", cargoId).maybeSingle(),
    supabase.from("colaborador_cargos").select("id, cargo_id, de, ate").eq("colaborador_id", id),
  ]);
  if (!cargo) return { ok: false as const, erro: "Cargo não encontrado." };
  const lista = (hist ?? []) as { id: string; cargo_id: string; de: string; ate: string | null }[];
  const vigente = lista.find((v) => v.de < de && (!v.ate || v.ate >= de));
  const depois = lista.filter((v) => v.de >= de).map((v) => v.id);
  if (depois.length) await supabase.from("colaborador_cargos").delete().in("id", depois);
  if (vigente) await supabase.from("colaborador_cargos").update({ ate: vespera(de) }).eq("id", vigente.id);
  const { error } = await supabase.from("colaborador_cargos").insert({ colaborador_id: id, cargo_id: cargoId, de });
  if (error) return { ok: false as const, erro: error.message };
  await supabase.from("colaboradores").update({ cargo_id: cargoId, funcao: (cargo as { nome: string }).nome }).eq("id", id);
  revalidar(id);
  return { ok: true as const };
}

/** Tira uma linha do histórico de cargos (lançada errada). */
export async function apagarCargoHistorico(id: string, linhaId: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  await supabase.from("colaborador_cargos").delete().eq("id", linhaId).eq("colaborador_id", id);
  const { data: ult } = await supabase.from("colaborador_cargos").select("cargo_id, cargos(nome)").eq("colaborador_id", id).order("de", { ascending: false }).limit(1).maybeSingle();
  const u = ult as { cargo_id: string; cargos: { nome: string } | { nome: string }[] | null } | null;
  const nome = u ? (Array.isArray(u.cargos) ? u.cargos[0]?.nome : u.cargos?.nome) ?? null : null;
  await supabase.from("colaboradores").update({ cargo_id: u?.cargo_id ?? null, ...(nome ? { funcao: nome } : {}) }).eq("id", id);
  revalidar(id);
  return { ok: true as const };
}

/** Endereço pelo CEP (BrasilAPI). */
export async function buscarCep(cep: string) {
  await exigirAcesso("/colaboradores");
  const d = String(cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) return { ok: false as const, erro: "O CEP tem 8 números." };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`, { headers: { "User-Agent": "Motelli/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false as const, erro: "CEP não encontrado." };
    const j = (await r.json()) as { street?: string; neighborhood?: string; city?: string; state?: string };
    return { ok: true as const, endereco: j.street ?? "", bairro: j.neighborhood ?? "", cidade: j.city ?? "", uf: j.state ?? "" };
  } catch {
    return { ok: false as const, erro: "Não consegui consultar o CEP agora." };
  }
}

// ---------- Demissão ----------

/** Ajusta a data e o motivo de quem já foi desligado. */
export async function salvarDemissao(id: string, data: string, motivoId: string, obs: string) {
  await exigirAcesso("/colaboradores");
  if (!DATA.test(data)) return { ok: false as const, erro: "Confira a data." };
  const supabase = await createClient();
  const { error } = await supabase.from("colaboradores")
    .update({ desligado_em: data, motivo_demissao_id: UUID.test(motivoId) ? motivoId : null, desligado_motivo: obs.trim().slice(0, 300) || null })
    .eq("id", id).eq("ativo", false);
  if (error) return { ok: false as const, erro: error.message };
  revalidar(id);
  return { ok: true as const };
}

// ---------- Documentos ----------

const TIPOS_ARQUIVO = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/;

/** Sobe um documento da pessoa (foto ou PDF, até 10 MB). */
export async function enviarDocumento(fd: FormData) {
  await exigirAcesso("/colaboradores");
  const id = String(fd.get("colaborador_id") ?? "");
  const nome = String(fd.get("nome") ?? "").trim().slice(0, 120);
  const tipo = String(fd.get("tipo") ?? "").trim().slice(0, 60) || null;
  const validade = String(fd.get("validade") ?? "");
  const f = fd.get("arquivo");
  if (!UUID.test(id)) return { ok: false as const, erro: "Pessoa inválida." };
  if (!(f instanceof File) || f.size === 0) return { ok: false as const, erro: "Escolha o arquivo (foto ou PDF)." };
  if (f.size > 10 * 1024 * 1024) return { ok: false as const, erro: "Arquivo grande demais (máximo 10 MB)." };
  if (!TIPOS_ARQUIVO.test(f.type)) return { ok: false as const, erro: "Use foto (JPG/PNG) ou PDF." };
  if (validade && !DATA.test(validade)) return { ok: false as const, erro: "Confira a validade." };
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  const ext = f.type === "application/pdf" ? "pdf" : f.type.split("/")[1].replace("jpeg", "jpg");
  const caminho = `${empresaId}/${id}/${crypto.randomUUID()}.${ext}`;
  const { error: e1 } = await supabase.storage.from("documentos-equipe").upload(caminho, f, { contentType: f.type, upsert: false });
  if (e1) return { ok: false as const, erro: `Não subiu o arquivo: ${e1.message}` };
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("colaborador_documentos").insert({
    colaborador_id: id, nome: nome || f.name.slice(0, 120), tipo, arquivo: caminho, validade: validade || null,
    pedir_assinatura: fd.get("pedir_assinatura") === "on", criado_por: auth.user?.id ?? null,
  });
  if (error) {
    await supabase.storage.from("documentos-equipe").remove([caminho]);
    return { ok: false as const, erro: error.message };
  }
  revalidar(id);
  return { ok: true as const };
}

export async function apagarDocumento(docId: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data } = await supabase.from("colaborador_documentos").select("arquivo, colaborador_id, assinado_em").eq("id", docId).maybeSingle();
  const d = data as { arquivo: string; colaborador_id: string; assinado_em: string | null } | null;
  if (!d) return { ok: false as const, erro: "Documento não encontrado." };
  if (d.assinado_em) return { ok: false as const, erro: "Documento já assinado não pode ser apagado." };
  await supabase.from("colaborador_documentos").delete().eq("id", docId);
  await supabase.storage.from("documentos-equipe").remove([d.arquivo]);
  revalidar(d.colaborador_id);
  return { ok: true as const };
}

/** Link de 5 minutos pra abrir o arquivo (o bucket é privado). */
export async function linkDocumento(docId: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data } = await supabase.from("colaborador_documentos").select("arquivo").eq("id", docId).maybeSingle();
  if (!data) return null;
  const { data: u } = await supabase.storage.from("documentos-equipe").createSignedUrl((data as { arquivo: string }).arquivo, 300);
  return u?.signedUrl ?? null;
}

// ---------- Cadastros simples (departamentos, cargos, motivos de demissão) ----------

const TABELAS = { departamentos: "departamento_id", cargos: "cargo_id", motivos_demissao: "motivo_demissao_id" } as const;
export type TabelaCadastro = keyof typeof TABELAS;

export async function salvarItemCadastro(tabela: TabelaCadastro, nome: string, id?: string) {
  await exigirAcesso("/colaboradores");
  if (!(tabela in TABELAS)) return { ok: false as const, erro: "Lista inválida." };
  const n = nome.trim().slice(0, 80);
  if (n.length < 2) return { ok: false as const, erro: "Escreva o nome." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(tabela).update({ nome: n, ativo: true }).eq("id", id)
    : await supabase.from(tabela).insert({ nome: n });
  if (error) return { ok: false as const, erro: error.message.includes("duplicate") ? "Já existe um com esse nome." : error.message };
  if (tabela === "cargos" && id) await supabase.from("colaboradores").update({ funcao: n }).eq("cargo_id", id);
  revalidatePath("/colaboradores/cadastros");
  revalidatePath("/colaboradores");
  return { ok: true as const };
}

/** Apaga se ninguém usa; senão só desativa (some das listas, o histórico continua). */
export async function apagarItemCadastro(tabela: TabelaCadastro, id: string) {
  await exigirAcesso("/colaboradores");
  if (!(tabela in TABELAS)) return { ok: false as const, erro: "Lista inválida." };
  const supabase = await createClient();
  const { count } = await supabase.from("colaboradores").select("id", { count: "exact", head: true }).eq(TABELAS[tabela], id);
  let usado = (count ?? 0) > 0;
  if (!usado && tabela === "cargos") {
    const { count: c2 } = await supabase.from("colaborador_cargos").select("id", { count: "exact", head: true }).eq("cargo_id", id);
    usado = (c2 ?? 0) > 0;
  }
  const { error } = usado
    ? await supabase.from(tabela).update({ ativo: false }).eq("id", id)
    : await supabase.from(tabela).delete().eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/colaboradores/cadastros");
  return { ok: true as const, desativado: usado };
}
