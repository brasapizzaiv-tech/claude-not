"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { emitirNfce, cancelarNfce, type FocusAmbiente, type FocusItem } from "@/lib/fiscal/focus";

// Mapa das nossas formas de pagamento -> código da NFC-e (Focus/SEFAZ).
const FORMA_FOCUS: Record<string, string> = {
  Dinheiro: "01",
  Pix: "17",
  "Cartão de crédito": "03",
  "Cartão de débito": "04",
  "Cartão de debito": "04",
  "Cartão de credito": "03",
  "Saldo cliente": "05", // crédito loja (fiado)
};

async function cfgFiscal(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("config_fiscal").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.chave] = r.valor ?? "";
  return cfg;
}

// Interruptor da NFC-e automática (Pix/cartão). Guardado em config_fiscal.nfce_auto.
export async function definirNfceAuto(ligado: boolean) {
  await exigirAcesso(["/salao", "/pdv"]);
  const supabase = await createClient();
  await supabase.from("config_fiscal").upsert({ chave: "nfce_auto", valor: ligado ? "1" : "0" });
  revalidatePath("/salao/caixa");
  revalidatePath("/pdv");
  return { ok: true as const };
}

// Estado da nota automática pra tela: ligada? e o fiscal está em produção?
export async function lerNfceAuto() {
  const supabase = await createClient();
  const cfg = await cfgFiscal(supabase);
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
export async function emitirNfceComandas(comandaIds: string[], documento?: string) {
  const supabase = await createClient();
  // Caixa do salão, PDV de balcão e delivery emitem nota.
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const ids = [...new Set((comandaIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false, mensagem: "Nenhuma comanda." };
  const comandaId = ids[0];
  let docLimpo = (documento || "").replace(/\D/g, "");
  let nomeDest: string | undefined;

  // Já autorizada (pra qualquer uma dessas comandas)? devolve.
  const { data: jaTem } = await supabase
    .from("nfce_emitidas")
    .select("*")
    .or(`comanda_id.in.(${ids.join(",")}),comanda_ids.ov.{${ids.join(",")}}`)
    .eq("status", "autorizado")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jaTem)
    return { ok: true, jaEmitida: true, id: jaTem.id as string, status: "autorizado", numero: jaTem.numero, chave: jaTem.chave, urlDanfe: jaTem.url_danfe, mensagem: undefined as string | undefined };

  const cfg = await cfgFiscal(supabase);
  if (cfg.emissor !== "focusnfe") return { ok: false, mensagem: "Emissor não é o Focus na Config fiscal." };
  if (!cfg.emissor_token) return { ok: false, mensagem: "Falta o token do emissor na Config fiscal." };
  const ambiente = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";

  const { data: comsData } = await supabase
    .from("pdv_comandas")
    .select("id, numero, valor_buffet, forma_pagamento, cliente_id")
    .in("id", ids);
  const coms = (comsData ?? []) as { id: string; numero: number; valor_buffet: number | null; forma_pagamento: string | null; cliente_id: string | null }[];
  if (coms.length === 0) return { ok: false, mensagem: "Comanda não encontrada." };
  const com = {
    forma_pagamento: coms.find((c) => c.forma_pagamento)?.forma_pagamento ?? null,
    cliente_id: coms.find((c) => c.cliente_id)?.cliente_id ?? null,
  };
  if (!docLimpo && com.cliente_id) {
    const { data: cli } = await supabase.from("clientes").select("nome, cpf_cnpj").eq("id", com.cliente_id as string).maybeSingle();
    const d = String((cli as { cpf_cnpj?: string | null } | null)?.cpf_cnpj ?? "").replace(/\D/g, "");
    if (d.length === 11 || d.length === 14) {
      docLimpo = d;
      nomeDest = ((cli as { nome?: string } | null)?.nome ?? "").trim().slice(0, 60) || undefined;
    }
  }
  if (docLimpo && docLimpo.length !== 11 && docLimpo.length !== 14) {
    return { ok: false, mensagem: "CPF tem 11 dígitos e CNPJ 14. Confira o número." };
  }

  const { data: itensData } = await supabase
    .from("pdv_comanda_itens")
    .select("descricao, qtd, preco_unit, item_id")
    .in("comanda_id", ids);

  const NCM = cfg.ncm_buffet || "21069090";
  const CFOP = cfg.cfop_padrao || "5102";
  const CSOSN = cfg.csosn_padrao || "102";

  // Perfil fiscal de cada item: o do item, senão o da categoria, senão o padrão.
  type Perfil = { id: string; ncm: string | null; cest: string | null; cfop: string; csosn: string; origem: string; unidade: string; pis_cst: string; cofins_cst: string };
  const itemIds = [...new Set((itensData ?? []).map((i) => i.item_id as string | null).filter(Boolean))] as string[];
  const [{ data: pdvItens }, { data: cats }, { data: perfis }] = await Promise.all([
    itemIds.length ? supabase.from("pdv_itens").select("id, categoria, perfil_fiscal_id").in("id", itemIds) : Promise.resolve({ data: [] as { id: string; categoria: string | null; perfil_fiscal_id: string | null }[] }),
    supabase.from("pdv_categorias").select("nome, perfil_fiscal_id"),
    supabase.from("perfis_fiscais").select("id, ncm, cest, cfop, csosn, origem, unidade, pis_cst, cofins_cst").eq("ativo", true),
  ]);
  const perfilDe = new Map(((perfis as Perfil[]) ?? []).map((p) => [p.id, p]));
  const catPerfil = new Map(((cats as { nome: string; perfil_fiscal_id: string | null }[]) ?? []).map((c) => [c.nome, c.perfil_fiscal_id]));
  const itemInfo = new Map(((pdvItens as { id: string; categoria: string | null; perfil_fiscal_id: string | null }[]) ?? []).map((i) => [i.id, i]));
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
  for (const c of coms) {
    const buffet = Number(c.valor_buffet || 0);
    if (!(buffet > 0)) continue;
    n++;
    total += buffet;
    items.push({
      numero_item: String(n),
      codigo_produto: "BUFFET",
      descricao: coms.length > 1 ? `Buffet (comanda ${c.numero})` : "Buffet",
      cfop: CFOP,
      unidade_comercial: "KG",
      quantidade_comercial: "1.0000",
      valor_unitario_comercial: buffet.toFixed(2),
      valor_bruto: buffet.toFixed(2),
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
    items.push({
      numero_item: String(n),
      codigo_produto: (it.item_id as string | null)?.slice(0, 8) ?? `ITEM${n}`,
      descricao: ((it.descricao as string) || "Item").split("\n")[0].slice(0, 120),
      cfop: pf?.cfop || CFOP,
      unidade_comercial: pf?.unidade || "UN",
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

  const forma = FORMA_FOCUS[(com.forma_pagamento as string) || ""] || "01";

  const bras = new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000);
  const iso = bras.toISOString().slice(0, 19) + "-03:00";
  const ref = `cmd-${comandaId.slice(0, 8)}-${Date.now()}`;

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
      formas_pagamento: [{ forma_pagamento: forma, valor_pagamento: total.toFixed(2) }],
    },
  );

  const { data: gravada } = await supabase.from("nfce_emitidas").insert({
    comanda_id: comandaId,
    comanda_ids: ids,
    modelo: "nfce",
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
  }).select("id").single();

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

// Manda o cupom da NFC-e (DANFE) pra impressora marcada na Central de
// Impressões ("Imprime o cupom da NFC-e"). Devolve quantos jobs entraram.
export async function imprimirNfce(nfceId: string) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  const { data: nota } = await supabase.from("nfce_emitidas").select("id, url_danfe, status").eq("id", nfceId).maybeSingle();
  if (!nota) return { ok: false as const, mensagem: "Nota não encontrada." };
  if (!nota.url_danfe) return { ok: false as const, mensagem: "Essa nota não tem DANFE pra imprimir." };
  const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
  if (ids.length === 0) return { ok: false as const, mensagem: "Nenhuma impressora marcada pra NFC-e na Central de Impressões." };
  const { error } = await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "nfce", ref_id: nfceId, impressora_id })));
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, total: ids.length };
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
    .select("ref, ambiente, status")
    .eq("id", id)
    .maybeSingle();
  if (!nota) return { ok: false, mensagem: "Nota não encontrada." };
  if (nota.status !== "autorizado") return { ok: false, mensagem: "Só dá pra cancelar nota autorizada." };

  const cfg = await cfgFiscal(supabase);
  if (!cfg.emissor_token) return { ok: false, mensagem: "Falta o token do emissor." };

  const r = await cancelarNfce(
    { token: cfg.emissor_token, ambiente: (nota.ambiente as FocusAmbiente) || "homologacao" },
    nota.ref as string,
    just,
  );
  if (r.ok) {
    await supabase.from("nfce_emitidas").update({ status: "cancelado", mensagem: just }).eq("id", id);
  }
  revalidatePath("/salao/notas-fiscais");
  return { ok: r.ok, status: r.status, mensagem: r.mensagem };
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
