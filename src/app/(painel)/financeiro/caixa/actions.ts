"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FORMAS_CAIXA, moedaNum, type FormaLinha } from "@/lib/caixa";

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

  revalidatePath("/financeiro/caixa");
  if (id) redirect(`/financeiro/caixa/${id}`);
  redirect("/financeiro/caixa");
}

export async function excluirFechamento(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  await supabase.from("fechamentos_caixa").delete().eq("id", id);
  revalidatePath("/financeiro/caixa");
  redirect("/financeiro/caixa");
}
