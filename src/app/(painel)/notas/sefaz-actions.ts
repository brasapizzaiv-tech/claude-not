"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { soDigitos } from "@/lib/nfe";
import { manifestarCiencia } from "@/lib/sefaz/manifestacao";
import { rodarBuscaSefaz, lerConfigSefaz, podeForcar } from "@/lib/sefaz/busca";

// O certificado só é lido pelo servidor (chave administrativa, filtrado pela
// empresa) e só depois de conferir a permissão "notas" de quem clicou. A sessão
// do usuário continua sendo usada nas notas (auditoria SEC-03, 08/11/2026).
async function getConfig() {
  await exigirAcesso("/notas");
  const supabase = await createClient();
  const cfg = await lerConfigSefaz(await empresaAtualId());
  return { supabase, cfg };
}

// Salva/atualiza o certificado e os dados do SEFAZ. Senha nunca vai ao cliente.
// Só o dono (/notas/sefaz está em SO_DONO).
export async function salvarConfigSefaz(dados: {
  cnpj: string;
  cuf: number;
  ambiente: number;
  cert_nome?: string;
  cert_pfx?: string; // base64 do .pfx (opcional em edições)
  cert_senha?: string;
  cert_validade?: string | null; // AAAA-MM-DD, digitada pelo dono (não lemos o certificado)
}) {
  await exigirAcesso("/notas/sefaz");
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false };
  const admin = createAdminClient();
  const cfg = await lerConfigSefaz(empresaId);
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
  if (dados.cert_validade !== undefined)
    patch.cert_validade = dados.cert_validade && /^\d{4}-\d{2}-\d{2}$/.test(dados.cert_validade) ? dados.cert_validade : null;

  if (cfg) await admin.from("config_sefaz").update(patch).eq("id", cfg.id).eq("empresa_id", empresaId);
  else await admin.from("config_sefaz").insert({ ...patch, empresa_id: empresaId });

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

  // 135 = evento registrado agora (a SEFAZ vai liberar o XML completo em
  // seguida). Marca a nota como manifestada para a busca esperta completá-la.
  // 136 (registrado, sem vínculo) e 573 (já estava manifestada) também valem.
  if (r.ok) {
    await supabase
      .from("notas_fiscais")
      .update({ manifestado_em: new Date().toISOString() })
      .eq("id", notaId);
  }

  return {
    ok: r.ok,
    cStat: r.cStat,
    xMotivo: r.xMotivo,
    erro: r.erro,
  };
}

// Manifesta VÁRIAS notas de uma vez e faz UMA busca no fim (não bate repetido
// na SEFAZ). A busca esperta completa o resto em seguida.
export async function manifestarVarias(notaIds: string[]) {
  let manifestadas = 0;
  let erros = 0;
  let ultimoErro = "";
  for (const id of notaIds) {
    const r = await manifestarNota(id);
    if (r.erro) {
      erros++;
      ultimoErro = r.erro;
    } else {
      manifestadas++;
    }
  }
  let importadas = 0;
  if (manifestadas > 0) {
    const { supabase, cfg } = await getConfig();
    if (cfg) {
      const b = await rodarBuscaSefaz(supabase, cfg, { forcar: true });
      importadas = b.importadas ?? 0;
    }
  }
  revalidatePath("/notas");
  return { ok: erros === 0, manifestadas, erros, importadas, erro: ultimoErro };
}

// Força UMA busca agora para puxar o XML completo (itens) das notas já
// manifestadas cujo XML a SEFAZ já liberou. É ação do usuário, então bypassa a
// trava — mas faz só UMA consulta (sem loop) para não cair no "656", e no
// máximo 1 vez por hora (NFE-02).
export async function completarItensAgora() {
  const { supabase, cfg } = await getConfig();
  if (!cfg) return { ok: false, erro: "Configure o certificado e o CNPJ primeiro." };
  const r = await rodarBuscaSefaz(supabase, cfg, { forcar: true, manual: true });
  revalidatePath("/notas");
  return {
    ok: !r.erro,
    importadas: r.importadas,
    resumos: r.resumos,
    erro: r.erro,
    xMotivo: r.xMotivo,
  };
}

// Manifesta e já tenta baixar a nota completa. A Receita SUSPENDEU a consulta
// por chave (consChNFe) em 2022 — só sobrou o distNSU. Depois de manifestar, a
// SEFAZ libera o XML completo com um pequeno atraso, então tentamos UMA busca
// (sem loop: bater repetido dispara "656 Consumo Indevido" e trava por 1h). Se
// não vier na hora, a busca automática completa em seguida.
export async function manifestarEBaixar(notaId: string) {
  const man = await manifestarNota(notaId);
  if (man.erro) return { ok: false, erro: man.erro };

  const { supabase, cfg } = await getConfig();
  if (!cfg?.cert_pfx || !cfg.cert_senha || !cfg.cnpj) {
    return { ok: true, cStat: man.cStat, xMotivo: man.xMotivo, completa: false };
  }

  async function temItens() {
    const { count } = await supabase
      .from("nota_itens")
      .select("id", { count: "exact", head: true })
      .eq("nota_id", notaId);
    return (count ?? 0) > 0;
  }
  let completa = await temItens();

  let extraErro = "";
  if (!completa) {
    const busca = await rodarBuscaSefaz(supabase, cfg, { forcar: true });
    completa = await temItens();
    extraErro = busca.erro
      ? busca.erro
      : `busca: ${busca.importadas ?? 0} nota(s), ${busca.resumos ?? 0} resumo(s), cStat ${busca.cStat} ${busca.xMotivo ?? ""}`;
  }

  revalidatePath(`/notas/${notaId}`);
  revalidatePath("/notas");

  return {
    ok: true,
    cStat: man.cStat,
    xMotivo: man.xMotivo,
    completa,
    buscaErro: completa ? "" : extraErro,
    diag: completa
      ? ""
      : `manifesto: ${man.cStat} ${man.xMotivo ?? ""} | ${extraErro}`,
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

// Reprocessa: volta o marcador (NSU) e puxa novamente (recupera notas puladas).
// Sem "dias" → desde o início (~90 dias que a SEFAZ guarda).
// Com "dias" (ex.: 15) → começa do NSU da nota mais antiga daquele período, para
// reprocessar só o recente (mais rápido). Se ainda não houver NSU guardado no
// período, cai para o início (a 1ª vez tem que ser completa para gravar os NSU).
export async function reprocessarSefaz(dias?: number) {
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

  // Reprocessar também pula a trava: no máximo 1 vez por hora e nunca depois
  // de um 656 (NFE-02).
  const pode = podeForcar(cfg, true);
  if (!pode.ok) return { importadas: 0, resumos: 0, falhas: 0, cStat: "", xMotivo: "", erro: pode.erro };

  let inicio = "0";
  if (dias && dias > 0) {
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: base } = await supabase
      .from("notas_fiscais")
      .select("nsu")
      .gte("data_emissao", corte)
      .not("nsu", "is", null)
      .order("nsu", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (base?.nsu) inicio = String(Math.max(0, Number(base.nsu) - 1));
  }

  await createAdminClient()
    .from("config_sefaz")
    .update({ ult_nsu: inicio })
    .eq("id", cfg.id);

  const r = await rodarBuscaSefaz(supabase, { ...cfg, ult_nsu: inicio }, { forcar: true, manual: true });
  revalidatePath("/notas");
  revalidatePath("/notas/sefaz");
  return r;
}
