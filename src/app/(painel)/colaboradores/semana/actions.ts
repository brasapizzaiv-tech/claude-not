"use server";

import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { deYmd, diasDaSemana, rotuloSemana, segundaDe, somarDias } from "@/lib/equipe";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { TURNO } from "@/lib/folgas";
import { cofreIniciado, saldoAtual, sairDoCofre, type Ctx as CtxCofre } from "@/lib/cofre-core";
import { valorDe, valorDoEnvelope, type Quantidades } from "@/lib/cofre";
import { explicarErro } from "@/lib/erro-amigavel";

// Contexto do cofre pra quem está lançando (empresa e nome de quem fez).
async function ctxDoCofre(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CtxCofre> {
  const empresaId = await empresaAtualId();
  if (!empresaId) throw new Error("Não identifiquei a empresa deste acesso.");
  const { data: u } = await supabase.auth.getUser();
  let quem: string | null = null;
  if (u.user) {
    const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user.id).maybeSingle();
    quem = (p?.nome as string | null) || u.user.email || null;
  }
  return { db: supabase, empresaId, quem };
}
const somaEnvelopes = (lista: Quantidades[]) => {
  const t: Quantidades = {};
  for (const q of lista) for (const [k, v] of Object.entries(q)) t[k] = (t[k] ?? 0) + Math.abs(Number(v));
  return t;
};
import { exigirAcesso } from "@/lib/permissoes-server";
import { descontoDezPadrao } from "@/lib/dez-caixa";
import { aplicarRecebimentoFiado, planejarRecebimentoFiado, type PlanoFiado } from "@/lib/retiradas-quitar";
import { after } from "next/server";
import { avisarPagamentosSemana } from "@/lib/push-avisos";
import { moedaBR } from "@/lib/format";

export type Turno = "dia" | "noite";

// Marca/desmarca que a pessoa trabalhou naquele dia/turno.
// Desmarcar também registra a folga (presencas_folgas): o "Preencher com a
// escala fixa" não traz a pessoa de volta nesse dia. Marcar de novo apaga a folga.
export async function marcarPresenca(colaboradorId: string, data: string, turno: Turno, marcar: boolean) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const chave = { colaborador_id: colaboradorId, data, turno };
  if (marcar) {
    const { error } = await supabase
      .from("presencas")
      .upsert(chave, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: explicarErro(error) };
    await supabase.from("presencas_folgas").delete().match(chave);
  } else {
    const { error } = await supabase.from("presencas").delete().match(chave);
    if (error) return { erro: explicarErro(error) };
    await supabase.from("presencas_folgas").upsert(chave, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
  }
  return { ok: true };
}

// Valor do 10% arrecadado na noite (digitado à mão por enquanto).
// pagarEm = segunda da semana em que entra no acerto (padrão: semana seguinte).
export async function salvarDezPorCento(data: string, valor: number, pagarEm?: string, origem: "manual" | "caixa" = "manual") {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." };
  const pagar_em = pagarEm && /^\d{4}-\d{2}-\d{2}$/.test(pagarEm) ? segundaDe(pagarEm) : somarDias(segundaDe(data), 7);
  const empresaId = await empresaAtualId();
  // Noite nova leva o desconto padrão de custos (migration 0256); a que já existe mantém o dela.
  const { data: ja } = await supabase.from("dez_por_cento_noites").select("data").eq("data", data).maybeSingle();
  const { error } = await supabase
    .from("dez_por_cento_noites")
    .upsert(
      // Digitado na tela = manual: o caixa não troca mais esse valor (migration 0250).
      { empresa_id: empresaId, data, valor: Math.max(0, valor || 0), pagar_em, origem: origem === "caixa" ? "caixa" : "manual", ...(ja ? {} : { desconto_pct: await descontoDezPadrao(supabase) }) },
      { onConflict: "empresa_id,data" },
    );
  if (error) return { erro: explicarErro(error) };
  return { ok: true, pagar_em };
}

// Extra da pessoa na semana (algo que fez a mais). Valor 0 e sem motivo = apaga.
export async function salvarExtra(
  segunda: string,
  colaboradorId: string,
  valor: number,
  motivo: string,
  turno: Turno = "noite",
  desconto = 0,
  descontoMotivo = "",
) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const v = Math.max(0, Math.round((valor || 0) * 100) / 100);
  const m = motivo.trim() || null;
  const d = Math.max(0, Math.round((desconto || 0) * 100) / 100);
  const dm = descontoMotivo.trim() || null;
  if (!v && !m && !d && !dm) {
    const { error } = await supabase.from("semana_extras").delete().match({ segunda, colaborador_id: colaboradorId });
    return error ? { erro: explicarErro(error) } : { ok: true };
  }
  const { error } = await supabase
    .from("semana_extras")
    .upsert(
      { segunda, colaborador_id: colaboradorId, valor: v, motivo: m, turno: turno === "dia" ? "dia" : "noite", desconto: d, desconto_motivo: dm },
      { onConflict: "segunda,colaborador_id" },
    );
  return error ? { erro: explicarErro(error) } : { ok: true };
}

export async function excluirDezPorCento(data: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { error } = await supabase.from("dez_por_cento_noites").delete().eq("data", data);
  if (error) return { erro: explicarErro(error) };
  return { ok: true };
}

// Preenche a semana com a escala fixa de cada pessoa (dias_dia / dias_noite).
// Só acrescenta — não apaga o que já foi marcado à mão — e PULA quem foi
// desmarcado à mão naquele dia (presencas_folgas) e quem tem folga aprovada
// no app de folgas naquela data.
export async function preencherEscalaFixa(segunda: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const dias = diasDaSemana(segunda);
  const [{ data: colabs }, { data: folgasMao }, { data: folgasApp }] = await Promise.all([
    supabase.from("colaboradores").select("id, dias_dia, dias_noite").eq("ativo", true).eq("esporadico", false),
    supabase.from("presencas_folgas").select("colaborador_id, data, turno").gte("data", dias[0]).lte("data", dias[dias.length - 1]),
    supabase
      .from("folgas_pedidos")
      .select("data, grupo_alvo, folgas_funcionarios(colaborador_id)")
      .eq("status", "Aprovado")
      .gte("data", dias[0])
      .lte("data", dias[dias.length - 1]),
  ]);
  const pular = new Set<string>();
  for (const f of (folgasMao ?? []) as { colaborador_id: string; data: string; turno: string }[]) pular.add(`${f.colaborador_id}|${f.data}|${f.turno}`);
  type FolgaApp = { data: string; grupo_alvo: string | null; folgas_funcionarios: { colaborador_id: string | null } | { colaborador_id: string | null }[] | null };
  for (const f of ((folgasApp as unknown as FolgaApp[]) ?? [])) {
    const ff = Array.isArray(f.folgas_funcionarios) ? f.folgas_funcionarios[0] : f.folgas_funcionarios;
    if (!ff?.colaborador_id) continue;
    // Folga de um turno só (grupo_alvo: almoço = dia; cozinha/salão/entrega da
    // noite = noite) tira só aquele turno. Antes tirava os dois e a pessoa perdia a
    // diária e o 10% do outro turno (EQP-03). Sem grupo_alvo: dia inteiro.
    const turno = f.grupo_alvo ? (TURNO[f.grupo_alvo] === "Dia" ? "dia" : "noite") : null;
    if (turno !== "noite") pular.add(`${ff.colaborador_id}|${f.data}|dia`);
    if (turno !== "dia") pular.add(`${ff.colaborador_id}|${f.data}|noite`);
  }
  const linhas: { colaborador_id: string; data: string; turno: Turno }[] = [];
  for (const d of dias) {
    const dow = deYmd(d).getDay();
    for (const c of (colabs ?? []) as { id: string; dias_dia: number[] | null; dias_noite: number[] | null }[]) {
      if (c.dias_dia?.includes(dow) && !pular.has(`${c.id}|${d}|dia`)) linhas.push({ colaborador_id: c.id, data: d, turno: "dia" });
      if (c.dias_noite?.includes(dow) && !pular.has(`${c.id}|${d}|noite`)) linhas.push({ colaborador_id: c.id, data: d, turno: "noite" });
    }
  }
  if (linhas.length) {
    const { error } = await supabase
      .from("presencas")
      .upsert(linhas, { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    if (error) return { erro: explicarErro(error) };
  }
  revalidatePath("/colaboradores/semana");
  return { ok: true, n: linhas.length };
}

// Lança o pagamento da semana no Contas a pagar (categoria "CMO Eventual /
// Diaristas"), uma conta por pessoa. Quem já foi lançado nessa semana é pulado.
// Opcional: descontar o fiado (retiradas em aberto) — as retiradas viram "pago"
// com a observação da semana, mas a conta no contas a pagar fica com o valor
// CHEIO (pra somar a mão de obra do mês); o desconto só reduz o que sai em mãos.
// O que a pessoa leva em mãos: valor menos adiantamentos inteiros (do mais antigo,
// até o primeiro que não cabe) e o fiado planejado. Só LÊ: é a mesma conta que o
// lançamento faz, pra conferir o envelope do cofre antes de lançar.
async function emMaosDe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  it: { colaboradorId: string; valor: number; descontarFiado?: boolean; fiadoValor?: number; descontarAdiantamento?: boolean },
) {
  let desconto = 0;
  if (it.descontarAdiantamento !== false) {
    const { data: abertos } = await supabase.from("adiantamentos").select("valor").eq("colaborador_id", it.colaboradorId).eq("status", "aberto").order("data", { ascending: true });
    for (const a of (abertos ?? []) as { valor: number }[]) {
      const v = Number(a.valor) || 0;
      if (desconto + v > it.valor + 0.005) break;
      desconto += v;
    }
  }
  if (it.descontarFiado) {
    const alvo = Math.min(Number.isFinite(it.fiadoValor) && (it.fiadoValor as number) > 0 ? (it.fiadoValor as number) : Infinity, it.valor - desconto);
    desconto = Math.round((desconto + (await planejarRecebimentoFiado(supabase, it.colaboradorId, alvo)).recebido) * 100) / 100;
  }
  return Math.round((it.valor - desconto) * 100) / 100;
}

export async function lancarPagamentosSemana(
  segunda: string,
  itens: { colaboradorId: string; nome: string; valor: number; detalhe: string; descontarFiado?: boolean; fiadoValor?: number; descontarAdiantamento?: boolean; cofre?: Quantidades | null }[],
  opts: { jaPago: boolean; data: string; forma: string | null },
) {
  await exigirAcesso("/colaboradores");
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

  // Dinheiro do cofre: confere ANTES de lançar qualquer coisa que cada envelope
  // fecha o valor em mãos da pessoa e que o cofre tem todas as notas.
  const comCofre = validos.filter((i) => i.cofre);
  let ctxCofre: CtxCofre | null = null;
  if (comCofre.length) {
    ctxCofre = await ctxDoCofre(supabase);
    if (!(await cofreIniciado(ctxCofre))) return { erro: "O cofre ainda não começou (falta a primeira contagem). Desmarque \"do cofre\" ou faça a contagem no Cofre." };
    for (const it of comCofre) {
      const emMaos = await emMaosDe(supabase, it);
      const env = valorDe(it.cofre!);
      const esperado = valorDoEnvelope(emMaos);
      if (Math.abs(env - esperado) > 0.009) return { erro: `O envelope de ${it.nome} (${moedaBR(env)}) não fecha com o valor em mãos arredondado (${moedaBR(esperado)}). Atualize a tela e confira.` };
    }
    const saldo = await saldoAtual(ctxCofre);
    const total = somaEnvelopes(comCofre.map((i) => i.cofre!));
    if (Object.entries(total).some(([k, q]) => (saldo[k] ?? 0) < q)) return { erro: "O cofre não tem todas as notas desses envelopes. Ajuste os envelopes ou confira o cofre." };
  }

  // Congela a divisão do 10% das noites desta semana (quem recebe 10% e o peso de
  // cada um), na primeira vez que a semana é paga (EQP-02, migration 0283).
  {
    const { data: r10 } = await supabase.from("colaboradores").select("id, peso_10").eq("recebe_10", true);
    const divisao = Object.fromEntries(((r10 ?? []) as { id: string; peso_10: number | null }[]).map((c) => [c.id, Number(c.peso_10) || 1]));
    const { error: errDiv } = await supabase.from("dez_por_cento_noites").update({ divisao }).eq("pagar_em", segunda).is("divisao", null);
    if (errDiv) return { erro: "Não consegui guardar a divisão do 10% desta semana. Nada foi lançado; tente de novo." };
  }

  const dataLanc = /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : hojeSP();
  const hoje = hojeSP();
  const rotulo = rotuloSemana(segunda);
  let n = 0;
  let totalDesc = 0;
  // Pro aviso no celular: o que cada um leva em mãos.
  const avisos: { colaboradorId: string; valor: number }[] = [];
  for (const it of validos) {
    // Adiantamento: dinheiro dado antes do acerto. Sai PRIMEIRO (a regra dele
    // é voltar na semana seguinte); o fiado, se marcado, no que sobrar.
    let desconto = 0;
    const idsAdiant: string[] = [];
    if (it.descontarAdiantamento !== false) {
      const { data: abertos } = await supabase
        .from("adiantamentos")
        .select("id, valor")
        .eq("colaborador_id", it.colaboradorId)
        .eq("status", "aberto")
        .order("data", { ascending: true });
      for (const a of (abertos ?? []) as { id: string; valor: number }[]) {
        const v = Number(a.valor) || 0;
        if (desconto + v > it.valor + 0.005) break;
        desconto += v;
        idsAdiant.push(a.id);
      }
    }
    const descAdiant = desconto;
    // Fiado: o caixa diz QUANTO descontar (pode ser parte). As compras mais
    // antigas saem primeiro; a que não couber inteira é dividida. Nunca passa
    // do que sobrou do valor da pessoa depois do adiantamento.
    let planoFiado: PlanoFiado | null = null;
    if (it.descontarFiado) {
      const alvo = Math.min(Number.isFinite(it.fiadoValor) && (it.fiadoValor as number) > 0 ? (it.fiadoValor as number) : Infinity, it.valor - descAdiant);
      planoFiado = await planejarRecebimentoFiado(supabase, it.colaboradorId, alvo);
      desconto = Math.round((desconto + planoFiado.recebido) * 100) / 100;
    }
    const emMaos = Math.round((it.valor - desconto) * 100) / 100;
    const descFiado = desconto - descAdiant;
    const partes = [
      descAdiant > 0 ? `adiantamento descontado ${descAdiant.toFixed(2).replace(".", ",")}` : "",
      descFiado > 0 ? `fiado descontado ${descFiado.toFixed(2).replace(".", ",")}` : "",
    ].filter(Boolean);
    // Dinheiro do cofre: o envelope é o em mãos arredondado pra cima até o real;
    // a diferença (até R$ 0,99) é paga pela casa e entra na conta (o financeiro
    // bate com o que saiu do cofre).
    const arred = it.cofre ? Math.round((valorDoEnvelope(emMaos) - emMaos) * 100) / 100 : 0;
    const sufixo = (desconto > 0 ? ` · ${partes.join(", ")} → em mãos ${emMaos.toFixed(2).replace(".", ",")}` : "")
      + (arred > 0 ? ` · arredondado +${arred.toFixed(2).replace(".", ",")} no dinheiro do cofre` : "");

    const { data: l, error } = await supabase
      .from("lancamentos")
      .insert({
        data: dataLanc,
        categoria_id: cat.id,
        descricao: `Semana ${rotulo} — ${it.nome} (${it.detalhe})${sufixo}`,
        forma_pagamento: it.cofre ? "Dinheiro" : opts.forma,
        lancamento_em: hoje,
        valor: Math.round((it.valor + arred) * 100) / 100,
        origem: "manual",
        vencimento: dataLanc,
        pago: it.cofre ? true : opts.jaPago,
        pago_em: it.cofre || opts.jaPago ? dataLanc : null,
      })
      .select("id")
      .single();
    if (error) return { erro: explicarErro(error), n };
    const { data: sp } = await supabase
      .from("semana_pagamentos")
      .insert({ segunda, colaborador_id: it.colaboradorId, valor: it.valor, lancamento_id: l.id, desconto })
      .select("id")
      .single();
    if (idsAdiant.length) {
      await supabase
        .from("adiantamentos")
        .update({ status: "descontado", descontado_em: segunda, pagamento_id: (sp as { id?: string } | null)?.id ?? null })
        .in("id", idsAdiant);
      totalDesc += descAdiant;
    }
    if (planoFiado && planoFiado.recebido > 0) {
      const r = await aplicarRecebimentoFiado(supabase, planoFiado, dataLanc, `Descontado no acerto da semana ${rotulo}`);
      if ("erro" in r) return { erro: `Conta lançada, mas o fiado de ${it.nome} não foi baixado: ${r.erro}`, n: n + 1 };
      totalDesc += descFiado;
    }
    if (it.cofre && ctxCofre) {
      const c = await sairDoCofre(ctxCofre, { quantidades: it.cofre, descricao: `Semana ${rotulo} — ${it.nome}`, lancamentoId: l.id as string });
      if (!c.ok) return { erro: `Conta de ${it.nome} lançada como paga, mas não saiu do cofre: ${c.mensagem} Registre a saída à mão no Cofre (Pagar conta).`, n: n + 1 };
    }
    n++;
    avisos.push({ colaboradorId: it.colaboradorId, valor: emMaos });
  }
  after(() => avisarPagamentosSemana(avisos, rotulo));
  revalidatePath("/colaboradores/semana");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
  revalidatePath("/retiradas");
  return { ok: true, n, totalDesc };
}

// Adiantamento: dinheiro dado à pessoa ANTES do acerto. Fica "aberto" até a
// próxima semana lançada, quando sai do que ela recebe em mãos (a conta no
// Contas a pagar continua cheia). Separado das compras internas de propósito:
// tem gente cujo fiado é descontado só uma vez por mês.
export async function registrarAdiantamento(colaboradorId: string, nome: string, valor: number, data: string, motivo: string, cofre?: Quantidades | null) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const v = Math.round(Number(valor) * 100) / 100;
  if (!colaboradorId || !(v > 0)) return { erro: "Escolha a pessoa e informe o valor." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." };
  let ctxCofre: CtxCofre | null = null;
  if (cofre) {
    ctxCofre = await ctxDoCofre(supabase);
    if (!(await cofreIniciado(ctxCofre))) return { erro: "O cofre ainda não começou (falta a primeira contagem)." };
    if (Math.abs(valorDe(cofre) - v) > 0.009) return { erro: `As notas (${moedaBR(valorDe(cofre))}) não fecham o adiantamento (${moedaBR(v)}).` };
  }
  const { data: userData } = await supabase.auth.getUser();
  const { data: ad, error } = await supabase
    .from("adiantamentos")
    .insert({ colaborador_id: colaboradorId, nome, valor: v, data, motivo: motivo.trim().slice(0, 200) || null, criado_por: userData.user?.id ?? null })
    .select("id")
    .single();
  if (error || !ad) return { erro: explicarErro(error, "Não consegui registrar o adiantamento.") };
  if (cofre && ctxCofre) {
    const c = await sairDoCofre(ctxCofre, { quantidades: cofre, descricao: `Adiantamento — ${nome}${motivo.trim() ? ` (${motivo.trim().slice(0, 60)})` : ""}`, adiantamentoId: ad.id as string });
    if (!c.ok) {
      await supabase.from("adiantamentos").delete().eq("id", ad.id);
      return { erro: c.mensagem };
    }
  }
  revalidatePath("/colaboradores/semana");
  revalidatePath("/cofre");
  return { ok: true };
}

// Só apaga o que ainda não foi descontado (o descontado já está na história do acerto).
export async function excluirAdiantamento(id: string) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const { data: ad } = await supabase.from("adiantamentos").select("status").eq("id", id).maybeSingle();
  if (!ad || (ad as { status: string }).status !== "aberto") return { erro: "Esse adiantamento não está mais em aberto (já foi descontado?)." };
  // Saiu do cofre: apagar o adiantamento = o dinheiro voltou pro cofre.
  const { error: errCofre } = await supabase.from("cofre_movimentos").delete().eq("adiantamento_id", id);
  if (errCofre) return { erro: "Não consegui devolver o dinheiro ao cofre. Nada foi apagado." };
  const { error } = await supabase.from("adiantamentos").delete().eq("id", id).eq("status", "aberto");
  if (error) return { erro: explicarErro(error) };
  revalidatePath("/colaboradores/semana");
  revalidatePath("/cofre");
  return { ok: true };
}

// Esqueceu algo depois de já ter lançado a semana da pessoa (um extra, uma
// noite): lança só a DIFERENÇA como um segundo lançamento da mesma semana.
// Semana JÁ lançada e paga em dinheiro, sem ter saído do cofre no sistema (o
// acerto de 02/11 foi pago antes de existir a caixinha): registra agora a saída
// do cofre, ligada à conta que já existe. Mesma regra do lançamento: envelope =
// em mãos arredondado pra cima até o real; a diferença entra na conta.
export async function tirarDoCofrePagos(segunda: string, itens: { colaboradorId: string; nome: string; cofre: Quantidades }[]) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  if (!itens.length) return { erro: "Ninguém marcado." };
  const ctxCofre = await ctxDoCofre(supabase);
  if (!(await cofreIniciado(ctxCofre))) return { erro: "O cofre ainda não começou (falta a primeira contagem)." };
  const rotulo = rotuloSemana(segunda);

  type Plano = { it: (typeof itens)[number]; lancId: string; valor: number; descricao: string; arred: number };
  const planos: Plano[] = [];
  for (const it of itens) {
    const { data: sps } = await supabase.from("semana_pagamentos").select("valor, desconto, lancamento_id").eq("segunda", segunda).eq("colaborador_id", it.colaboradorId).order("criado_em");
    const linhas = ((sps ?? []) as { valor: number; desconto: number | null; lancamento_id: string | null }[]).filter((x) => x.lancamento_id);
    if (!linhas.length) return { erro: `${it.nome} não tem pagamento lançado nesta semana.` };
    const ids = linhas.map((x) => x.lancamento_id as string);
    const { data: ls } = await supabase.from("lancamentos").select("id, pago, forma_pagamento, valor, descricao").in("id", ids);
    const lancs = (ls ?? []) as { id: string; pago: boolean; forma_pagamento: string | null; valor: number; descricao: string | null }[];
    if (lancs.some((l) => !l.pago || l.forma_pagamento !== "Dinheiro")) return { erro: `O pagamento de ${it.nome} não está como pago em Dinheiro. Só dá pra tirar do cofre o que foi pago em dinheiro.` };
    const { data: ja } = await supabase.from("cofre_movimentos").select("id").in("lancamento_id", ids).limit(1);
    if (ja?.length) return { erro: `O pagamento de ${it.nome} já saiu do cofre.` };
    const emMaos = Math.round(linhas.reduce((s, x) => s + Number(x.valor) - Number(x.desconto || 0), 0) * 100) / 100;
    const esperado = valorDoEnvelope(emMaos);
    if (Math.abs(valorDe(it.cofre) - esperado) > 0.009) return { erro: `O envelope de ${it.nome} não fecha com o em mãos arredondado (${moedaBR(esperado)}). Atualize a tela.` };
    const primeiro = lancs.find((l) => l.id === ids[0]) ?? lancs[0];
    planos.push({ it, lancId: primeiro.id, valor: Number(primeiro.valor), descricao: primeiro.descricao ?? "", arred: Math.round((esperado - emMaos) * 100) / 100 });
  }
  const saldo = await saldoAtual(ctxCofre);
  const total = somaEnvelopes(itens.map((i) => i.cofre));
  if (Object.entries(total).some(([k, q]) => (saldo[k] ?? 0) < q)) return { erro: "O cofre não tem todas as notas desses envelopes. Ajuste os envelopes ou confira o cofre." };

  let n = 0;
  for (const p of planos) {
    const c = await sairDoCofre(ctxCofre, { quantidades: p.it.cofre, descricao: `Semana ${rotulo} — ${p.it.nome} (pago antes)`, lancamentoId: p.lancId });
    if (!c.ok) return { erro: `${n} saíram do cofre; parou em ${p.it.nome}: ${c.mensagem}`, n };
    if (p.arred > 0) {
      await supabase.from("lancamentos").update({
        valor: Math.round((p.valor + p.arred) * 100) / 100,
        descricao: `${p.descricao} · arredondado +${p.arred.toFixed(2).replace(".", ",")} no dinheiro do cofre`.slice(0, 500),
      }).eq("id", p.lancId);
    }
    n++;
  }
  revalidatePath("/colaboradores/semana");
  revalidatePath("/cofre");
  revalidatePath("/financeiro/contas");
  return { ok: true, n };
}

export async function lancarComplementoSemana(
  segunda: string,
  colaboradorId: string,
  nome: string,
  valor: number,
  detalhe: string,
  opts: { jaPago: boolean; data: string; forma: string | null },
) {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const v = Math.round(Number(valor) * 100) / 100;
  if (!(v > 0)) return { erro: "Valor inválido." };
  const { data: cat } = await supabase
    .from("dre_categorias")
    .select("id")
    .ilike("nome", "%eventual%diarista%")
    .limit(1)
    .maybeSingle();
  if (!cat) return { erro: 'Categoria "CMO Eventual / Diaristas" não encontrada no plano de contas.' };
  const dataLanc = /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : hojeSP();
  const rotulo = rotuloSemana(segunda);
  const { data: l, error } = await supabase
    .from("lancamentos")
    .insert({
      data: dataLanc,
      categoria_id: cat.id,
      descricao: `Semana ${rotulo} — ${nome} (complemento: ${detalhe || "valor esquecido"})`,
      forma_pagamento: opts.forma,
      lancamento_em: hojeSP(),
      valor: v,
      origem: "manual",
      vencimento: dataLanc,
      pago: opts.jaPago,
      pago_em: opts.jaPago ? dataLanc : null,
    })
    .select("id")
    .single();
  if (error) return { erro: explicarErro(error) };
  await supabase.from("semana_pagamentos").insert({ segunda, colaborador_id: colaboradorId, valor: v, lancamento_id: l.id, desconto: 0 });
  revalidatePath("/colaboradores/semana");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
  return { ok: true };
}

// Cadastro rápido de um free esporádico direto da tela da semana.
export async function criarEsporadico(nome: string, valorDia: number | null, valorNoite: number | null) {
  await exigirAcesso("/colaboradores");
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
  if (error) return { erro: explicarErro(error) };
  revalidatePath("/colaboradores");
  return { ok: true, id: data.id as string };
}

/**
 * Muda o % do 10% que fica com a casa (custos de nota e cartão, migration 0256):
 * vale pras noites novas e pras noites pagas desta semana em diante que ainda
 * não estão em semana com acerto lançado. Semana já paga não muda.
 */
export async function salvarDescontoDez(pct: number, segunda: string) {
  await exigirAcesso("/colaboradores");
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) return { erro: "Use um percentual entre 0 e 50." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda)) return { erro: "Semana inválida." };
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  const { error } = await supabase.from("pdv_config").upsert({ empresa_id: empresaId, chave: "dez_desconto_pct", valor: String(pct) }, { onConflict: "empresa_id,chave" });
  if (error) return { erro: explicarErro(error) };
  const { data: pagas } = await supabase.from("semana_pagamentos").select("segunda").not("lancamento_id", "is", null).gte("segunda", segunda);
  const conta = new Map<string, number>();
  for (const x of (pagas as { segunda: string }[]) ?? []) conta.set(String(x.segunda).slice(0, 10), (conta.get(String(x.segunda).slice(0, 10)) ?? 0) + 1);
  const { data: noites } = await supabase.from("dez_por_cento_noites").select("data, pagar_em").gte("pagar_em", segunda);
  const mudar = ((noites as { data: string; pagar_em: string }[]) ?? []).filter((n) => (conta.get(String(n.pagar_em).slice(0, 10)) ?? 0) <= 3).map((n) => n.data);
  if (mudar.length) await supabase.from("dez_por_cento_noites").update({ desconto_pct: pct }).in("data", mudar);
  revalidatePath("/colaboradores/semana");
  return { ok: true };
}
