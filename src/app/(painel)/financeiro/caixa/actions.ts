"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { FORMAS_CAIXA, moedaNum, type FormaLinha } from "@/lib/caixa";
import { exigirAcesso } from "@/lib/permissoes-server";

// De→para: forma de pagamento do caixa → categoria de receita do DRE.
const MAPA_FORMA_CATEGORIA: Record<string, string> = {
  Dinheiro: "Dinheiro",
  Pix: "PIX/Transferência",
  Cartão: "Cartão",
  Fiado: "Vendas do Fiado",
  Saldo: "Saldo",
};

// Lança (ou relança) o faturamento do fechamento como receita no financeiro.
async function gerarFaturamento(
  supabase: SupabaseClient,
  fechamentoId: string,
  data: string,
  formas: FormaLinha[],
) {
  // Limpa os lançamentos anteriores deste fechamento (para relançar ao editar).
  await supabase.from("lancamentos").delete().eq("fechamento_id", fechamentoId);

  const nomes = [...new Set(Object.values(MAPA_FORMA_CATEGORIA))];
  const { data: cats } = await supabase
    .from("dre_categorias")
    .select("id, nome")
    .eq("tipo", "receita")
    .in("nome", nomes);
  const idPorNome = new Map(
    ((cats as { id: string; nome: string }[]) ?? []).map((c) => [c.nome, c.id]),
  );

  const novos = formas
    .filter((f) => f.valor > 0)
    .map((f) => ({
      data,
      categoria_id: idPorNome.get(MAPA_FORMA_CATEGORIA[f.forma]) ?? null,
      valor: f.valor,
      descricao: `Faturamento ${f.forma} — caixa`,
      forma_pagamento: f.forma,
      origem: "caixa" as const,
      fechamento_id: fechamentoId,
      pago: true,
      pago_em: data,
    }));
  if (novos.length > 0) await supabase.from("lancamentos").insert(novos);
}

export type EntradaFechamento = {
  id?: string | null;
  data: string;
  venda_bruta: string;
  acrescimos: string;
  cancelados: string;
  descontos: string;
  fretes: string;
  fundo_caixa: string;
  recebimentos: string;
  creditos: string;
  pagamentos: string;
  fiado: string;
  quebra: string;
  observacao: string;
  formas: { forma: string; pedidos: string; valor: string }[];
};

export async function salvarFechamento(e: EntradaFechamento) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();

  const formas: FormaLinha[] = FORMAS_CAIXA.map((f) => {
    const linha = e.formas.find((x) => x.forma === f);
    return {
      forma: f,
      pedidos: Math.round(moedaNum(linha?.pedidos)),
      valor: moedaNum(linha?.valor),
    };
  });

  const payload = {
    data: e.data,
    venda_bruta: moedaNum(e.venda_bruta),
    acrescimos: moedaNum(e.acrescimos),
    cancelados: moedaNum(e.cancelados),
    descontos: moedaNum(e.descontos),
    fretes: moedaNum(e.fretes),
    fundo_caixa: moedaNum(e.fundo_caixa),
    recebimentos: moedaNum(e.recebimentos),
    creditos: moedaNum(e.creditos),
    pagamentos: moedaNum(e.pagamentos),
    fiado: moedaNum(e.fiado),
    quebra: moedaNum(e.quebra),
    formas,
    observacao: e.observacao?.trim() || null,
  };

  let id = e.id;
  if (id) {
    await supabase.from("fechamentos_caixa").update(payload).eq("id", id);
  } else {
    const { data } = await supabase
      .from("fechamentos_caixa")
      .insert(payload)
      .select("id")
      .single();
    id = data?.id ?? null;
  }

  // Lança o faturamento como receita no financeiro (por forma de pagamento).
  if (id) await gerarFaturamento(supabase, id, payload.data, formas);

  revalidatePath("/financeiro/caixa");
  revalidatePath("/financeiro");
  if (id) redirect(`/financeiro/caixa/${id}`);
  redirect("/financeiro/caixa");
}

export async function excluirFechamento(formData: FormData) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("fechamentos_caixa").delete().eq("id", id);
  revalidatePath("/financeiro/caixa");
  redirect("/financeiro/caixa");
}
