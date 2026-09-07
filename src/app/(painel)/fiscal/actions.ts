"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitirNfce, type FocusAmbiente } from "@/lib/fiscal/focus";
import { exigirAcesso } from "@/lib/permissoes-server";

// Salva a configuração fiscal (dados da empresa + emissor). Chave/valor.
export async function salvarConfigFiscal(formData: FormData) {
  const supabase = await createClient();
  const campos = [
    "razao_social",
    "nome_fantasia",
    "cnpj",
    "ie",
    "crt",
    "cep",
    "logradouro",
    "numero",
    "bairro",
    "municipio",
    "uf",
    "cod_municipio",
    "emissor",
    "emissor_token",
    "emissor_ambiente",
    "csc",
    "csc_id",
    "cfop_padrao",
    "csosn_padrao",
    "ncm_buffet",
  ];
  const linhas = campos.map((chave) => ({
    chave,
    valor: ((formData.get(chave) as string) ?? "").trim(),
  }));
  await supabase.from("config_fiscal").upsert(linhas);
  revalidatePath("/fiscal");
}

// Emite uma NFC-e de TESTE em homologação, para validar token + certificado +
// CSC de ponta a ponta. Usa códigos fiscais típicos de restaurante (o contador
// confirma os definitivos antes de produção).
export async function emitirNotaTeste() {
  const supabase = await createClient();
  const { data } = await supabase.from("config_fiscal").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.chave] = r.valor ?? "";

  if (cfg.emissor !== "focusnfe") return { ok: false, mensagem: "Emissor não é o Focus NFe na Config fiscal." };
  if (!cfg.emissor_token) return { ok: false, mensagem: "Falta o token de API na Config fiscal." };
  const ambiente = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";

  // Horário de Brasília (UTC-3) com o fuso -03:00. Tira um minutinho pra nunca
  // ficar à frente do relógio da SEFAZ (senão rejeita "data posterior").
  const bras = new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000);
  const iso = bras.toISOString().slice(0, 19) + "-03:00";
  const ref = "teste-" + Date.now();

  const ncm = cfg.ncm_buffet || "21069090"; // preparações alimentícias (típico)
  const cfop = cfg.cfop_padrao || "5102";
  const csosn = cfg.csosn_padrao || "102";

  const r = await emitirNfce(
    { token: cfg.emissor_token, ambiente },
    ref,
    {
      natureza_operacao: "Venda ao consumidor",
      data_emissao: iso,
      tipo_documento: "1",
      finalidade_emissao: "1",
      consumidor_final: "1",
      presenca_comprador: "1",
      modalidade_frete: "9",
      cnpj_emitente: cfg.cnpj ? cfg.cnpj.replace(/\D/g, "") : undefined,
      items: [
        {
          numero_item: "1",
          codigo_produto: "TESTE",
          descricao: "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
          cfop,
          unidade_comercial: "UN",
          quantidade_comercial: "1.0000",
          valor_unitario_comercial: "1.00",
          valor_bruto: "1.00",
          codigo_ncm: ncm,
          icms_origem: "0",
          icms_situacao_tributaria: csosn,
        },
      ],
      formas_pagamento: [{ forma_pagamento: "01", valor_pagamento: "1.00" }],
    },
  );

  return {
    ok: r.ok,
    status: r.status,
    statusHttp: r.statusHttp,
    numero: r.numero,
    chave: r.chave,
    urlDanfe: r.urlDanfe,
    mensagem: r.mensagem,
    // resumo curto dos erros de validação (se houver)
    erros: r.erros ? JSON.stringify(r.erros).slice(0, 600) : undefined,
  };
}

// ---------- Perfis fiscais ----------
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function salvarPerfilFiscal(fd: FormData) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const id = ((fd.get("id") as string) || "").trim() || null;
  const nome = ((fd.get("nome") as string) || "").trim();
  if (!nome) return { ok: false, mensagem: "Nome obrigatório." };
  const ncm = soDigitos(fd.get("ncm"));
  if (ncm && ncm.length !== 8) return { ok: false, mensagem: "NCM tem 8 dígitos." };
  const cest = soDigitos(fd.get("cest"));
  if (cest && cest.length !== 7) return { ok: false, mensagem: "CEST tem 7 dígitos (ex.: 0302100)." };
  const cfop = soDigitos(fd.get("cfop"));
  if (cfop.length !== 4) return { ok: false, mensagem: "CFOP tem 4 dígitos." };
  const dados = {
    nome,
    ncm: ncm || null,
    cest: cest || null,
    cfop,
    csosn: soDigitos(fd.get("csosn")) || "102",
    origem: soDigitos(fd.get("origem")) || "0",
    unidade: ((fd.get("unidade") as string) || "UN").trim().toUpperCase().slice(0, 6),
    pis_cst: soDigitos(fd.get("pis_cst")) || "49",
    cofins_cst: soDigitos(fd.get("cofins_cst")) || "49",
    homologado: fd.get("homologado") === "on",
    obs: ((fd.get("obs") as string) || "").trim() || null,
  };
  const { error } = id
    ? await supabase.from("perfis_fiscais").update(dados).eq("id", id)
    : await supabase.from("perfis_fiscais").insert(dados);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/fiscal/perfis");
  return { ok: true };
}

export async function excluirPerfilFiscal(id: string) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const { error } = await supabase.from("perfis_fiscais").delete().eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/fiscal/perfis");
  return { ok: true };
}

export async function definirPerfilCategoria(categoriaId: string, perfilId: string | null) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const { error } = await supabase.from("pdv_categorias").update({ perfil_fiscal_id: perfilId }).eq("id", categoriaId);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/fiscal/perfis");
  return { ok: true };
}

export async function definirPerfilItem(itemId: string, perfilId: string | null) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const { error } = await supabase.from("pdv_itens").update({ perfil_fiscal_id: perfilId }).eq("id", itemId);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/fiscal/perfis");
  return { ok: true };
}
