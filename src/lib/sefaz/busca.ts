import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { soDigitos } from "@/lib/nfe";
import { distribuicaoDFe } from "@/lib/sefaz/distribuicao";
import { importarNota, importarResumo } from "@/app/(painel)/notas/actions";
import { marcarSinal, registrarErro, mensagemDe } from "@/lib/saude";
import { podeForcar } from "./trava";

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
  atualizado_em?: string | null;
  forcado_em?: string | null;
  reprocessado_em?: string | null;
  empresa_id?: string | null;
  ultimo_cstat?: string | null;
  falha_nsu?: string | null;
  falha_vezes?: number | null;
};

// A trava das buscas forçadas mora em ./trava (sem dependências, testada).
export { podeForcar } from "./trava";

export type ResultadoBusca = {
  importadas: number;
  resumos: number;
  falhas: number;
  cStat: string;
  xMotivo: string;
  erro?: string;
  bloqueado_ate?: string;
};

// A configuração da SEFAZ (com o certificado) só o dono lê pela própria sessão
// (migration 0277). O servidor lê com a chave administrativa, pela empresa.
// Só chamar depois de conferir a permissão de quem pediu.
export async function lerConfigSefaz(empresaId: string | null): Promise<ConfigSefaz | null> {
  if (!empresaId) return null;
  const { data } = await createAdminClient()
    .from("config_sefaz")
    .select("*")
    .eq("empresa_id", empresaId)
    .limit(1)
    .maybeSingle();
  return (data as ConfigSefaz | null) ?? null;
}

function horaBR(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Grava o NSU do documento na nota (pela chave), só se ainda não tiver — guarda
// o PRIMEIRO NSU visto (o do resumo), que é o que interessa para reprocessar por
// período sem perder a nota na borda.
async function gravarNsu(supabase: SupabaseClient, xml: string, nsu: string) {
  const chave = (xml.match(/\d{44}/) || [])[0];
  if (!chave || !nsu) return;
  await supabase
    .from("notas_fiscais")
    .update({ nsu })
    .eq("chave", chave)
    .is("nsu", null);
}

// Executa a busca na SEFAZ e importa o que vier. Recebe o cliente Supabase
// (sessão do usuário no botão; admin no cron) e a configuração já carregada.
export async function rodarBuscaSefaz(
  supabase: SupabaseClient,
  cfg: ConfigSefaz,
  opts?: { forcar?: boolean; manual?: boolean },
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
  // A busca forçada (depois de manifestar ou pelo botão) pula a trava, mas com
  // espaçamento mínimo e nunca depois de um 656.
  if (opts?.forcar) {
    const pode = podeForcar(cfg, !!opts.manual);
    if (!pode.ok) return base({ erro: pode.erro, bloqueado_ate: cfg.bloqueado_ate ?? undefined });
  }

  // O marcador e a trava ficam em config_sefaz, que a sessão de funcionário não
  // grava mais (0277): sempre pela chave administrativa.
  const adminCfg = createAdminClient();
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

    // Falha de GRAVAÇÃO (não "já existe") para o NSU nesse documento, pra
    // ele voltar na próxima busca (NFE-06). Na 3ª vez seguida no mesmo NSU,
    // segue em frente e fica no registro de erros (senão travaria tudo).
    let ultBom = ult;
    let parouEm: string | null = null;
    for (const doc of resp.docs) {
      let falhou: string | null = null;
      try {
        if (doc.schema.startsWith("procNFe")) {
          const r = await importarNota(doc.xml, supabase);
          if (r?.ok) importadas++;
          else if (/não parece uma NF-e válida/i.test(String(r?.erro ?? ""))) {
            // Defeito do próprio documento: tentar de novo não adianta. Registra e segue.
            await registrarErro("sefaz:documento-invalido", r?.erro ?? "inválido", { nsu: doc.nsu, schema: doc.schema }, cfg.empresa_id);
          } else if (!/já foi importada/i.test(String(r?.erro ?? ""))) falhou = String(r?.erro ?? "não gravou a nota");
          await gravarNsu(supabase, doc.xml, doc.nsu);
        } else if (doc.schema.startsWith("resNFe")) {
          const r = await importarResumo(doc.xml, supabase);
          if (r?.ok) resumos++;
          else if ((r as { semChave?: boolean })?.semChave) {
            await registrarErro("sefaz:documento-invalido", "resumo sem chave", { nsu: doc.nsu, schema: doc.schema }, cfg.empresa_id);
          } else if (!(r as { jaExiste?: boolean })?.jaExiste) falhou = "não gravou o resumo";
          await gravarNsu(supabase, doc.xml, doc.nsu);
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
      } catch (e) {
        falhou = mensagemDe(e);
      }
      if (falhou) {
        falhas++;
        const vezes = cfg.falha_nsu === doc.nsu ? (cfg.falha_vezes ?? 0) + 1 : 1;
        await registrarErro("sefaz:importar", falhou, { nsu: doc.nsu, schema: doc.schema, vezes }, cfg.empresa_id);
        if (vezes < 3) {
          await adminCfg.from("config_sefaz").update({ falha_nsu: doc.nsu, falha_vezes: vezes }).eq("id", cfg.id);
          parouEm = doc.nsu;
          break;
        }
      }
      ultBom = doc.nsu;
    }

    if (parouEm) {
      ult = ultBom;
      await adminCfg
        .from("config_sefaz")
        .update({ ult_nsu: ult, atualizado_em: new Date().toISOString() })
        .eq("id", cfg.id);
      erro = `Uma nota da SEFAZ não gravou (NSU ${parouEm}); ela volta na próxima busca.`;
      break;
    }

    ult = resp.ultNSU;
    maxNSU = resp.maxNSU;
    await adminCfg
      .from("config_sefaz")
      .update({ ult_nsu: ult, atualizado_em: new Date().toISOString() })
      .eq("id", cfg.id);

    if (resp.cStat !== "138") break; // 138 = ainda há documentos
    if (resp.ultNSU >= resp.maxNSU) break;
  }

  // 656 = "consumo indevido": a SEFAZ castigou. É erro (antes aparecia como ✓).
  if (!erro && cStat === "656") erro = `A SEFAZ bloqueou por excesso de consultas (656): ${xMotivo || "consumo indevido"}. Nova busca só depois de 1 hora.`;

  // Ainda há notas a puxar? (paramos pelo limite de páginas, não por acabar.)
  const maisDocs = !erro && cStat === "138" && ult < maxNSU;
  // Parou num documento que não gravou: a SEFAZ ainda tem documentos (não foi
  // 137), então pode voltar logo — a próxima rodada (10 min) tenta de novo.
  const parouNoErro = !!erro && /não gravou \(NSU/.test(erro);

  // Trava: se ainda há documentos, libera logo para continuar; senão espera 1h.
  const bloqueadoAte = new Date(
    Date.now() + (maisDocs ? 30 * 1000 : parouNoErro ? 5 * 60 * 1000 : 60 * 60 * 1000),
  ).toISOString();
  const agoraIso = new Date().toISOString();
  const boa = !erro && (cStat === "137" || cStat === "138");
  const patch: Record<string, unknown> = {
    bloqueado_ate: bloqueadoAte,
    // Última resposta (NFE-03): a Saúde do sistema e a tela da SEFAZ leem daqui.
    ultimo_cstat: cStat || null,
    ultimo_motivo: (erro ?? xMotivo ?? "").slice(0, 300) || null,
    ultima_busca_em: agoraIso,
  };
  if (boa) patch.ultima_busca_ok_em = agoraIso;
  if (boa && !falhas) { patch.falha_nsu = null; patch.falha_vezes = 0; }
  // Marca quando foi a última busca forçada, para a busca esperta espaçar bem.
  if (opts?.forcar) patch.forcado_em = agoraIso;
  const { error: ePatch } = await adminCfg.from("config_sefaz").update(patch).eq("id", cfg.id);
  // A trava de 1 hora NUNCA pode deixar de ser gravada (senão cada rodada bate
  // na SEFAZ e vem o 656): se o patch completo falhar, grava só a trava.
  if (ePatch) {
    await adminCfg.from("config_sefaz").update({ bloqueado_ate: bloqueadoAte, ...(opts?.forcar ? { forcado_em: agoraIso } : {}) }).eq("id", cfg.id);
    await registrarErro("sefaz:gravar-resposta", ePatch.message, null, cfg.empresa_id);
  }
  await marcarSinal(
    `sefaz:${cfg.empresa_id ?? cfg.id}`,
    boa,
    boa ? `cStat ${cStat} ${xMotivo}`.trim() : (erro ?? `cStat ${cStat} ${xMotivo}`),
    cfg.empresa_id,
  );

  return { importadas, resumos, falhas, cStat, xMotivo, erro, bloqueado_ate: bloqueadoAte };
}

function base(p: Partial<ResultadoBusca>): ResultadoBusca {
  return { importadas: 0, resumos: 0, falhas: 0, cStat: "", xMotivo: "", ...p };
}
