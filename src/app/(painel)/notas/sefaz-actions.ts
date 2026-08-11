"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { soDigitos } from "@/lib/nfe";
import { distribuicaoDFe } from "@/lib/sefaz/distribuicao";
import { importarNota, importarResumo } from "./actions";

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("config_sefaz")
    .select("*")
    .limit(1)
    .maybeSingle();
  return { supabase, cfg: data as ConfigSefaz | null };
}

type ConfigSefaz = {
  id: string;
  cnpj: string | null;
  cuf: number;
  ambiente: number;
  cert_nome: string | null;
  cert_pfx: string | null;
  cert_senha: string | null;
  ult_nsu: string;
};

// Salva/atualiza o certificado e os dados do SEFAZ. Senha nunca vai ao cliente.
export async function salvarConfigSefaz(dados: {
  cnpj: string;
  cuf: number;
  ambiente: number;
  cert_nome?: string;
  cert_pfx?: string; // base64 do .pfx (opcional em edições)
  cert_senha?: string;
}) {
  const { supabase, cfg } = await getConfig();
  const patch: Record<string, unknown> = {
    cnpj: soDigitos(dados.cnpj),
    cuf: dados.cuf,
    ambiente: dados.ambiente,
    atualizado_em: new Date().toISOString(),
  };
  if (dados.cert_pfx) {
    patch.cert_pfx = dados.cert_pfx;
    patch.cert_nome = dados.cert_nome ?? "certificado.pfx";
  }
  if (dados.cert_senha) patch.cert_senha = dados.cert_senha;

  if (cfg) await supabase.from("config_sefaz").update(patch).eq("id", cfg.id);
  else await supabase.from("config_sefaz").insert(patch);

  revalidatePath("/notas/sefaz");
  return { ok: true };
}

// Busca as notas na SEFAZ (NFeDistribuicaoDFe) e importa o que vier.
export async function buscarNotasSefaz() {
  const { supabase, cfg } = await getConfig();
  if (!cfg?.cert_pfx || !cfg.cert_senha)
    return { erro: "Suba o certificado e a senha primeiro." };
  if (!cfg.cnpj) return { erro: "Informe o CNPJ." };

  let ult = cfg.ult_nsu || "0";
  let importadas = 0;
  let resumos = 0;
  let cStat = "";
  let xMotivo = "";
  let erro: string | undefined;

  for (let i = 0; i < 5; i++) {
    const resp = await distribuicaoDFe({
      pfxBase64: cfg.cert_pfx,
      senha: cfg.cert_senha,
      cnpj: soDigitos(cfg.cnpj),
      cuf: cfg.cuf,
      ambiente: cfg.ambiente,
      ultNSU: ult,
    });
    cStat = resp.cStat;
    xMotivo = resp.xMotivo;
    if (resp.erro) {
      erro = resp.erro;
      break;
    }

    for (const doc of resp.docs) {
      try {
        if (doc.schema.startsWith("procNFe")) {
          const r = await importarNota(doc.xml);
          if (r?.ok) importadas++;
        } else if (doc.schema.startsWith("resNFe")) {
          const r = await importarResumo(doc.xml);
          if (r?.ok) resumos++;
        } else if (doc.schema.includes("Evento")) {
          // Evento de cancelamento (110111) → marca a nota como cancelada.
          const tpEvento = (doc.xml.match(/<tpEvento>(\d+)<\/tpEvento>/) || [])[1];
          const chNFe = (doc.xml.match(/<chNFe>(\d{44})<\/chNFe>/) || [])[1];
          if (tpEvento === "110111" && chNFe) {
            const { data: nota } = await supabase
              .from("notas_fiscais")
              .select("id")
              .eq("chave", chNFe)
              .maybeSingle();
            if (nota) {
              await supabase.from("lancamentos").delete().eq("nota_id", nota.id);
              await supabase
                .from("notas_fiscais")
                .update({ situacao: "cancelada" })
                .eq("id", nota.id);
            }
          }
        }
      } catch {
        // ignora doc problemático, segue os demais
      }
    }

    ult = resp.ultNSU;
    await supabase
      .from("config_sefaz")
      .update({ ult_nsu: ult, atualizado_em: new Date().toISOString() })
      .eq("id", cfg.id);

    if (resp.cStat !== "138") break; // 138 = ainda há documentos
    if (resp.ultNSU >= resp.maxNSU) break;
  }

  revalidatePath("/notas");
  revalidatePath("/notas/sefaz");
  return { importadas, resumos, cStat, xMotivo, erro };
}
