"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitirNfce, type FocusAmbiente } from "@/lib/fiscal/focus";

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
