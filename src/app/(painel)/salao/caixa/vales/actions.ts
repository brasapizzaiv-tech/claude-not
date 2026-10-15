"use server";

// Vale-presente com código (migration 0235): venda no caixa, consulta pelo
// código (caixa/PDV), impressão na térmica, cancelar, prorrogar e devolver uma
// baixa. Tudo com a permissão do caixa (/salao).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { naoEntraNoCaixa, tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { camposTefDoMov, registrarTefDaVenda, type TefDaVenda } from "@/lib/tef-venda-server";
import { dataBR, formatarCodigo, gerarCodigoVale, normalizarCodigo, validadePadrao, type ValeCartao } from "@/lib/vale-presente";

const r2 = (n: number) => Math.round(n * 100) / 100;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function caixaAberto(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("pdv_caixas").select("id").eq("status", "aberto").order("aberto_em", { ascending: false }).limit(1).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export type DadosVenda = {
  valor: number;
  para: string;
  de: string;
  mensagem: string;
  telefone: string;
  validade: string;
  forma: string;
  tef?: TefDaVenda | null;
};

/** Vende o vale: grava com código novo e entra no caixa do dia como venda. */
export async function venderValePresente(d: DadosVenda) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const valor = r2(Number(d.valor));
  if (!(valor > 0) || valor > 10000) return { ok: false as const, mensagem: "Informe o valor do vale." };
  if (!d.forma) return { ok: false as const, mensagem: "Escolha como o cliente pagou." };
  const tipo = tipoDe(d.forma, await formasParaTipo());
  if (naoEntraNoCaixa(tipo) || tipo === "saldo" || tipo === "equipe") {
    return { ok: false as const, mensagem: `O vale não pode ser pago com ${d.forma}.` };
  }
  const validade = /^\d{4}-\d{2}-\d{2}$/.test(d.validade) ? d.validade : validadePadrao();
  if (validade < hojeSP()) return { ok: false as const, mensagem: "A validade já passou." };
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de vender o vale." };

  const limpo = (s: string, n: number) => (s || "").trim().slice(0, n) || null;
  let vale: { id: string; codigo: string } | null = null;
  for (let i = 0; i < 5 && !vale; i++) {
    const { data, error } = await supabase.from("vales_presente").insert({
      codigo: gerarCodigoVale(),
      valor,
      saldo: valor,
      para_nome: limpo(d.para, 80),
      de_nome: limpo(d.de, 80),
      mensagem: limpo(d.mensagem, 200),
      telefone: limpo((d.telefone || "").replace(/\D/g, ""), 15),
      validade,
      forma_pagamento: d.forma,
      caixa_id: caixaId,
    }).select("id, codigo").single();
    if (data) vale = data as { id: string; codigo: string };
    else if (error && !/duplicate|unique/i.test(error.message)) return { ok: false as const, mensagem: error.message };
  }
  if (!vale) return { ok: false as const, mensagem: "Não consegui gerar o código. Tente de novo." };

  const tef = d.tef ?? null;
  const { data: mov, error: eMov } = await supabase.from("pdv_caixa_mov").insert({
    caixa_id: caixaId,
    tipo: "venda",
    descricao: `Vale-presente ${formatarCodigo(vale.codigo)}${d.para.trim() ? ` · ${d.para.trim().slice(0, 60)}` : ""}`,
    forma_pagamento: d.forma,
    valor,
    comanda_id: null,
    ...camposTefDoMov(tef),
  }).select("id").maybeSingle();
  if (eMov) {
    await supabase.from("vales_presente").delete().eq("id", vale.id);
    return { ok: false as const, mensagem: eMov.message };
  }
  const movId = (mov as { id?: string } | null)?.id ?? null;
  await supabase.from("vales_presente").update({ caixa_mov_id: movId }).eq("id", vale.id);
  const tefTransacaoId = tef ? await registrarTefDaVenda(supabase, { caixaId, movId, comandaIds: [], valor, tef }) : null;

  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/vales");
  return { ok: true as const, id: vale.id, codigo: vale.codigo, tefTransacaoId };
}

export type ValeConsulta = ValeCartao & { id: string; status: string; vencido: boolean };

/** Caixa/PDV: confere o código antes de usar. */
export async function consultarVale(codigo: string): Promise<{ ok: true; vale: ValeConsulta } | { ok: false; mensagem: string }> {
  await exigirAcesso(["/salao", "/pdv"]);
  const cod = normalizarCodigo(codigo);
  if (cod.length < 4) return { ok: false, mensagem: "Digite o código do vale." };
  const supabase = await createClient();
  const { data } = await supabase.from("vales_presente").select("id, codigo, valor, saldo, para_nome, de_nome, mensagem, validade, status").eq("codigo", cod).maybeSingle();
  if (!data) return { ok: false, mensagem: `Não achei o vale ${formatarCodigo(cod)}. Confira as letras.` };
  const v = data as { id: string; codigo: string; valor: number; saldo: number; para_nome: string | null; de_nome: string | null; mensagem: string | null; validade: string; status: string };
  const vale: ValeConsulta = {
    id: v.id, codigo: v.codigo, valor: Number(v.valor), saldo: Number(v.saldo), para: v.para_nome, de: v.de_nome, mensagem: v.mensagem,
    validade: v.validade, status: v.status, vencido: v.validade < hojeSP(),
  };
  if (vale.status !== "ativo") return { ok: false, mensagem: `O vale ${formatarCodigo(cod)} foi cancelado.` };
  if (vale.vencido) return { ok: false, mensagem: `O vale ${formatarCodigo(cod)} venceu em ${dataBR(vale.validade)}. Pra aceitar, prorrogue em Caixa → Vales-presente.` };
  if (vale.saldo <= 0) return { ok: false, mensagem: `O vale ${formatarCodigo(cod)} já foi todo usado.` };
  return { ok: true, vale };
}

/** Manda o cupom do vale pra térmica do caixa (a mesma da NFC-e). */
export async function imprimirValeCaixa(id: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
  if (ids.length === 0) return { ok: false as const, mensagem: "Nenhuma impressora do caixa (a que recebe NFC-e) marcada na Central de Impressões." };
  const { error } = await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "vale", ref_id: id, impressora_id })));
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const };
}

export async function cancelarVale(id: string, motivo: string) {
  await exigirAcesso("/salao");
  const m = (motivo || "").trim();
  if (m.length < 3) return { ok: false as const, mensagem: "Escreva o motivo (pelo menos 3 letras)." };
  const supabase = await createClient();
  const { error } = await supabase.from("vales_presente").update({ status: "cancelado", cancelado_em: new Date().toISOString(), cancelado_motivo: m.slice(0, 200) }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa/vales");
  return { ok: true as const };
}

export async function prorrogarVale(id: string, validade: string) {
  await exigirAcesso("/salao");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || validade < hojeSP()) return { ok: false as const, mensagem: "Escolha uma data a partir de hoje." };
  const supabase = await createClient();
  const { error } = await supabase.from("vales_presente").update({ validade }).eq("id", id);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa/vales");
  return { ok: true as const };
}

/** Devolve ao vale uma baixa feita por engano. */
export async function estornarUsoVale(usoId: string, motivo: string) {
  await exigirAcesso("/salao");
  const m = (motivo || "").trim();
  if (m.length < 3) return { ok: false as const, mensagem: "Escreva o motivo (pelo menos 3 letras)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vale_presente_estornar", { p_uso: usoId, p_obs: m.slice(0, 150) });
  if (error) return { ok: false as const, mensagem: error.message };
  const r = data as { ok: boolean; erro?: string };
  if (!r?.ok) return { ok: false as const, mensagem: r?.erro ?? "Não consegui devolver." };
  revalidatePath("/salao/caixa/vales");
  return { ok: true as const };
}
