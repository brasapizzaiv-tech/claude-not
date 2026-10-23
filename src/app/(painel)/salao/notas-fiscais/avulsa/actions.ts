"use server";

// Nota fiscal AVULSA (migration 0248): NF-e (55) e NFC-e (65) montadas à mão.
// Montagem e conferência em src/lib/fiscal/avulsa.ts; aqui o que fala com o
// banco e com o Focus.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { buscarCnpj, soDigitos } from "@/lib/fiscal/cnpj";
import { consultarNfe, emitirNfce, emitirNfe, type FocusAmbiente, type FocusResposta } from "@/lib/fiscal/focus";
import {
  agruparItens, conferirNota, montarNfceAvulsa, montarNfe, totalLinhas,
  type DestNota, type LinhaNota, type ModeloNota, type PadroesFiscais, type PerfilNota,
} from "@/lib/fiscal/avulsa";

const ACESSO = ["/salao", "/financeiro"];
type Db = Awaited<ReturnType<typeof createClient>>;

async function cfgFiscal(db: Db) {
  const { data } = await db.from("config_fiscal").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of (data as { chave: string; valor: string | null }[]) ?? []) cfg[r.chave] = r.valor ?? "";
  return cfg;
}

export async function buscarCnpjNota(cnpj: string) {
  await exigirAcesso(ACESSO);
  return buscarCnpj(cnpj);
}

// Grava (ou atualiza) o cliente com o que foi digitado, pra próxima nota vir pronta.
export async function salvarClienteNota(d: DestNota) {
  await exigirAcesso(ACESSO);
  const db = await createClient();
  const doc = soDigitos(d.doc);
  const linha = {
    nome: d.nome.trim().slice(0, 120),
    cpf_cnpj: doc || null,
    ie: soDigitos(d.ie) || null,
    indicador_ie: d.indicadorIe,
    logradouro: d.logradouro.trim() || null,
    numero: d.numero.trim() || null,
    complemento: d.complemento.trim() || null,
    bairro: d.bairro.trim() || null,
    municipio: d.municipio.trim() || null,
    uf: d.uf.trim().toUpperCase() || null,
    cep: soDigitos(d.cep) || null,
    email: d.email.trim() || null,
    telefone: soDigitos(d.telefone) || null,
  };
  if (!linha.nome) return { ok: false as const, mensagem: "Falta o nome." };
  let id = d.clienteId;
  if (!id && doc) {
    const { data: ja } = await db.from("clientes").select("id").eq("cpf_cnpj", doc).limit(1).maybeSingle();
    id = (ja?.id as string | undefined) ?? null;
  }
  if (id) {
    const { error } = await db.from("clientes").update(linha).eq("id", id);
    if (error) return { ok: false as const, mensagem: error.message };
  } else {
    const { data, error } = await db.from("clientes").insert(linha).select("id").single();
    if (error || !data) return { ok: false as const, mensagem: error?.message ?? "Não salvou o cliente." };
    id = data.id as string;
  }
  return { ok: true as const, id };
}

// O que esse cliente comprou no período (comandas fechadas no nome dele — no
// Kern, as entregas do convênio em "Saldo cliente"). Diz quais comandas já
// entraram numa nota avulsa, pra não faturar duas vezes.
export async function comprasDoCliente(clienteId: string, de: string, ate: string, soSaldo: boolean) {
  await exigirAcesso(ACESSO);
  const db = await createClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return { ok: false as const, mensagem: "Escolha as datas." };
  let q = db
    .from("pdv_comandas")
    .select("id, numero, valor_buffet, forma_pagamento, fechada_em")
    .eq("cliente_id", clienteId)
    .eq("status", "fechada")
    .gte("fechada_em", `${de}T03:00:00Z`)
    .lt("fechada_em", new Date(new Date(`${ate}T03:00:00Z`).getTime() + 86400000).toISOString())
    .order("fechada_em")
    .limit(1000);
  if (soSaldo) q = q.eq("forma_pagamento", "Saldo cliente");
  const { data: coms } = await q;
  const comandas = (coms as { id: string; numero: number; valor_buffet: number | null }[]) ?? [];
  if (comandas.length === 0) return { ok: true as const, linhas: [] as LinhaNota[], comandaIds: [] as string[], jaFaturadas: 0, total: 0 };
  const ids = comandas.map((c) => c.id);
  const [{ data: itens }, { data: notas }] = await Promise.all([
    db.from("pdv_comanda_itens").select("item_id, descricao, qtd, preco_unit").in("comanda_id", ids).limit(5000),
    db.from("nfce_emitidas").select("comanda_ids").eq("avulsa", true).eq("status", "autorizado").overlaps("comanda_ids", ids),
  ]);
  const ja = new Set(((notas as { comanda_ids: string[] | null }[]) ?? []).flatMap((n) => n.comanda_ids ?? []));
  const buffet = comandas.reduce((s, c) => s + Number(c.valor_buffet || 0), 0);
  const linhas = agruparItens((itens as { item_id: string | null; descricao: string | null; qtd: number; preco_unit: number }[]) ?? [], buffet);
  return { ok: true as const, linhas, comandaIds: ids, jaFaturadas: ids.filter((i) => ja.has(i)).length, total: totalLinhas(linhas) };
}

export type EmitirAvulsa = {
  modelo: ModeloNota;
  teste: boolean;               // homologação (sem valor fiscal)
  dest: DestNota;
  linhas: LinhaNota[];
  forma: string;
  observacao: string;
  comandaIds: string[];
};

// Espera a NF-e sair da fila do Focus (ela é assíncrona). Até ~30 s.
async function aguardarNfe(cfg: { token: string; ambiente: FocusAmbiente }, ref: string, primeira: FocusResposta) {
  let r = primeira;
  for (let i = 0; i < 12 && r.status === "processando_autorizacao"; i++) {
    await new Promise((ok) => setTimeout(ok, 2500));
    const c = await consultarNfe(cfg, ref);
    if (c.status) r = c;
  }
  return r;
}

export async function emitirNotaAvulsa(input: EmitirAvulsa) {
  await exigirAcesso(ACESSO);
  const db = await createClient();
  const erros = conferirNota(input.modelo, input.dest, input.linhas);
  if (erros.length) return { ok: false as const, mensagem: erros.join(" ") };

  const cfg = await cfgFiscal(db);
  if (cfg.emissor !== "focusnfe") return { ok: false as const, mensagem: "O emissor da Config fiscal não é o Focus." };
  const ambienteCaixa = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";
  const ambiente: FocusAmbiente = input.teste ? "homologacao" : ambienteCaixa;
  const token = input.teste
    ? cfg.emissor_token_homologacao || (ambienteCaixa === "homologacao" ? cfg.emissor_token : "")
    : cfg.emissor_token;
  if (!token) {
    return { ok: false as const, mensagem: input.teste ? "Pra nota de teste, coloque o token de HOMOLOGAÇÃO do Focus na Config fiscal." : "Falta o token do emissor na Config fiscal." };
  }

  // Perfis fiscais: o escolhido na linha, senão o do item, senão o da categoria.
  const itemIds = [...new Set(input.linhas.map((l) => l.itemId).filter(Boolean))] as string[];
  const [{ data: perfis }, { data: pdvItens }, { data: cats }] = await Promise.all([
    db.from("perfis_fiscais").select("id, ncm, cest, cfop, csosn, origem, unidade, pis_cst, cofins_cst").eq("ativo", true),
    itemIds.length ? db.from("pdv_itens").select("id, categoria, perfil_fiscal_id").in("id", itemIds) : Promise.resolve({ data: [] }),
    db.from("pdv_categorias").select("nome, perfil_fiscal_id"),
  ]);
  const perfilPorId = new Map(((perfis as PerfilNota[]) ?? []).map((p) => [p.id, p]));
  const catPerfil = new Map(((cats as { nome: string; perfil_fiscal_id: string | null }[]) ?? []).map((c) => [c.nome, c.perfil_fiscal_id]));
  const itemPerfil = new Map(((pdvItens as { id: string; categoria: string | null; perfil_fiscal_id: string | null }[]) ?? []).map((i) => [i.id, i.perfil_fiscal_id ?? (i.categoria ? catPerfil.get(i.categoria) ?? null : null)]));
  const perfilDe = (l: LinhaNota) => {
    const id = l.perfilId ?? (l.itemId ? itemPerfil.get(l.itemId) ?? null : null);
    return id ? perfilPorId.get(id) ?? null : null;
  };
  const pad: PadroesFiscais = {
    ncm: soDigitos(cfg.ncm_buffet) || "21069090",
    cfop: cfg.cfop_padrao || "5102",
    csosn: cfg.csosn_padrao || "102",
    ufEmitente: (cfg.uf || "RS").toUpperCase(),
  };
  const linhas = input.linhas.filter((l) => l.qtd > 0 && l.valorUnit > 0);
  const total = totalLinhas(linhas);
  const ref = `avl-${input.modelo}-${Date.now()}`;
  const cfgFocus = { token, ambiente };

  let r: FocusResposta;
  if (input.modelo === "nfe") {
    const serie = (cfg.nfe_serie || cfg.nfce_serie || "").trim() || undefined;
    const payload = montarNfe({ dest: input.dest, linhas, perfilDe, pad, forma: input.forma, observacao: input.observacao, cnpjEmitente: cfg.cnpj, serie, homologacao: ambiente === "homologacao" });
    r = await emitirNfe(cfgFocus, ref, payload);
    if (r.ok) r = await aguardarNfe(cfgFocus, ref, r);
  } else {
    const serie = (cfg.nfce_serie || "").trim() || undefined;
    const payload = montarNfceAvulsa({ dest: input.dest, linhas, perfilDe, pad, forma: input.forma, cnpjEmitente: cfg.cnpj, serie });
    r = await emitirNfce(cfgFocus, ref, payload);
  }

  const { data: gravada } = await db.from("nfce_emitidas").insert({
    modelo: input.modelo,
    ambiente,
    ref,
    status: r.status ?? (r.ok ? "autorizado" : "erro"),
    numero: r.numero ?? null,
    serie: r.serie ?? null,
    chave: r.chave ?? null,
    url_danfe: r.urlDanfe ?? null,
    url_xml: r.urlXml ?? null,
    mensagem: r.mensagem ?? null,
    valor: total,
    avulsa: true,
    cliente_id: input.dest.clienteId,
    destinatario: input.dest.nome.trim() || null,
    comanda_ids: input.comandaIds.length ? input.comandaIds : null,
    itens: linhas,
    observacao: input.observacao.trim() || null,
  }).select("id").single();
  revalidatePath("/salao/notas-fiscais");

  const autorizado = r.status === "autorizado";
  return {
    ok: autorizado || r.status === "processando_autorizacao",
    autorizado,
    id: (gravada?.id as string | undefined) ?? null,
    status: r.status ?? null,
    numero: r.numero ?? null,
    serie: r.serie ?? null,
    urlDanfe: r.urlDanfe ?? null,
    urlXml: r.urlXml ?? null,
    ambiente,
    mensagem: r.mensagem ?? null,
    erros: r.erros ? JSON.stringify(r.erros).slice(0, 800) : null,
  };
}

// NF-e que ficou "processando": consulta de novo e atualiza a linha.
export async function consultarNotaAvulsa(id: string) {
  await exigirAcesso(ACESSO);
  const db = await createClient();
  const { data: n } = await db.from("nfce_emitidas").select("ref, ambiente, modelo").eq("id", id).maybeSingle();
  if (!n) return { ok: false as const, mensagem: "Nota não encontrada." };
  if (n.modelo !== "nfe") return { ok: false as const, mensagem: "Só a NF-e precisa ser consultada." };
  const cfg = await cfgFiscal(db);
  const token = n.ambiente === "homologacao" && (cfg.emissor_ambiente || "homologacao") !== "homologacao" ? cfg.emissor_token_homologacao : cfg.emissor_token;
  if (!token) return { ok: false as const, mensagem: "Falta o token do emissor." };
  const r = await consultarNfe({ token, ambiente: n.ambiente as FocusAmbiente }, n.ref as string);
  await db.from("nfce_emitidas").update({
    status: r.status ?? null, numero: r.numero ?? null, serie: r.serie ?? null, chave: r.chave ?? null,
    url_danfe: r.urlDanfe ?? null, url_xml: r.urlXml ?? null, mensagem: r.mensagem ?? null,
  }).eq("id", id);
  revalidatePath("/salao/notas-fiscais");
  return { ok: r.status === "autorizado", status: r.status ?? null, numero: r.numero ?? null, urlDanfe: r.urlDanfe ?? null, mensagem: r.mensagem ?? null };
}
