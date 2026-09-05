"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deYmd, diasDaSemana, rotuloSemana } from "@/lib/equipe";

export type Turno = "dia" | "noite";

// Marca/desmarca que a pessoa trabalhou naquele dia/turno.
export async function marcarPresenca(colaboradorId: string, data: string, turno: Turno, marcar: boolean) {
  const supabase = await createClient();
  if (marcar) {
    const { error } = await supabase
      .from("presencas")
      .upsert({ colaborador_id: colaboradorId, data, turno }, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: error.message };
  } else {
    const { error } = await supabase.from("presencas").delete().match({ colaborador_id: colaboradorId, data, turno });
    if (error) return { erro: error.message };
  }
  return { ok: true };
}

// Valor do 10% arrecadado na noite (digitado à mão por enquanto).
export async function salvarDezPorCento(data: string, valor: number, obs?: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dez_por_cento_noites")
    .upsert({ data, valor: Math.max(0, valor || 0), obs: obs?.trim() || null }, { onConflict: "data" });
  if (error) return { erro: error.message };
  return { ok: true };
}

// Preenche a semana com a escala fixa de cada pessoa (dias_dia / dias_noite).
// Só acrescenta — não apaga o que já foi marcado à mão.
export async function preencherEscalaFixa(segunda: string) {
  const supabase = await createClient();
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, dias_dia, dias_noite")
    .eq("ativo", true)
    .eq("esporadico", false);
  const linhas: { colaborador_id: string; data: string; turno: Turno }[] = [];
  for (const d of diasDaSemana(segunda)) {
    const dow = deYmd(d).getDay();
    for (const c of (colabs ?? []) as { id: string; dias_dia: number[] | null; dias_noite: number[] | null }[]) {
      if (c.dias_dia?.includes(dow)) linhas.push({ colaborador_id: c.id, data: d, turno: "dia" });
      if (c.dias_noite?.includes(dow)) linhas.push({ colaborador_id: c.id, data: d, turno: "noite" });
    }
  }
  if (linhas.length) {
    const { error } = await supabase
      .from("presencas")
      .upsert(linhas, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: error.message };
  }
  revalidatePath("/colaboradores/semana");
  return { ok: true, n: linhas.length };
}

// Lança o pagamento da semana no Contas a pagar (categoria "CMO Eventual /
// Diaristas"), uma conta por pessoa. Quem já foi lançado nessa semana é pulado.
export async function lancarPagamentosSemana(
  segunda: string,
  itens: { colaboradorId: string; nome: string; valor: number; detalhe: string }[],
  opts: { jaPago: boolean; data: string; forma: string | null },
) {
  const supabase = await createClient();
  const { data: cat } = await supabase
    .from("dre_categorias")
    .select("id")
    .ilike("nome", "%eventual%diarista%")
    .limit(1)
    .maybeSingle();
  if (!cat) return { erro: 'Categoria "CMO Eventual / Diaristas" não encontrada no plano de contas.' };

  const { data: jaPagos } = await supabase.from("semana_pagamentos").select("colaborador_id").eq("segunda", segunda);
  const pulados = new Set((jaPagos ?? []).map((x) => x.colaborador_id as string));
  const validos = itens.filter((i) => i.valor > 0 && !pulados.has(i.colaboradorId));
  if (!validos.length) return { erro: "Nada pra lançar (já lançado ou valor zero)." };

  const dataLanc = /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : new Date().toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  const rotulo = rotuloSemana(segunda);
  let n = 0;
  for (const it of validos) {
    const { data: l, error } = await supabase
      .from("lancamentos")
      .insert({
        data: dataLanc,
        categoria_id: cat.id,
        descricao: `Semana ${rotulo} — ${it.nome} (${it.detalhe})`,
        forma_pagamento: opts.forma,
        lancamento_em: hoje,
        valor: Math.round(it.valor * 100) / 100,
        origem: "manual",
        vencimento: dataLanc,
        pago: opts.jaPago,
        pago_em: opts.jaPago ? dataLanc : null,
      })
      .select("id")
      .single();
    if (error) return { erro: error.message, n };
    await supabase.from("semana_pagamentos").insert({
      segunda, colaborador_id: it.colaboradorId, valor: it.valor, lancamento_id: l.id,
    });
    n++;
  }
  revalidatePath("/colaboradores/semana");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
  return { ok: true, n };
}

// Cadastro rápido de um free esporádico direto da tela da semana.
export async function criarEsporadico(nome: string, valorDia: number | null, valorNoite: number | null) {
  const supabase = await createClient();
  const n = nome.trim();
  if (!n) return { erro: "Informe o nome." };
  const { data, error } = await supabase
    .from("colaboradores")
    .insert({
      nome: n,
      token: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      esporadico: true,
      turno: valorDia && valorNoite ? "ambos" : valorDia ? "dia" : "noite",
      vinculo: "freelance",
      valor_dia: valorDia,
      valor_noite: valorNoite,
      recebe_10: !!valorNoite,
    })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  revalidatePath("/colaboradores");
  return { ok: true, id: data.id as string };
}
