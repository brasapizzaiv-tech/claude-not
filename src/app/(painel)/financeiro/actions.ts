"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ajustarTotalBoleto, lerValorBR } from "@/lib/boleto";

export async function criarLancamento(formData: FormData) {
  const supabase = await createClient();

  const data = (formData.get("data") as string) || null;
  const categoria_id = (formData.get("categoria_id") as string) || null;
  const descricao = (formData.get("descricao") as string)?.trim() || null;
  const forma_pagamento =
    (formData.get("forma_pagamento") as string)?.trim() || null;
  const banco = (formData.get("banco") as string)?.trim() || null;
  const vencimento = (formData.get("vencimento") as string) || null;
  const pago = formData.get("pago") === "on";
  const valorRaw = (formData.get("valor") as string) || "0";
  const valor = Number(valorRaw.replace(/\./g, "").replace(",", ".")) || 0;

  if (!categoria_id || valor <= 0) return;

  const dataLanc = data || new Date().toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  const repeticao = (formData.get("repeticao") as string) || "nenhuma";
  const vezes = Math.max(1, Math.min(60, Number(formData.get("vezes")) || 1));
  const frequencia = (formData.get("frequencia") as string) || "mensal";
  const dias = Math.max(1, Number(formData.get("dias")) || 30);

  if (repeticao === "nenhuma" || vezes <= 1) {
    await supabase.from("lancamentos").insert({
      data: dataLanc,
      categoria_id,
      descricao,
      forma_pagamento,
      banco,
      lancamento_em: hoje,
      valor,
      origem: "manual",
      vencimento: vencimento || null,
      pago,
      pago_em: pago ? dataLanc : null,
    });
  } else {
    // Parcelado = divide o total; Mensal/fixo = repete o mesmo valor.
    const base = vencimento || dataLanc;
    const parcela =
      repeticao === "parcelado"
        ? Math.round((valor / vezes) * 100) / 100
        : valor;
    const linhas = [];
    for (let i = 0; i < vezes; i++) {
      const v =
        repeticao === "parcelado" && i === vezes - 1
          ? Math.round((valor - parcela * (vezes - 1)) * 100) / 100
          : parcela;
      const rot = repeticao === "parcelado" ? `${i + 1}/${vezes}` : `mês ${i + 1}`;
      linhas.push({
        data: dataLanc,
        categoria_id,
        descricao: `${descricao ?? ""} (${rot})`.trim(),
        forma_pagamento,
        banco,
        lancamento_em: hoje,
        valor: v,
        origem: "manual",
        vencimento: avancar(base, i, frequencia, dias),
        pago: false,
        pago_em: null,
      });
    }
    await supabase.from("lancamentos").insert(linhas);
  }

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
}

// Avança a i-ésima repetição a partir de uma data, conforme a frequência.
function avancar(dataStr: string, i: number, frequencia: string, dias: number) {
  const [a, m, d] = dataStr.split("-").map(Number);
  let dt: Date;
  if (frequencia === "mensal") {
    dt = new Date(a, m - 1 + i, d);
  } else {
    const passo =
      frequencia === "semanal" ? 7 : frequencia === "quinzenal" ? 15 : dias;
    dt = new Date(a, m - 1, d + i * passo);
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export async function excluirLancamento(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("lancamentos").delete().eq("id", id).eq("origem", "manual");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
}

// Edita um lançamento manual (data, categoria, valor, descrição, vencimento).
export async function editarLancamento(
  id: string,
  dados: {
    data: string;
    categoria_id: string;
    valor: number;
    descricao: string | null;
    vencimento: string | null;
    pago: boolean;
  },
) {
  const supabase = await createClient();
  if (!dados.categoria_id || !(dados.valor > 0))
    return { ok: false, erro: "Categoria e valor são obrigatórios." };
  await supabase
    .from("lancamentos")
    .update({
      data: dados.data,
      categoria_id: dados.categoria_id,
      valor: dados.valor,
      descricao: dados.descricao?.trim() || null,
      vencimento: dados.vencimento || null,
      pago: dados.pago,
      pago_em: dados.pago ? dados.data : null,
    })
    .eq("id", id)
    .eq("origem", "manual");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

// Salva o orçamento (metas) de um mês.
export async function salvarOrcamento(
  anoMes: string,
  itens: { categoria_id: string; valor: number }[],
) {
  const supabase = await createClient();
  const comValor = itens.filter((i) => i.valor > 0);
  if (comValor.length > 0) {
    await supabase.from("orcamentos").upsert(
      comValor.map((i) => ({ ...i, ano_mes: anoMes })),
      { onConflict: "categoria_id,ano_mes" },
    );
  }
  // Remove metas zeradas.
  const zeradas = itens.filter((i) => i.valor <= 0).map((i) => i.categoria_id);
  if (zeradas.length > 0) {
    await supabase
      .from("orcamentos")
      .delete()
      .eq("ano_mes", anoMes)
      .in("categoria_id", zeradas);
  }
  revalidatePath("/financeiro/orcamento");
  return { ok: true };
}

// Marca uma conta como paga (ou volta para não paga). A data do pagamento pode
// vir do formulário (campo editável); se não vier, usa a data de hoje no fuso
// de Brasília (UTC−3, sem horário de verão) — evita "pular" para o dia seguinte
// quando o clique acontece à noite.
export async function alternarPago(formData: FormData) {
  const supabase = await createClient();
  // Aceita 1 id (id) ou vários (ids, separados por vírgula) — uma nota no
  // Contas a pagar agrupa vários lançamentos (por categoria) num boleto só.
  const idsRaw = (formData.get("ids") as string) || (formData.get("id") as string) || "";
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const pago = formData.get("pago") === "true";
  const dataInformada = (formData.get("data_pago") as string) || "";
  const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  if (ids.length > 0) {
    await supabase
      .from("lancamentos")
      .update({
        pago,
        pago_em: pago ? (dataInformada || hojeBR) : null,
      })
      .in("id", ids);
  }
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

// Ajusta o valor cobrado numa conta (o boleto veio com custas, juros ou
// desconto). Conta vinda de nota: a diferença entra como lançamento à parte em
// "Despesas Bancárias", sem mexer no valor da mercadoria (CMV). Conta manual:
// muda o próprio valor.
export async function ajustarValorConta(formData: FormData) {
  const supabase = await createClient();
  const idsRaw =
    (formData.get("ids") as string) || (formData.get("id") as string) || "";
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valor = lerValorBR(formData.get("valor") as string);
  if (ids.length === 0 || !(valor > 0)) return;

  await ajustarTotalBoleto(supabase, ids, valor);

  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
  revalidatePath("/notas");
}
