"use server";

import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcesso } from "@/lib/permissoes-server";
import { codigoFiscalDoTipo } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { emitirNfce, cancelarNfce, cancelarNfe, type FocusAmbiente, type FocusItem } from "@/lib/fiscal/focus";
import { repartirDesconto, totalComDesconto } from "@/lib/fiscal/desconto-nota";
import { pagamentosDaNota, type PagamentoVenda } from "@/lib/fiscal/pagamentos-nota";
import { desfazerLancamentosNota } from "./notas-fiscais/avulsa/actions";
import { atualizarPelaFocus, type LinhaNota } from "@/lib/fiscal/conferir-notas";
import { linhasDaNota, unidadeDaLinha, type ItemCoberto } from "@/lib/fiscal/recebimento-nota";
import { explicarErro } from "@/lib/erro-amigavel";
import { docValido, MSG_DOC_INVALIDO } from "@/lib/fiscal/cnpj";

// Mapa das nossas formas de pagamento -> código da NFC-e (Focus/SEFAZ).
const FORMA_FOCUS: Record<string, string> = {
  Dinheiro: "01",
  Pix: "17",
  "Cartão de crédito": "03",
  "Cartão de débito": "04",
  "Cartão de debito": "04",
  "Cartão de credito": "03",
  "Vale refeição": "11", // vale-refeição
  "Vale refeicao": "11",
  "Pix na máquina": "17",
  "Cartão": "03",
  "Saldo cliente": "05", // crédito loja (fiado)
  "Compra da equipe": "05",
};

// Primeiro o cadastro (o tipo da forma decide), depois o mapa fixo acima;
// nome desconhecido vai como dinheiro. "Dividido" (o caixa grava na comanda)
// não chega mais aqui na nota do caixa: ela usa os pagamentos da venda (COD-002).
async function codigoFiscalDaForma(nome: string): Promise<string> {
  const n = nome.trim().toLowerCase();
  const f = (await formasParaTipo()).find((x) => x.nome.trim().toLowerCase() === n);
  if (f) return codigoFiscalDoTipo(f.tipo);
  return FORMA_FOCUS[nome.trim()] || "01";
}

// Pagamentos de verdade das comandas da nota (pdv_caixa_mov), já com o código da
// SEFAZ. Estorno do TEF é venda negativa e abate a forma. Cortesia e vale-presente
// também fecham conta e entram (como "outros", pelo tipo do cadastro).
async function pagamentosDasComandas(supabase: ClienteSupabase, ids: string[]): Promise<PagamentoVenda[]> {
  const { data } = await supabase
    .from("pdv_caixa_mov")
    .select("forma_pagamento, valor, bandeira, tef_autorizacao")
    .or(`comanda_id.in.(${ids.join(",")}),comanda_ids.ov.{${ids.join(",")}}`)
    .in("tipo", ["venda", "cortesia", "vale_presente"])
    .limit(500);
  const linhas = (data as { forma_pagamento: string | null; valor: number; bandeira: string | null; tef_autorizacao: string | null }[]) ?? [];
  const codigos = new Map<string, string>();
  const out: PagamentoVenda[] = [];
  for (const m of linhas) {
    const nome = (m.forma_pagamento || "").trim();
    if (!nome) continue;
    if (!codigos.has(nome)) codigos.set(nome, await codigoFiscalDaForma(nome));
    out.push({ codigo: codigos.get(nome)!, valor: Number(m.valor) || 0, bandeira: m.bandeira, autorizacao: m.tef_autorizacao });
  }
  return out;
}

// Pagamentos de UM recebimento (nota por recebimento): só os movimentos dele.
async function pagamentosDosMovs(supabase: ClienteSupabase, movIds: string[]): Promise<PagamentoVenda[]> {
  if (movIds.length === 0) return [];
  const { data } = await supabase
    .from("pdv_caixa_mov")
    .select("forma_pagamento, valor, bandeira, tef_autorizacao")
    .in("id", movIds)
    .in("tipo", ["venda", "cortesia", "vale_presente"]);
  const out: PagamentoVenda[] = [];
  for (const m of (data as { forma_pagamento: string | null; valor: number; bandeira: string | null; tef_autorizacao: string | null }[]) ?? []) {
    const nome = (m.forma_pagamento || "").trim();
    if (!nome) continue;
    out.push({ codigo: await codigoFiscalDaForma(nome), valor: Number(m.valor) || 0, bandeira: m.bandeira, autorizacao: m.tef_autorizacao });
  }
  return out;
}

// Configuração fiscal da empresa, lida no servidor. O token da Focus e o CSC não
// são legíveis por funcionário no banco (migration 0275), e a fila automática roda
// sem ninguém logado: por isso a chave administrativa, sempre filtrada pela
// empresa da comanda/nota. Sem empresa, nada (não emite com config de outra).
async function cfgFiscal(empresaId: string | null | undefined) {
  const cfg: Record<string, string> = {};
  if (!empresaId) return cfg;
  const { data } = await createAdminClient().from("config_fiscal").select("chave, valor").eq("empresa_id", empresaId);
  for (const r of (data as { chave: string; valor: string | null }[]) ?? []) cfg[r.chave] = r.valor ?? "";
  return cfg;
}

// Interruptor da NFC-e automática (Pix/cartão). Guardado em config_fiscal.nfce_auto.
export async function definirNfceAuto(ligado: boolean) {
  await exigirAcesso(["/salao", "/pdv"]);
  const supabase = await createClient();
  await supabase
    .from("config_fiscal")
    .upsert(
      { empresa_id: await empresaAtualId(), chave: "nfce_auto", valor: ligado ? "1" : "0" },
      { onConflict: "empresa_id,chave" },
    );
  revalidatePath("/salao/caixa");
  revalidatePath("/pdv");
  return { ok: true as const };
}

// Estado da nota automática pra tela: ligada? e o fiscal está em produção?
export async function lerNfceAuto() {
  await exigirAcesso(["/salao", "/pdv"]);
  const cfg = await cfgFiscal(await empresaAtualId());
  return { ligado: cfg.nfce_auto === "1", producao: cfg.emissor_ambiente === "producao" && !!cfg.emissor_token };
}

// Emite a NFC-e de uma comanda (itens + buffet). Idempotente: se já tem uma
// autorizada, devolve ela. Códigos fiscais: padrões da Config (fallback típico).
// documento: CPF (11 dígitos) ou CNPJ (14) do consumidor, opcional. Se não vier
// e a comanda tiver cliente vinculado, usa o documento e o nome dele.
export async function emitirNfceComanda(comandaId: string, documento?: string) {
  return emitirNfceComandas([comandaId], documento);
}

// Uma NFC-e pra VÁRIAS comandas pagas juntas no caixa (itens e buffet de todas
// numa nota só). Com uma comanda, é a emissão normal.
type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

// Miolo da emissão. Recebe o cliente do banco porque roda em dois cenários:
// pelo caixa (sessão do usuário) e pela fila automática (sem usuário logado).
async function emitirNfceCore(supabase: ClienteSupabase, comandaIds: string[], documento?: string, recebimentoId?: string | null) {
  // Nota por RECEBIMENTO (migration 0297): só o que aquele pagamento cobriu.
  // Sem recebimento (venda antiga, PDV, delivery, tela da comanda), a nota é da
  // comanda inteira, como sempre foi.
  type Recebimento = { id: string; comanda_ids: string[]; itens: ItemCoberto[]; mov_ids: string[]; desconto: number; cliente_id: string | null };
  let rec: Recebimento | null = null;
  if (recebimentoId) {
    const { data } = await supabase.from("pdv_recebimentos").select("id, comanda_ids, itens, mov_ids, desconto, cliente_id").eq("id", recebimentoId).maybeSingle();
    rec = (data as Recebimento | null) ?? null;
    if (!rec) return { ok: false, mensagem: "Não achei esse recebimento. Confira em Notas fiscais." };
  }
  const ids = [...new Set(((rec?.comanda_ids?.length ? rec.comanda_ids : comandaIds) ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false, mensagem: "Nenhuma comanda." };
  const comandaId = ids[0];
  let docLimpo = (documento || "").replace(/\D/g, "");
  let nomeDest: string | undefined;
  const dasComandas = `comanda_id.in.(${ids.join(",")}),comanda_ids.ov.{${ids.join(",")}}`;
  // No recebimento, as outras notas da comanda são de OUTROS pagamentos (cada
  // pessoa a sua): só conta a deste recebimento.
  const filtroNotas = rec ? `recebimento_id.eq.${rec.id}` : dasComandas;
  const filtroAndamento = rec ? `recebimento_id.eq.${rec.id},and(recebimento_id.is.null,or(${dasComandas}))` : dasComandas;

  // Nota dessa venda ainda em andamento (enviando agora, ou a SEFAZ processando):
  // emitir de novo daria duas notas pra mesma venda (FIS-01/NFE-01).
  const { data: andando } = await supabase
    .from("nfce_emitidas")
    .select("id, status, criado_em")
    .or(filtroAndamento)
    .in("status", ["processando_autorizacao", "enviando"])
    .gte("criado_em", new Date(Date.now() - 2 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (andando) return { ok: false, mensagem: "A nota dessa venda está sendo emitida agora. Espere um minuto e confira em Notas fiscais." };

  if (!rec) {
    const { data: recs } = await supabase
      .from("pdv_recebimentos")
      .select("id")
      .overlaps("comanda_ids", ids)
      .order("criado_em", { ascending: true })
      .limit(20);
    const recIds = ((recs as { id: string }[]) ?? []).map((r) => r.id);
    if (recIds.length > 0) {
      const { data: notasRec } = await supabase
        .from("nfce_emitidas")
        .select("recebimento_id")
        .in("recebimento_id", recIds)
        .eq("status", "autorizado");
      const comNota = new Set(((notasRec as { recebimento_id: string }[]) ?? []).map((n) => n.recebimento_id));
      if (comNota.size > 0) {
        const falta = recIds.find((id) => !comNota.has(id));
        if (falta) return emitirNfceCore(supabase, ids, documento, falta);
      }
    }
  }

  // Já autorizada? devolve. No recebimento: a dele, ou uma da comanda inteira
  // (emitida antes de existir a nota por recebimento — ela já cobre tudo).
  let { data: jaTem } = await supabase
    .from("nfce_emitidas")
    .select("*")
    .or(filtroNotas)
    .eq("status", "autorizado")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!jaTem && rec) {
    jaTem = (await supabase
      .from("nfce_emitidas")
      .select("*")
      .or(dasComandas)
      .is("recebimento_id", null)
      .eq("modelo", "nfce")
      .eq("status", "autorizado")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle()).data;
  }
  if (jaTem)
    return { ok: true, jaEmitida: true, id: jaTem.id as string, status: "autorizado", numero: jaTem.numero, chave: jaTem.chave, urlDanfe: jaTem.url_danfe, mensagem: undefined as string | undefined };

  const { data: comsData } = await supabase
    .from("pdv_comandas")
    .select("id, numero, valor_buffet, forma_pagamento, cliente_id, desconto_nota, empresa_id")
    .in("id", ids);
  const coms = (comsData ?? []) as { id: string; numero: number; valor_buffet: number | null; forma_pagamento: string | null; cliente_id: string | null; desconto_nota: number | null; empresa_id: string | null }[];
  if (coms.length === 0) return { ok: false, mensagem: "Comanda não encontrada." };

  const cfg = await cfgFiscal(coms[0].empresa_id);
  if (cfg.emissor !== "focusnfe") return { ok: false, mensagem: "Emissor não é o Focus na Config fiscal." };
  if (!cfg.emissor_token) return { ok: false, mensagem: "Falta o token do emissor na Config fiscal." };
  const ambiente = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";
  const com = {
    forma_pagamento: coms.find((c) => c.forma_pagamento)?.forma_pagamento ?? null,
    // No recebimento, só o cliente escolhido NELE: o da comanda pode ter sido
    // gravado pelo pagamento de outra pessoa (a nota sairia com o CPF dela).
    cliente_id: rec ? rec.cliente_id ?? null : coms.find((c) => c.cliente_id)?.cliente_id ?? null,
  };
  if (!docLimpo && com.cliente_id) {
    const { data: cli } = await supabase.from("clientes").select("nome, cpf_cnpj").eq("id", com.cliente_id as string).maybeSingle();
    const d = String((cli as { cpf_cnpj?: string | null } | null)?.cpf_cnpj ?? "").replace(/\D/g, "");
    // Documento do cadastro com dígito errado fica de fora (a SEFAZ recusaria a nota toda).
    if (docValido(d)) {
      docLimpo = d;
      nomeDest = ((cli as { nome?: string } | null)?.nome ?? "").trim().slice(0, 60) || undefined;
    }
  }
  if (docLimpo && !docValido(docLimpo)) {
    return { ok: false, mensagem: MSG_DOC_INVALIDO };
  }

  // Recebimento: as linhas são o que ele cobriu; comanda: todos os itens.
  const linhasRec = rec ? linhasDaNota(rec.itens ?? [], coms.length > 1) : null;
  const { data: itensData } = linhasRec
    ? { data: linhasRec.filter((l) => l.tipo === "item").map((l) => ({ descricao: l.descricao, qtd: l.qtd, preco_unit: l.preco_unit, item_id: l.item_id })) }
    : await supabase
      .from("pdv_comanda_itens")
      .select("descricao, qtd, preco_unit, item_id")
      .in("comanda_id", ids);

  const NCM = cfg.ncm_buffet || "21069090";
  const CFOP = cfg.cfop_padrao || "5102";
  const CSOSN = cfg.csosn_padrao || "102";

  // Perfil fiscal de cada item: o do item, senão o da categoria, senão o padrão.
  type Perfil = { id: string; ncm: string | null; cest: string | null; cfop: string; csosn: string; origem: string; unidade: string; pis_cst: string; cofins_cst: string };
  type InfoItem = { id: string; categoria: string | null; perfil_fiscal_id: string | null; por_kg?: boolean | null };
  const itemIds = [...new Set((itensData ?? []).map((i) => i.item_id as string | null).filter(Boolean))] as string[];
  const [{ data: pdvItens }, { data: cats }, { data: perfis }] = await Promise.all([
    itemIds.length ? supabase.from("pdv_itens").select("id, categoria, perfil_fiscal_id, por_kg").in("id", itemIds) : Promise.resolve({ data: [] as InfoItem[] }),
    supabase.from("pdv_categorias").select("nome, perfil_fiscal_id"),
    supabase.from("perfis_fiscais").select("id, ncm, cest, cfop, csosn, origem, unidade, pis_cst, cofins_cst").eq("ativo", true),
  ]);
  const perfilDe = new Map(((perfis as Perfil[]) ?? []).map((p) => [p.id, p]));
  const catPerfil = new Map(((cats as { nome: string; perfil_fiscal_id: string | null }[]) ?? []).map((c) => [c.nome, c.perfil_fiscal_id]));
  const itemInfo = new Map(((pdvItens as InfoItem[]) ?? []).map((i) => [i.id, i]));
  const perfilDoItem = (itemId: string | null): Perfil | null => {
    if (!itemId) return null;
    const i = itemInfo.get(itemId);
    if (!i) return null;
    const pid = i.perfil_fiscal_id ?? (i.categoria ? catPerfil.get(i.categoria) : null) ?? null;
    return pid ? perfilDe.get(pid) ?? null : null;
  };

  const items: FocusItem[] = [];
  let total = 0;
  let n = 0;
  const buffets = linhasRec
    ? linhasRec.filter((l) => l.tipo === "buffet").map((l) => ({ descricao: l.descricao, qtd: l.qtd, preco: l.preco_unit, bruto: l.bruto }))
    : coms.filter((c) => Number(c.valor_buffet || 0) > 0).map((c) => {
      const v = Number(c.valor_buffet || 0);
      return { descricao: coms.length > 1 ? `Buffet (comanda ${c.numero})` : "Buffet", qtd: 1, preco: v, bruto: v };
    });
  for (const b of buffets) {
    n++;
    total += b.bruto;
    items.push({
      numero_item: String(n),
      codigo_produto: "BUFFET",
      descricao: b.descricao,
      cfop: CFOP,
      unidade_comercial: "KG",
      quantidade_comercial: b.qtd.toFixed(4),
      valor_unitario_comercial: b.preco.toFixed(2),
      valor_bruto: b.bruto.toFixed(2),
      codigo_ncm: NCM,
      icms_origem: "0",
      icms_situacao_tributaria: CSOSN,
    });
  }
  for (const it of itensData ?? []) {
    const qtd = Number(it.qtd) || 0;
    const preco = Number(it.preco_unit) || 0;
    if (qtd <= 0) continue;
    const bruto = Math.round(qtd * preco * 100) / 100;
    n++;
    total += bruto;
    const pf = perfilDoItem(it.item_id as string | null);
    // KG só no item vendido por peso (0259). Item dividido (meia Coca = 0,5)
    // continua na unidade dele. Sem o cadastro do item, vale a regra antiga.
    const info = it.item_id ? itemInfo.get(it.item_id as string) : undefined;
    const porKg = info ? !!info.por_kg : !Number.isInteger(qtd);
    items.push({
      numero_item: String(n),
      codigo_produto: (it.item_id as string | null)?.slice(0, 8) ?? `ITEM${n}`,
      descricao: ((it.descricao as string) || "Item").split("\n")[0].slice(0, 120),
      cfop: pf?.cfop || CFOP,
      // Item vendido por kg (migration 0259): quantidade quebrada = peso, sai em KG.
      unidade_comercial: unidadeDaLinha({ tipo: "item", item_id: null, descricao: "", qtd, preco_unit: preco, bruto }, porKg, pf?.unidade),
      quantidade_comercial: qtd.toFixed(4),
      valor_unitario_comercial: preco.toFixed(2),
      valor_bruto: bruto.toFixed(2),
      codigo_ncm: pf?.ncm || NCM,
      icms_origem: pf?.origem || "0",
      icms_situacao_tributaria: pf?.csosn || CSOSN,
      ...(pf?.cest ? { cest: pf.cest } : {}),
      ...(pf ? { pis_situacao_tributaria: pf.pis_cst || "49", cofins_situacao_tributaria: pf.cofins_cst || "49" } : {}),
    });
  }
  total = Math.round(total * 100) / 100;
  if (items.length === 0 || total <= 0) return { ok: false, mensagem: "Comanda sem itens/valor para emitir." };

  // Desconto dado no recebimento (caixa/PDV, migration 0273) + o do pedido de
  // delivery/app (cupom e cashback ficam em delivery_pedidos.desconto): sai em
  // cada item, pro total da nota bater com o que o cliente pagou.
  // No recebimento, só o desconto dado NELE (o caixa do salão não recebe pedido do app).
  const { data: pedsDesc } = rec ? { data: [] } : await supabase.from("delivery_pedidos").select("desconto").in("comanda_id", ids);
  const descontoPedido = ((pedsDesc as { desconto: number | null }[]) ?? []).reduce((s, p) => s + Math.max(0, Number(p.desconto) || 0), 0);
  const desconto = rec
    ? Math.round(Math.max(0, Number(rec.desconto) || 0) * 100) / 100
    : Math.round((coms.reduce((s, c) => s + Math.max(0, Number(c.desconto_nota) || 0), 0) + descontoPedido) * 100) / 100;
  if (desconto > 0) {
    if (desconto >= total - 0.005) return { ok: false, mensagem: "Venda com 100% de desconto não emite nota." };
    const partes = repartirDesconto(items.map((i) => Number(i.valor_bruto)), desconto);
    items.forEach((i, k) => { if (partes[k] > 0) i.valor_desconto = partes[k].toFixed(2); });
  }
  const liquido = totalComDesconto(total, desconto);

  // Formas de pagamento: as da venda de verdade, repartidas até o total da nota
  // (COD-002). Sem pagamento registrado (venda antiga, pedido pago fora do
  // caixa), vale a forma da comanda, como antes.
  let formasPagamento = pagamentosDaNota(rec ? await pagamentosDosMovs(supabase, rec.mov_ids ?? []) : await pagamentosDasComandas(supabase, ids), liquido);
  if (rec && formasPagamento.length === 0) formasPagamento = pagamentosDaNota(await pagamentosDasComandas(supabase, ids), liquido);
  if (formasPagamento.length === 0) {
    const forma = await codigoFiscalDaForma((com.forma_pagamento as string) || "");
    formasPagamento = pagamentosDaNota([{ codigo: forma, valor: liquido }], liquido);
  }

  // Tentativa anterior que caiu no meio (conexão, função interrompida): a Focus
  // pode ter autorizado sem a resposta chegar. Pergunta antes de emitir outra —
  // senão saíam duas notas da mesma venda (FIS-01).
  const tokenEmissao = { token: cfg.emissor_token, ambiente };
  const { data: tentativas } = await supabase
    .from("nfce_emitidas")
    .select("id, ref, status, mensagem, modelo, ambiente, empresa_id")
    .or(filtroAndamento)
    .eq("modelo", "nfce")
    .eq("ambiente", ambiente)
    .gte("criado_em", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("criado_em", { ascending: false })
    .limit(20);
  const caidas = ((tentativas as LinhaNota[] | null) ?? [])
    .filter((t) => t.status === "enviando" || t.status === "processando_autorizacao" || (t.status === "erro" && (t.mensagem ?? "").startsWith("Falha de conexão")))
    .slice(0, 3);
  for (const t of caidas) {
    const a = await atualizarPelaFocus(supabase, t, tokenEmissao);
    if (!a) return { ok: false, mensagem: "Não consegui confirmar com a Focus se a tentativa anterior saiu. Tente de novo em 1 minuto." };
    if (a.status === "autorizado") {
      for (const id of ids) revalidatePath(`/salao/comandas/${id}`);
      return { ok: true, jaEmitida: true, id: t.id, status: "autorizado", numero: a.numero, chave: a.chave, urlDanfe: a.urlDanfe, mensagem: undefined as string | undefined };
    }
    if (a.status === "processando_autorizacao") return { ok: false, mensagem: "A nota dessa venda ainda está em processamento na SEFAZ. Confira em Notas fiscais daqui a alguns minutos." };
  }

  const bras =new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000);
  const iso = bras.toISOString().slice(0, 19) + "-03:00";
  const ref = `cmd-${comandaId.slice(0, 8)}-${Date.now()}`;

  // Registra a tentativa ANTES de mandar (status "enviando"): se a função cair
  // no meio, a próxima sabe qual ref perguntar à Focus em vez de emitir outra.
  const { data: reservada } = await supabase.from("nfce_emitidas").insert({
    comanda_id: comandaId,
    comanda_ids: ids,
    recebimento_id: rec?.id ?? null,
    modelo: "nfce",
    ambiente,
    ref,
    status: "enviando",
    valor: liquido,
  }).select("id").single();

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
      ...(docLimpo.length === 11 ? { cpf_destinatario: docLimpo } : {}),
      ...(docLimpo.length === 14 ? { cnpj_destinatario: docLimpo } : {}),
      ...(docLimpo && nomeDest ? { nome_destinatario: nomeDest } : {}),
      serie: (cfg.nfce_serie || "").trim() || undefined,
      items,
      formas_pagamento: formasPagamento,
    },
  );

  const resultado = {
    status: r.status ?? (r.ok ? "autorizado" : "erro"),
    numero: r.numero ?? null,
    serie: r.serie ?? null,
    chave: r.chave ?? null,
    url_danfe: r.urlDanfe ?? null,
    url_xml: r.urlXml ?? null,
    mensagem: r.mensagem ?? null,
  };
  let gravada: { id?: string } | null = null;
  if (reservada?.id) {
    await supabase.from("nfce_emitidas").update(resultado).eq("id", reservada.id);
    gravada = { id: reservada.id as string };
  } else {
    gravada = (await supabase.from("nfce_emitidas").insert({
      comanda_id: comandaId, comanda_ids: ids, recebimento_id: rec?.id ?? null, modelo: "nfce", ambiente, ref, valor: liquido, ...resultado,
    }).select("id").single()).data;
  }

  for (const id of ids) revalidatePath(`/salao/comandas/${id}`);
  return {
    ok: r.ok,
    id: (gravada?.id as string | undefined) ?? undefined,
    status: r.status,
    numero: r.numero,
    chave: r.chave,
    urlDanfe: r.urlDanfe,
    mensagem: r.mensagem,
    erros: r.erros ? JSON.stringify(r.erros).slice(0, 500) : undefined,
  };
}

// Emissão pedida por uma pessoa no caixa/PDV/delivery.
export async function emitirNfceComandas(comandaIds: string[], documento?: string, recebimentoId?: string | null) {
  const supabase = await createClient();
  // Caixa do salão, PDV de balcão e delivery emitem nota.
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  return emitirNfceCore(supabase, comandaIds, documento, recebimentoId);
}

// Emissão automática (fila de notas pendentes), sem usuário logado. Só é
// chamada pela rota que o agente de impressão consome, já autenticada.
export async function emitirNfceComandasAdmin(
  admin: unknown,
  comandaIds: string[],
  documento?: string,
  recebimentoId?: string | null,
) {
  clienteDoServidor(admin);
  return emitirNfceCore(admin as ClienteSupabase, comandaIds, documento, recebimentoId);
}

// Estas duas "Admin" existem pra rotina da fila (src/lib/fiscal/pendentes.ts),
// que passa o cliente administrativo. Como o arquivo é "use server", elas
// também viram endereço chamável do navegador (SEC-11) — mas do navegador só
// chega JSON, nunca um cliente com funções. Esta trava garante que nada roda.
function clienteDoServidor(admin: unknown) {
  if (!admin || typeof (admin as { from?: unknown }).from !== "function") throw new Error("Sem permissão para esta ação.");
}

// Manda o cupom da NFC-e (DANFE) pra impressora marcada na Central de
// Impressões ("Imprime o cupom da NFC-e"). Devolve quantos jobs entraram.
async function imprimirNfceCore(supabase: ClienteSupabase, nfceId: string) {
  const { data: nota } = await supabase.from("nfce_emitidas").select("id, url_danfe, status").eq("id", nfceId).maybeSingle();
  if (!nota) return { ok: false as const, mensagem: "Nota não encontrada." };
  if (!nota.url_danfe) return { ok: false as const, mensagem: "Essa nota não tem DANFE pra imprimir." };
  const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
  if (ids.length === 0) return { ok: false as const, mensagem: "Nenhuma impressora marcada pra NFC-e na Central de Impressões." };
  const { error } = await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "nfce", ref_id: nfceId, impressora_id })));
  if (error) return { ok: false as const, mensagem: explicarErro(error) };
  return { ok: true as const, total: ids.length };
}

export async function imprimirNfce(nfceId: string) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  return imprimirNfceCore(supabase, nfceId);
}

// Impressão disparada pela fila automática (sem usuário logado).
export async function imprimirNfceAdmin(admin: unknown, nfceId: string) {
  clienteDoServidor(admin);
  return imprimirNfceCore(admin as ClienteSupabase, nfceId);
}

// Cancela uma NFC-e já autorizada (dentro do prazo legal). Justificativa >= 15
// caracteres (exigência da SEFAZ).
export async function cancelarNfceEmitida(id: string, justificativa: string) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  const just = (justificativa || "").trim();
  if (just.length < 15) return { ok: false, mensagem: "A justificativa precisa ter pelo menos 15 caracteres." };

  const { data: nota } = await supabase
    .from("nfce_emitidas")
    .select("id, ref, ambiente, status, mensagem, modelo, empresa_id, fiado_id, mov_id")
    .eq("id", id)
    .maybeSingle();
  if (!nota) return { ok: false, mensagem: "Nota não encontrada." };
  if (nota.status !== "autorizado" && nota.status !== "cancelando") return { ok: false, mensagem: "Só dá pra cancelar nota autorizada." };

  const cfg = await cfgFiscal(nota.empresa_id as string | null);
  // Nota de teste (homologação) feita com o caixa em produção usa o token de homologação.
  const amb = (nota.ambiente as FocusAmbiente) || "homologacao";
  const token = amb === "homologacao" && (cfg.emissor_ambiente || "homologacao") !== "homologacao" ? cfg.emissor_token_homologacao : cfg.emissor_token;
  if (!token) return { ok: false, mensagem: "Falta o token do emissor." };

  // Cancelamento que ficou em processamento: pergunta à Focus antes. Se a SEFAZ
  // já cancelou, só falta desfazer a baixa no saldo/caixa (NFE-07).
  if (nota.status === "cancelando") {
    const a = await atualizarPelaFocus(createAdminClient(), { ...(nota as LinhaNota), fiado_id: null, mov_id: null }, { token, ambiente: amb });
    if (a?.status === "cancelado") {
      await supabase.from("nfce_emitidas").update({ mensagem: just }).eq("id", id);
      const aviso = await desfazerLancamentosNota(id);
      revalidatePath("/salao/notas-fiscais");
      return { ok: true, status: "cancelado", mensagem: undefined, aviso };
    }
    if (a?.status === "cancelando" || !a) return { ok: false, mensagem: "A SEFAZ ainda está processando o cancelamento. Tente de novo em alguns minutos." };
  }

  // NF-e (nota avulsa pra empresa) cancela por outro endereço do Focus.
  const r = await (nota.modelo === "nfe" ? cancelarNfe : cancelarNfce)({ token, ambiente: amb }, nota.ref as string, just);
  let aviso: string | null = null;
  if (r.ok && r.status === "processando_cancelamento") {
    // A SEFAZ ainda não respondeu: a nota continua valendo até confirmar. A
    // rotina /api/fiscal/conferir pergunta de novo (NFE-07).
    await supabase.from("nfce_emitidas").update({ status: "cancelando", mensagem: `Cancelamento enviado, aguardando a SEFAZ (${just})` }).eq("id", id);
    aviso = "A SEFAZ ainda está processando o cancelamento. A situação da nota atualiza sozinha em até meia hora.";
  } else if (r.ok) {
    await supabase.from("nfce_emitidas").update({ status: "cancelado", mensagem: just }).eq("id", id);
    // Nota avulsa que deu baixa no saldo ou entrou no caixa: desfaz (migration 0274).
    aviso = await desfazerLancamentosNota(id);
  }
  revalidatePath("/salao/notas-fiscais");
  return { ok: r.ok, status: r.status, mensagem: r.mensagem, aviso };
}

// Cancela itens específicos de comandas (a "Cancelar produtos" da mesa). Registra
// o motivo no log e apaga os itens. Só cancela itens ainda NÃO pagos.
export async function cancelarItensComanda(itemIds: string[], motivo: string) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  const just = (motivo || "").trim();
  if (just.length < 3) return { ok: false, mensagem: "Informe o motivo (mín. 3 caracteres)." };
  if (itemIds.length === 0) return { ok: false, mensagem: "Selecione ao menos um item." };

  const { data: itens } = await supabase
    .from("pdv_comanda_itens")
    .select("id, descricao, qtd, preco_unit, pago, comanda_id")
    .in("id", itemIds);
  const canc = (itens ?? []).filter((i) => !i.pago); // não cancela item já pago
  if (canc.length === 0) return { ok: false, mensagem: "Nada a cancelar (itens já pagos não podem ser cancelados aqui)." };

  const comIds = [...new Set(canc.map((i) => i.comanda_id as string))];
  const { data: coms } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa")
    .in("id", comIds);
  const comInfo = new Map((coms ?? []).map((c) => [c.id as string, { numero: c.numero as number, mesa: c.mesa as string | null }]));
  const { data: userData } = await supabase.auth.getUser();

  await supabase.from("pdv_itens_cancelados").insert(
    canc.map((i) => {
      const ci = comInfo.get(i.comanda_id as string);
      return {
        comanda_numero: ci?.numero ?? null,
        mesa: ci?.mesa ?? null,
        descricao: (i.descricao as string) || null,
        qtd: Number(i.qtd),
        valor: Number(i.qtd) * Number(i.preco_unit),
        motivo: just,
        cancelado_por: userData.user?.id ?? null,
      };
    }),
  );
  await supabase.from("pdv_comanda_itens").delete().in("id", canc.map((i) => i.id as string));

  revalidatePath("/salao");
  return { ok: true, cancelados: canc.length };
}
