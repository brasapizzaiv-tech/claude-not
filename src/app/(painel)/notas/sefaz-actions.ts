"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { soDigitos } from "@/lib/nfe";
import { manifestarCiencia } from "@/lib/sefaz/manifestacao";
import { rodarBuscaSefaz, type ConfigSefaz } from "@/lib/sefaz/busca";
import { distribuicaoPorChave } from "@/lib/sefaz/distribuicao";
import { importarNota } from "./actions";

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("config_sefaz")
    .select("*")
    .limit(1)
    .maybeSingle();
  return { supabase, cfg: data as ConfigSefaz | null };
}

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

// Manifesta "Ciência da Operação" de uma nota (libera o XML completo na SEFAZ).
export async function manifestarNota(notaId: string) {
  const { supabase, cfg } = await getConfig();
  if (!cfg?.cert_pfx || !cfg.cert_senha)
    return { erro: "Configure o certificado no SEFAZ automático primeiro." };
  if (!cfg.cnpj) return { erro: "Informe o CNPJ no SEFAZ automático." };

  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("chave")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota?.chave) return { erro: "Nota não encontrada." };

  const r = await manifestarCiencia({
    pfxBase64: cfg.cert_pfx,
    senha: cfg.cert_senha,
    cnpj: soDigitos(cfg.cnpj),
    ambiente: cfg.ambiente,
    chNFe: nota.chave as string,
  });

  return {
    ok: r.ok,
    cStat: r.cStat,
    xMotivo: r.xMotivo,
    erro: r.erro,
  };
}

// Manifesta E já baixa a nota completa NA HORA, pela chave (consChNFe) —
// que não entra no limite de 1/hora do polling. Tudo num clique só.
export async function manifestarEBaixar(notaId: string) {
  const man = await manifestarNota(notaId);
  if (man.erro) return { ok: false, erro: man.erro };

  const { supabase, cfg } = await getConfig();
  if (!cfg?.cert_pfx || !cfg.cert_senha || !cfg.cnpj) {
    return { ok: true, cStat: man.cStat, xMotivo: man.xMotivo, completa: false };
  }

  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("chave")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota?.chave) return { ok: false, erro: "Nota sem chave." };

  // Baixa a nota específica pela chave (imediato).
  const r = await distribuicaoPorChave(
    {
      pfxBase64: cfg.cert_pfx,
      senha: cfg.cert_senha,
      cnpj: soDigitos(cfg.cnpj),
      cuf: cfg.cuf,
      ambiente: cfg.ambiente,
      ultNSU: "0",
    },
    nota.chave as string,
  );

  const doc = (r.docs ?? []).find(
    (d) =>
      d.schema?.startsWith("procNFe") ||
      d.xml?.includes("<nfeProc") ||
      d.xml?.includes("<NFe"),
  );
  if (doc?.xml) {
    await importarNota(doc.xml, supabase);
  }

  async function temItens() {
    const { count } = await supabase
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", notaId);
    return (count ?? 0) > 0;
  }
  let completa = await temItens();

  // Rede de segurança: se a consulta por chave não trouxe, tenta a busca geral
  // (respeita o limite de 1/hora; não reinicia o contador se estiver bloqueada).
  let extraErro = "";
  if (!completa) {
    const busca = await buscarNotasSefaz();
    completa = await temItens();
    extraErro = busca.erro ?? "";
  }

  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");
  return {
    ok: true,
    cStat: man.cStat,
    xMotivo: man.xMotivo,
    completa,
    buscaErro: completa
      ? ""
      : extraErro || r.erro || `${r.cStat} ${r.xMotivo}`.trim(),
  };
}

// Busca as notas na SEFAZ (NFeDistribuicaoDFe) e importa o que vier.
export async function buscarNotasSefaz() {
  const { supabase, cfg } = await getConfig();
  if (!cfg)
    return {
      importadas: 0,
      resumos: 0,
      falhas: 0,
      cStat: "",
      xMotivo: "",
      erro: "Configure o certificado e o CNPJ primeiro.",
    };

  const r = await rodarBuscaSefaz(supabase, cfg);
  revalidatePath("/notas");
  revalidatePath("/notas/sefaz");
  return r;
}

// Reprocessa TUDO: volta o marcador ao início e puxa novamente (recupera
// notas que possam ter sido puladas). A SEFAZ entrega ~90 dias por NSU.
export async function reprocessarSefaz() {
  const { supabase, cfg } = await getConfig();
  if (!cfg)
    return {
      importadas: 0,
      resumos: 0,
      falhas: 0,
      cStat: "",
      xMotivo: "",
      erro: "Configure o certificado e o CNPJ primeiro.",
    };

  await supabase
    .from("config_sefaz")
    .update({ ult_nsu: "0", bloqueado_ate: null })
    .eq("id", cfg.id);

  const r = await rodarBuscaSefaz(supabase, {
    ...cfg,
    ult_nsu: "0",
    bloqueado_ate: null,
  });
  revalidatePath("/notas");
  revalidatePath("/notas/sefaz");
  return r;
}
