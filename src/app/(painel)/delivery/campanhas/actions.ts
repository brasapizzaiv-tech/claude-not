"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcesso } from "@/lib/permissoes-server";
import { empresaAtualId } from "@/lib/empresa";
import { criarModeloWpp, enviarModeloWpp } from "@/lib/whatsapp";
import { linkCardapio, resolverVariaveis, PUBLICOS, VARIAVEIS, type TipoPublico } from "@/lib/whatsapp-marketing";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const limpaVars = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => x in VARIAVEIS) : []);

// Quantos clientes a campanha alcança (pra mostrar antes de lançar).
export async function contarPublico(tipo: string, dias: number | null, min: number | null) {
  await exigirAcesso("/delivery");
  const empresaId = await empresaAtualId();
  if (!empresaId || !(tipo in PUBLICOS)) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("wpp_publico", { p_empresa: empresaId, p_tipo: tipo, p_dias: dias, p_min: min });
  return ((data as unknown[]) ?? []).length;
}

// Imagem da campanha (modelo com imagem no topo): vai pro armazenamento público.
export async function subirImagemCampanha(formData: FormData) {
  await exigirAcesso("/delivery");
  const f = formData.get("arquivo");
  if (!(f instanceof File) || f.size === 0) return { ok: false as const, mensagem: "Escolha uma imagem." };
  if (f.size > 5 * 1024 * 1024) return { ok: false as const, mensagem: "Imagem grande demais (máximo 5 MB)." };
  if (!/^image\/(jpeg|png)$/.test(f.type)) return { ok: false as const, mensagem: "Use JPG ou PNG (o WhatsApp não aceita outro formato)." };
  const ext = f.type === "image/png" ? "png" : "jpg";
  const caminho = `campanhas/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("cardapio").upload(caminho, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false });
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, url: admin.storage.from("cardapio").getPublicUrl(caminho).data.publicUrl };
}

export type CampanhaInput = {
  nome: string;
  publico: { tipo: TipoPublico; dias?: number | null; min?: number | null };
  dias: number[];
  horaIni: string;
  horaFim: string;
  cupom: string | null;
  modelo: string;
  idioma: string;
  variaveis: string[];
  imagemUrl: string | null;
};

export async function criarCampanha(input: CampanhaInput, lancar: boolean) {
  await exigirAcesso("/delivery");
  const nome = (input.nome || "").trim().slice(0, 80);
  if (nome.length < 2) return { ok: false as const, mensagem: "Dê um nome pra campanha." };
  if (!(input.publico?.tipo in PUBLICOS)) return { ok: false as const, mensagem: "Escolha o público." };
  const dias = [...new Set((input.dias ?? []).map(Number).filter((d) => d >= 0 && d <= 6))];
  if (dias.length === 0) return { ok: false as const, mensagem: "Marque pelo menos um dia da semana." };
  if (!HORA.test(input.horaIni) || !HORA.test(input.horaFim)) return { ok: false as const, mensagem: "Confira o horário de envio." };
  if (!input.modelo) return { ok: false as const, mensagem: "Escolha o modelo da mensagem." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("wpp_campanhas").insert({
    nome,
    publico: { tipo: input.publico.tipo, dias: input.publico.dias ?? null, min: input.publico.min ?? null },
    dias, hora_ini: input.horaIni, hora_fim: input.horaFim,
    cupom: (input.cupom || "").trim().toUpperCase() || null,
    modelo: input.modelo, idioma: input.idioma || "pt_BR",
    variaveis: limpaVars(input.variaveis),
    imagem_url: input.imagemUrl || null,
    status: lancar ? "agendada" : "rascunho",
    lancada_em: lancar ? new Date().toISOString() : null,
    criado_por: auth.user?.id ?? null,
  }).select("id").single();
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/campanhas");
  return { ok: true as const, id: (data as { id: string }).id };
}

export async function mudarCampanha(id: string, acao: "lancar" | "pausar" | "retomar" | "cancelar") {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const { data: c } = await supabase.from("wpp_campanhas").select("status, montada_em").eq("id", id).maybeSingle();
  const atual = (c as { status: string; montada_em: string | null } | null);
  if (!atual) return { ok: false as const, mensagem: "Campanha não encontrada." };
  const novo =
    acao === "lancar" && atual.status === "rascunho" ? { status: "agendada", lancada_em: new Date().toISOString() } :
    acao === "pausar" && ["agendada", "enviando"].includes(atual.status) ? { status: "pausada" } :
    acao === "retomar" && atual.status === "pausada" ? { status: atual.montada_em ? "enviando" : "agendada" } :
    acao === "cancelar" && !["concluida", "cancelada"].includes(atual.status) ? { status: "cancelada" } :
    null;
  if (!novo) return { ok: false as const, mensagem: "Essa ação não vale pra situação atual da campanha." };
  await supabase.from("wpp_campanhas").update(novo).eq("id", id);
  if (acao === "cancelar") await supabase.from("wpp_envios").update({ status: "pulada" }).eq("campanha_id", id).eq("status", "fila");
  revalidatePath("/delivery/campanhas");
  revalidatePath(`/delivery/campanhas/${id}`);
  return { ok: true as const };
}

// Manda a mensagem pra um número só (o seu), pra ver como chega.
export async function enviarTeste(input: { telefone: string; modelo: string; idioma: string; variaveis: string[]; cupom: string | null; imagemUrl: string | null }) {
  await exigirAcesso("/delivery");
  if (!input.modelo) return { ok: false as const, mensagem: "Escolha o modelo." };
  const params = resolverVariaveis(limpaVars(input.variaveis), { nome: "Rafael", link: linkCardapio({ cupom: input.cupom }), cupom: input.cupom, saldo: 12.5, extra: { valor: 12.5, vence: new Date(Date.now() + 5 * 86400000).toISOString(), dias_sem: 35 } });
  const r = await enviarModeloWpp(input.telefone, input.modelo, input.idioma || "pt_BR", params, input.imagemUrl);
  return r.ok ? { ok: true as const } : { ok: false as const, mensagem: r.erro };
}

export async function salvarGatilho(input: { chave: string; ativo: boolean; modelo: string | null; idioma: string; variaveis: string[]; dias: number | null; cupom: string | null; imagemUrl: string | null }) {
  await exigirAcesso("/delivery");
  if (input.ativo && !input.modelo) return { ok: false as const, mensagem: "Escolha o modelo antes de ligar." };
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  const { error } = await supabase.from("wpp_gatilhos").upsert({
    empresa_id: empresaId,
    chave: input.chave,
    ativo: !!input.ativo,
    modelo: input.modelo || null,
    idioma: input.idioma || "pt_BR",
    variaveis: limpaVars(input.variaveis),
    dias: input.dias != null && Number.isFinite(Number(input.dias)) ? Math.max(0, Math.round(Number(input.dias))) : null,
    cupom: (input.cupom || "").trim().toUpperCase() || null,
    imagem_url: input.imagemUrl || null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "empresa_id,chave" });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/delivery/gatilhos");
  return { ok: true as const };
}

export async function criarModelo(input: { nome: string; categoria: "MARKETING" | "UTILITY"; corpo: string; rodape: string | null; exemplos: string[] }) {
  await exigirAcesso("/delivery");
  const r = await criarModeloWpp(input);
  if (!r.ok) return { ok: false as const, mensagem: r.erro };
  revalidatePath("/delivery/whatsapp");
  return { ok: true as const, nome: r.nome, status: r.status };
}

export async function salvarConfigWpp(formData: FormData) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const n = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
  const hora = (k: string, p: string) => { const v = String(formData.get(k) ?? ""); return HORA.test(v) ? v : p; };
  const row = {
    limite_dia: Math.max(1, Math.round(n("limite_dia")) || 250),
    intervalo_auto_dias: Math.max(0, Math.round(n("intervalo_auto_dias")) || 0),
    auto_hora_ini: hora("auto_hora_ini", "10:00"),
    auto_hora_fim: hora("auto_hora_fim", "20:00"),
    preco_marketing: Number.isFinite(n("preco_marketing")) && n("preco_marketing") > 0 ? n("preco_marketing") : null,
    preco_utilidade: Number.isFinite(n("preco_utilidade")) && n("preco_utilidade") > 0 ? n("preco_utilidade") : null,
    atualizado_em: new Date().toISOString(),
  };
  const { data: atual } = await supabase.from("wpp_config").select("empresa_id").maybeSingle();
  if (atual) await supabase.from("wpp_config").update(row).eq("empresa_id", (atual as { empresa_id: string }).empresa_id);
  else await supabase.from("wpp_config").insert(row);
  revalidatePath("/delivery/whatsapp");
}
