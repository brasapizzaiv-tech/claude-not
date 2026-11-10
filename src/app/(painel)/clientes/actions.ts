"use server";

import { numeroBR } from "@/lib/format";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { explicarErro } from "@/lib/erro-amigavel";

// Cadastro de clientes: só quem vende ou fatura (auditoria, 08/11/2026: antes
// qualquer funcionário logado salvava e removia).
export async function salvarCliente(formData: FormData) {
  await exigirAcesso("/clientes");
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = ((formData.get("nome") as string) || "").trim();
  if (!nome) return { ok: false as const, mensagem: "Informe o nome." };
  const t = (c: string) => ((formData.get(c) as string) || "").trim() || null;
  const payload = {
    nome,
    cpf_cnpj: t("cpf_cnpj"),
    ie: t("ie"),
    email: t("email"),
    telefone: t("telefone"),
    cep: t("cep"),
    logradouro: t("logradouro"),
    numero: t("numero"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    municipio: t("municipio"),
    uf: t("uf"),
    cod_municipio: t("cod_municipio"),
    // WhatsApp: "sim" / "nao" / vazio (nunca perguntado — base importada).
    ...((): Record<string, unknown> => {
      const v = String(formData.get("aceita_promocoes") ?? "");
      if (v === "sim") return { aceita_promocoes: true, aceita_promocoes_em: new Date().toISOString(), wpp_sair_em: null };
      if (v === "nao") return { aceita_promocoes: false };
      return { aceita_promocoes: null };
    })(),
    nascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(formData.get("nascimento") ?? "")) ? String(formData.get("nascimento")) : null,
    aceita_aniversario: formData.get("aceita_aniversario") === "on",
    // Teto do fiado ("Saldo cliente" no caixa). Vazio = sem limite.
    limite_credito: (() => {
      const v = ((formData.get("limite_credito") as string) || "").trim();
      if (!v) return null;
      const n = numeroBR(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
  };
  const { error } = id
    ? await supabase.from("clientes").update(payload).eq("id", id)
    : await supabase.from("clientes").insert(payload);
  revalidatePath("/clientes");
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const };
}

// LGPD (SEC-16, migration 0299): "Remover" apaga os dados pessoais do cliente
// em todo o sistema (nome, telefone, endereço, CPF/CNPJ — nos pedidos,
// reservas, vales e mensagens também). Valores, fiado, cashback e notas
// fiscais ficam. Quem ainda deve fiado não sai. Não dá pra desfazer.
export async function excluirCliente(id: string) {
  await exigirAcesso("/clientes");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const, mensagem: "Cliente inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anonimizar_cliente", { p_cliente: id });
  revalidatePath("/clientes");
  if (error) return { ok: false as const, mensagem: "Não consegui apagar agora. Tente de novo." };
  const r = data as { ok: boolean; erro?: string } | null;
  if (!r?.ok) return { ok: false as const, mensagem: r?.erro ?? "Não consegui apagar." };
  return { ok: true as const };
}
