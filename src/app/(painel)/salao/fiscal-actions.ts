"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitirNfce, cancelarNfce, type FocusAmbiente, type FocusItem } from "@/lib/fiscal/focus";

// Mapa das nossas formas de pagamento -> código da NFC-e (Focus/SEFAZ).
const FORMA_FOCUS: Record<string, string> = {
  Dinheiro: "01",
  Pix: "17",
  "Cartão de crédito": "03",
  "Cartão de débito": "04",
  "Cartão de debito": "04",
  "Cartão de credito": "03",
};

async function cfgFiscal(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("config_fiscal").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of data ?? []) cfg[r.chave] = r.valor ?? "";
  return cfg;
}

// Emite a NFC-e de uma comanda (itens + buffet). Idempotente: se já tem uma
// autorizada, devolve ela. Códigos fiscais: padrões da Config (fallback típico).
export async function emitirNfceComanda(comandaId: string, cpf?: string) {
  const supabase = await createClient();
  const cpfLimpo = (cpf || "").replace(/\D/g, "");

  // Já autorizada? devolve.
  const { data: jaTem } = await supabase
    .from("nfce_emitidas")
    .select("*")
    .eq("comanda_id", comandaId)
    .eq("status", "autorizado")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jaTem)
    return { ok: true, jaEmitida: true, status: "autorizado", numero: jaTem.numero, chave: jaTem.chave, urlDanfe: jaTem.url_danfe, mensagem: undefined as string | undefined };

  const cfg = await cfgFiscal(supabase);
  if (cfg.emissor !== "focusnfe") return { ok: false, mensagem: "Emissor não é o Focus na Config fiscal." };
  if (!cfg.emissor_token) return { ok: false, mensagem: "Falta o token do emissor na Config fiscal." };
  const ambiente = (cfg.emissor_ambiente as FocusAmbiente) || "homologacao";

  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("numero, valor_buffet, forma_pagamento")
    .eq("id", comandaId)
    .maybeSingle();
  if (!com) return { ok: false, mensagem: "Comanda não encontrada." };

  const { data: itensData } = await supabase
    .from("pdv_comanda_itens")
    .select("descricao, qtd, preco_unit")
    .eq("comanda_id", comandaId);

  const NCM = cfg.ncm_buffet || "21069090";
  const CFOP = cfg.cfop_padrao || "5102";
  const CSOSN = cfg.csosn_padrao || "102";

  const items: FocusItem[] = [];
  let total = 0;
  let n = 0;
  const buffet = Number(com.valor_buffet || 0);
  if (buffet > 0) {
    n++;
    total += buffet;
    items.push({
      numero_item: String(n),
      codigo_produto: "BUFFET",
      descricao: "Buffet",
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
    items.push({
      numero_item: String(n),
      codigo_produto: `ITEM${n}`,
      descricao: (it.descricao as string) || "Item",
      cfop: CFOP,
      unidade_comercial: "UN",
      quantidade_comercial: qtd.toFixed(4),
      valor_unitario_comercial: preco.toFixed(2),
      valor_bruto: bruto.toFixed(2),
      codigo_ncm: NCM,
      icms_origem: "0",
      icms_situacao_tributaria: CSOSN,
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
      cpf: cpfLimpo.length === 11 ? cpfLimpo : undefined,
      items,
      formas_pagamento: [{ forma_pagamento: forma, valor_pagamento: total.toFixed(2) }],
    },
  );

  await supabase.from("nfce_emitidas").insert({
    comanda_id: comandaId,
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
  });

  revalidatePath(`/salao/comandas/${comandaId}`);
  return {
    ok: r.ok,
    status: r.status,
    numero: r.numero,
    chave: r.chave,
    urlDanfe: r.urlDanfe,
    mensagem: r.mensagem,
    erros: r.erros ? JSON.stringify(r.erros).slice(0, 500) : undefined,
  };
}

// Cancela uma NFC-e já autorizada (dentro do prazo legal). Justificativa >= 15
// caracteres (exigência da SEFAZ).
export async function cancelarNfceEmitida(id: string, justificativa: string) {
  const supabase = await createClient();
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
