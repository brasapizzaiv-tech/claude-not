import type { SupabaseClient } from "@supabase/supabase-js";
import { soDigitos } from "@/lib/nfe";
import { distribuicaoDFe } from "@/lib/sefaz/distribuicao";
import { importarNota, importarResumo } from "@/app/(painel)/notas/actions";

export type ConfigSefaz = {
  id: string;
  cnpj: string | null;
  cuf: number;
  ambiente: number;
  cert_nome: string | null;
  cert_pfx: string | null;
  cert_senha: string | null;
  ult_nsu: string;
  bloqueado_ate: string | null;
  forcado_em?: string | null;
  reprocessado_em?: string | null;
};

export type ResultadoBusca = {
  importadas: number;
  resumos: number;
  falhas: number;
  cStat: string;
  xMotivo: string;
  erro?: string;
  bloqueado_ate?: string;
};

function horaBR(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Executa a busca na SEFAZ e importa o que vier. Recebe o cliente Supabase
// (sessão do usuário no botão; admin no cron) e a configuração já carregada.
export async function rodarBuscaSefaz(
  supabase: SupabaseClient,
  cfg: ConfigSefaz,
  opts?: { forcar?: boolean },
): Promise<ResultadoBusca> {
  if (!cfg.cert_pfx || !cfg.cert_senha)
    return base({ erro: "Suba o certificado e a senha primeiro." });
  if (!cfg.cnpj) return base({ erro: "Informe o CNPJ." });

  // Trava anti consumo indevido: não chama a SEFAZ antes da hora liberar.
  // (forcar=true pula a trava — usado logo após manifestar, quando há doc novo.)
  if (!opts?.forcar && cfg.bloqueado_ate && new Date(cfg.bloqueado_ate) > new Date()) {
    return base({
      erro: `Aguarde: a SEFAZ libera a próxima busca às ${horaBR(cfg.bloqueado_ate)}. Consultar antes disso reinicia a contagem de 1 hora.`,
      bloqueado_ate: cfg.bloqueado_ate,
    });
  }

  let ult = cfg.ult_nsu || "0";
  let maxNSU = "0";
  let importadas = 0;
  let resumos = 0;
  let falhas = 0;
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
          const r = await importarNota(doc.xml, supabase);
          if (r?.ok) importadas++;
          else falhas++;
        } else if (doc.schema.startsWith("resNFe")) {
          const r = await importarResumo(doc.xml, supabase);
          if (r?.ok) resumos++;
          else falhas++;
        } else if (doc.schema.includes("Evento")) {
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
        falhas++;
      }
    }

    ult = resp.ultNSU;
    maxNSU = resp.maxNSU;
    await supabase
      .from("config_sefaz")
      .update({ ult_nsu: ult, atualizado_em: new Date().toISOString() })
      .eq("id", cfg.id);

    if (resp.cStat !== "138") break; // 138 = ainda há documentos
    if (resp.ultNSU >= resp.maxNSU) break;
  }

  // Ainda há notas a puxar? (paramos pelo limite de páginas, não por acabar.)
  const maisDocs = !erro && cStat === "138" && ult < maxNSU;

  // Trava: se ainda há documentos, libera logo para continuar; senão espera 1h.
  const bloqueadoAte = new Date(
    Date.now() + (maisDocs ? 30 * 1000 : 60 * 60 * 1000),
  ).toISOString();
  const patch: Record<string, unknown> = { bloqueado_ate: bloqueadoAte };
  // Marca quando foi a última busca forçada, para a busca esperta espaçar bem.
  if (opts?.forcar) patch.forcado_em = new Date().toISOString();
  await supabase.from("config_sefaz").update(patch).eq("id", cfg.id);

  return { importadas, resumos, falhas, cStat, xMotivo, erro, bloqueado_ate: bloqueadoAte };
}

function base(p: Partial<ResultadoBusca>): ResultadoBusca {
  return { importadas: 0, resumos: 0, falhas: 0, cStat: "", xMotivo: "", ...p };
}
