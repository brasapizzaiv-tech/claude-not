"use server";

// Nota fiscal AVULSA (migration 0248): NF-e (55) e NFC-e (65) montadas à mão.
// Montagem e conferência em src/lib/fiscal/avulsa.ts; aqui o que fala com o
// banco e com o Focus.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { buscarCnpj, soDigitos } from "@/lib/fiscal/cnpj";
import { consultarNfe, emitirNfce, emitirNfe, type FocusAmbiente, type FocusResposta } from "@/lib/fiscal/focus";
import {
  agruparItens, conferirNota, montarNfceAvulsa, montarNfe, totalLinhas,
  type DestNota, type LinhaNota, type ModeloNota, type PadroesFiscais, type PerfilNota,
} from "@/lib/fiscal/avulsa";
import { explicarErro } from "@/lib/erro-amigavel";
import { saldoFiado } from "@/lib/fiado-saldo";

const ACESSO = ["/salao", "/financeiro"];
type Db = Awaited<ReturnType<typeof createClient>>;

// Lida no servidor: o token da Focus não é legível por funcionário no banco
// (migration 0275). Filtrada pela empresa de quem está emitindo.
async function cfgFiscal() {
  const empresaId = await empresaAtualId();
  const { data } = empresaId
    ? await createAdminClient().from("config_fiscal").select("chave, valor").eq("empresa_id", empresaId)
    : { data: [] };
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
    if (error) return { ok: false as const, mensagem: explicarErro(error) };
  } else {
    const { data, error } = await db.from("clientes").insert(linha).select("id").single();
    if (error || !data) return { ok: false as const, mensagem: explicarErro(error, "Não salvou o cliente.") };
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
  /** Quanto sai do saldo do cliente quando a nota for autorizada (0 = não mexe). */
  baixaSaldo?: number;
  /** Forma com que entra no caixa aberto (null = não entra no caixa). */
  caixaForma?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
// Formas que não servem pra entrada no caixa pela nota: têm fluxo próprio ou não são dinheiro.
const FORA_DO_CAIXA = new Set(["saldo", "equipe", "cortesia", "vale_presente"]);

async function saldoDe(db: Db, clienteId: string) {
  return saldoFiado(db, clienteId);
}

async function caixaAbertoId(db: Db) {
  const { data } = await db.from("pdv_caixas").select("id").eq("status", "aberto").order("aberto_em", { ascending: false }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Saldo em aberto do cliente (fiado), pra tela oferecer a baixa. */
export async function saldoClienteNota(clienteId: string | null) {
  await exigirAcesso(ACESSO);
  const db = await createClient();
  return { saldo: clienteId ? await saldoDe(db, clienteId) : 0, caixaAberto: !!(await caixaAbertoId(db)) };
}

// Depois de autorizada: dá a baixa no saldo e/ou lança no caixa, uma vez só
// (marca lancado_em antes; consultar de novo não lança duas vezes).
async function lancarDaNota(db: Db, notaId: string) {
  const { data: n } = await db
    .from("nfce_emitidas")
    .select("id, status, ambiente, modelo, numero, valor, cliente_id, destinatario, baixa_saldo, caixa_forma, lancado_em")
    .eq("id", notaId)
    .maybeSingle();
  if (!n || n.status !== "autorizado" || n.ambiente !== "producao" || n.lancado_em) return null;
  const baixa = r2(Number(n.baixa_saldo) || 0);
  const forma = (n.caixa_forma as string | null) || null;
  if (!(baixa > 0) && !forma) return null;
  const { data: marcada } = await db.from("nfce_emitidas").update({ lancado_em: new Date().toISOString() }).eq("id", notaId).is("lancado_em", null).select("id").maybeSingle();
  if (!marcada) return null;

  const rotulo = `${n.modelo === "nfe" ? "NF-e" : "NFC-e"} nº ${n.numero ?? "?"}`;
  const caixaId = forma ? await caixaAbertoId(db) : null;
  const avisos: string[] = [];
  const { data: quem } = await db.auth.getUser();
  let fiadoId: string | null = null;
  let movId: string | null = null;
  if (baixa > 0 && n.cliente_id) {
    const { data: f } = await db.from("cliente_fiado").insert({
      cliente_id: n.cliente_id,
      tipo: "pagamento",
      valor: baixa,
      descricao: `Baixa pela ${rotulo}`,
      forma_pagamento: forma ?? "Nota avulsa",
      caixa_id: caixaId,
      criado_por: quem.user?.id ?? null,
    }).select("id").single();
    fiadoId = (f?.id as string | undefined) ?? null;
    if (!fiadoId) avisos.push("A baixa no saldo não gravou. Lance em Fiado.");
  }
  if (forma) {
    if (!caixaId) avisos.push("O caixa fechou antes da nota sair: a entrada no caixa não foi lançada.");
    else {
      const { data: m } = await db.from("pdv_caixa_mov").insert({
        caixa_id: caixaId,
        tipo: "venda",
        descricao: `${rotulo} — ${(n.destinatario as string | null) ?? "nota avulsa"}`.slice(0, 200),
        forma_pagamento: forma,
        valor: baixa > 0 ? baixa : r2(Number(n.valor) || 0),
        comanda_id: null,
        // Com baixa no saldo é acerto de fiado (a venda já contou); sem baixa é venda do dia.
        recebe_fiado: baixa > 0,
      }).select("id").single();
      movId = (m?.id as string | undefined) ?? null;
      if (!movId) avisos.push("A entrada no caixa não gravou. Lance pelo caixa.");
    }
  }
  await db.from("nfce_emitidas").update({ fiado_id: fiadoId, mov_id: movId }).eq("id", notaId);
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/fiado");
  return avisos.length ? avisos.join(" ") : null;
}

/** Nota avulsa cancelada: desfaz a baixa e a entrada no caixa (se o caixa ainda está aberto). */
export async function desfazerLancamentosNota(notaId: string) {
  await exigirAcesso(["/salao", "/financeiro"]);
  const db = await createClient();
  const { data: n } = await db.from("nfce_emitidas").select("status, fiado_id, mov_id").eq("id", notaId).maybeSingle();
  // Só desfaz de nota que foi mesmo cancelada.
  if (!n || n.status !== "cancelado") return null;
  const avisos: string[] = [];
  if (n.fiado_id) {
    await db.from("cliente_fiado").delete().eq("id", n.fiado_id as string);
    avisos.push("A baixa no saldo do cliente foi desfeita.");
  }
  if (n.mov_id) {
    const { data: m } = await db.from("pdv_caixa_mov").select("caixa_id").eq("id", n.mov_id as string).maybeSingle();
    const { data: cx } = m?.caixa_id ? await db.from("pdv_caixas").select("status").eq("id", m.caixa_id as string).maybeSingle() : { data: null };
    if (cx?.status === "aberto") {
      await db.from("pdv_caixa_mov").delete().eq("id", n.mov_id as string);
      avisos.push("A entrada no caixa foi tirada.");
    } else {
      avisos.push("A entrada no caixa ficou, porque aquele caixa já fechou: acerte com uma sangria.");
    }
  }
  await db.from("nfce_emitidas").update({ fiado_id: null, mov_id: null }).eq("id", notaId);
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/fiado");
  return avisos.length ? avisos.join(" ") : null;
}

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

  const cfg = await cfgFiscal();
  if (cfg.emissor !== "focusnfe") return { ok: false as const, mensagem: "O emissor da Config fiscal não é o Focus." };
  const ambienteCaixa = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";
  const ambiente: FocusAmbiente = input.teste ? "homologacao" : ambienteCaixa;

  // Baixa no saldo e entrada no caixa: conferidas ANTES de emitir; nota de teste não mexe em nada.
  const totalNota = totalLinhas(input.linhas.filter((l) => l.qtd > 0 && l.valorUnit > 0));
  const baixaSaldo = ambiente === "producao" ? r2(Math.max(0, Number(input.baixaSaldo) || 0)) : 0;
  const caixaForma = ambiente === "producao" ? ((input.caixaForma ?? "").trim() || null) : null;
  if (baixaSaldo > 0) {
    if (!input.dest.clienteId) return { ok: false as const, mensagem: "Pra dar baixa no saldo, escolha o cliente do cadastro." };
    const saldo = await saldoDe(db, input.dest.clienteId);
    if (baixaSaldo > saldo + 0.005) return { ok: false as const, mensagem: `A baixa (${baixaSaldo.toFixed(2).replace(".", ",")}) é maior que o saldo em aberto do cliente (${saldo.toFixed(2).replace(".", ",")}).` };
    if (baixaSaldo > totalNota + 0.005) return { ok: false as const, mensagem: "A baixa no saldo não pode passar do total da nota." };
  }
  if (caixaForma) {
    if (!(await caixaAbertoId(db))) return { ok: false as const, mensagem: "Pra lançar no caixa, o caixa precisa estar aberto. Abra o caixa ou desmarque essa opção." };
    if (FORA_DO_CAIXA.has(tipoDe(caixaForma, await formasParaTipo()))) return { ok: false as const, mensagem: `"${caixaForma}" não serve pra entrada no caixa. Escolha dinheiro, Pix, cartão ou outra forma.` };
  }
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
    // Série da NF-e: a da Config fiscal se tiver; vazio = a configurada no painel do Focus.
    const serie = (cfg.nfe_serie || "").trim() || undefined;
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
    baixa_saldo: baixaSaldo,
    caixa_forma: caixaForma,
  }).select("id").single();
  revalidatePath("/salao/notas-fiscais");

  const autorizado = r.status === "autorizado";
  const aviso = autorizado && gravada?.id ? await lancarDaNota(db, gravada.id as string) : null;
  return {
    ok: autorizado || r.status === "processando_autorizacao",
    autorizado,
    aviso,
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
  const cfg = await cfgFiscal();
  const token = n.ambiente === "homologacao" && (cfg.emissor_ambiente || "homologacao") !== "homologacao" ? cfg.emissor_token_homologacao : cfg.emissor_token;
  if (!token) return { ok: false as const, mensagem: "Falta o token do emissor." };
  const r = await consultarNfe({ token, ambiente: n.ambiente as FocusAmbiente }, n.ref as string);
  await db.from("nfce_emitidas").update({
    status: r.status ?? null, numero: r.numero ?? null, serie: r.serie ?? null, chave: r.chave ?? null,
    url_danfe: r.urlDanfe ?? null, url_xml: r.urlXml ?? null, mensagem: r.mensagem ?? null,
  }).eq("id", id);
  revalidatePath("/salao/notas-fiscais");
  // Autorizou agora: faz a baixa e a entrada no caixa que ficaram combinadas.
  const aviso = r.status === "autorizado" ? await lancarDaNota(db, id) : null;
  return { ok: r.status === "autorizado", status: r.status ?? null, numero: r.numero ?? null, urlDanfe: r.urlDanfe ?? null, mensagem: r.mensagem ?? null, aviso };
}

// Busca de cliente na hora (no banco, em TODOS os clientes — a lista inteira
// passava de 1000 e o banco só devolvia os primeiros em ordem alfabética).
export async function buscarClientesNota(termo: string) {
  await exigirAcesso(ACESSO);
  const q = termo.trim();
  if (q.length < 2) return [];
  const db = await createClient();
  const d = soDigitos(q);
  const nome = q.replace(/[%_,()]/g, " ").trim();
  let consulta = db
    .from("clientes")
    .select("id, nome, cpf_cnpj, ie, indicador_ie, logradouro, numero, complemento, bairro, municipio, uf, cep, email, telefone")
    .eq("ativo", true)
    .order("nome")
    .limit(25);
  consulta = d.length >= 3 ? consulta.or(`nome.ilike.%${nome}%,cpf_cnpj.ilike.%${d}%`) : consulta.ilike("nome", `%${nome}%`);
  const { data } = await consulta;
  const lista = (data as import("./avulsa-client").ClienteNota[]) ?? [];
  // Quem começa com o que foi digitado vem primeiro.
  const ini = q.toLowerCase();
  return lista.sort((a, b) => Number(!a.nome.toLowerCase().startsWith(ini)) - Number(!b.nome.toLowerCase().startsWith(ini)));
}
