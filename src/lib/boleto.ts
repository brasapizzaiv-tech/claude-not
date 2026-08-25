import type { SupabaseClient } from "@supabase/supabase-js";

// O boleto quase nunca fecha com o valor da nota: vem custa bancária, juros ou
// desconto. Aqui a diferença NÃO é jogada em cima da mercadoria (senão o CMV
// mente) — ela entra como um lançamento separado, marcado com ajuste = true, na
// mesma nota e no mesmo vencimento. Como o Contas a pagar agrupa por
// nota + vencimento, o boleto aparece com o valor cobrado de verdade.

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Lê um valor digitado em português (1.234,56 / 1234,56 / 1234.56).
export function lerValorBR(s: string | null | undefined): number {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(limpo.replace(/[^0-9.-]/g, "")) || 0;
}

type LancBoleto = {
  id: string;
  nota_id: string | null;
  origem: string;
  data: string | null;
  vencimento: string | null;
  pago: boolean;
  pago_em: string | null;
  banco: string | null;
  forma_pagamento: string | null;
  fornecedor_id: string | null;
  descricao: string | null;
  valor: number;
  ajuste: boolean | null;
};

async function categoriaAjuste(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "financeira")
    .eq("nome", "Despesas Bancárias")
    .maybeSingle();
  if (data?.id) return data.id as string;
  const { data: qualquer } = await supabase
    .from("dre_categorias")
    .select("id")
    .eq("tipo", "financeira")
    .limit(1)
    .maybeSingle();
  return (qualquer?.id as string) ?? null;
}

export type ResultadoAjuste = { ok: boolean; dif?: number; erro?: string };

// Ajusta o TOTAL cobrado num boleto (um ou mais lançamentos da mesma nota e
// vencimento) para o valor informado.
export async function ajustarTotalBoleto(
  supabase: SupabaseClient,
  ids: string[],
  novoTotal: number,
): Promise<ResultadoAjuste> {
  if (ids.length === 0) return { ok: false, erro: "Conta não encontrada." };
  if (!(novoTotal > 0))
    return { ok: false, erro: "Informe um valor maior que zero." };

  const { data } = await supabase
    .from("lancamentos")
    .select(
      "id, nota_id, origem, data, vencimento, pago, pago_em, banco, forma_pagamento, fornecedor_id, descricao, valor, ajuste",
    )
    .in("id", ids);
  const linhas = (data as LancBoleto[]) ?? [];
  if (linhas.length === 0) return { ok: false, erro: "Conta não encontrada." };

  const total = round2(linhas.reduce((s, l) => s + Number(l.valor), 0));
  const dif = round2(novoTotal - total);
  if (Math.abs(dif) < 0.01) return { ok: true, dif: 0 };

  const base = linhas.find((l) => !l.ajuste) ?? linhas[0];

  // Conta que não veio de nota (manual, pedido, caixa): muda o próprio valor.
  if (base.origem !== "nota" || !base.nota_id) {
    await supabase
      .from("lancamentos")
      .update({ valor: novoTotal })
      .eq("id", base.id);
    return { ok: true, dif };
  }

  const ajusteAtual = linhas.find((l) => l.ajuste);
  const novoAjuste = round2((Number(ajusteAtual?.valor) || 0) + dif);
  const rotulo = novoAjuste >= 0 ? "custas do boleto" : "desconto no boleto";
  const descricao = `${base.descricao ?? "Boleto"} — ${rotulo}`;

  if (Math.abs(novoAjuste) < 0.01) {
    if (ajusteAtual)
      await supabase.from("lancamentos").delete().eq("id", ajusteAtual.id);
  } else if (ajusteAtual) {
    await supabase
      .from("lancamentos")
      .update({ valor: novoAjuste, descricao })
      .eq("id", ajusteAtual.id);
  } else {
    await supabase.from("lancamentos").insert({
      data: base.data,
      categoria_id: await categoriaAjuste(supabase),
      valor: novoAjuste,
      descricao,
      fornecedor_id: base.fornecedor_id,
      origem: "nota",
      nota_id: base.nota_id,
      vencimento: base.vencimento,
      pago: base.pago,
      pago_em: base.pago_em,
      banco: base.banco,
      forma_pagamento: base.forma_pagamento,
      ajuste: true,
    });
  }

  // Boleto único da nota (não parcelada) → guarda o valor cobrado na nota, para
  // sobreviver a um estorno/relançamento.
  const { data: todas } = await supabase
    .from("lancamentos")
    .select("vencimento")
    .eq("nota_id", base.nota_id);
  const umBoletoSo = ((todas as { vencimento: string | null }[]) ?? []).every(
    (l) => (l.vencimento ?? "") === (base.vencimento ?? ""),
  );
  if (umBoletoSo)
    await supabase
      .from("notas_fiscais")
      .update({ valor_boleto: novoTotal })
      .eq("id", base.nota_id);

  return { ok: true, dif };
}

// Reaplica o valor de boleto guardado na nota sobre os lançamentos dela (usado
// depois de lançar/relançar a nota). Nota parcelada não entra: cada parcela é um
// boleto e é ajustada no Contas a pagar.
export async function aplicarValorBoletoNota(
  supabase: SupabaseClient,
  notaId: string,
): Promise<ResultadoAjuste> {
  const { data: nota } = await supabase
    .from("notas_fiscais")
    .select("valor_boleto")
    .eq("id", notaId)
    .maybeSingle();
  const alvo = Number((nota as { valor_boleto: number | null } | null)?.valor_boleto);
  if (!(alvo > 0)) return { ok: true, dif: 0 };

  const { data } = await supabase
    .from("lancamentos")
    .select("id, vencimento")
    .eq("nota_id", notaId);
  const linhas = (data as { id: string; vencimento: string | null }[]) ?? [];
  if (linhas.length === 0) return { ok: true, dif: 0 };
  const vencimentos = new Set(linhas.map((l) => l.vencimento ?? ""));
  if (vencimentos.size > 1)
    return {
      ok: false,
      erro: "Nota parcelada: ajuste o valor de cada boleto em Contas a pagar.",
    };

  return ajustarTotalBoleto(
    supabase,
    linhas.map((l) => l.id),
    alvo,
  );
}
