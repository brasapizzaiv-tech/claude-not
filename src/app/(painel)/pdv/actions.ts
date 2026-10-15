"use server";

import { createClient } from "@/lib/supabase/server";
import { lancarPedidoGarcom } from "@/app/(garcom)/garcom/actions";
import { exigirAcesso } from "@/lib/permissoes-server";
import { naoEntraNoCaixa, tipoDe, tipoDoMovimento } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { lancarFormasEspeciais } from "@/lib/pagamento-especial";
import { camposTefDoMov, registrarTefDaVenda, type TefDaVenda } from "@/lib/tef-venda-server";
import { debitarVale, ligarBaixaAoMov, obsDaBaixa } from "@/lib/vale-presente-server";
import { normalizarCodigo } from "@/lib/vale-presente";

type ItemVenda = { itemId: string; nome: string; preco: number; qtd: number };

// Finaliza uma venda de balcão: cria a comanda "Balcão" + itens + manda pra
// cozinha (reaproveita o garçom) e, se veio pagamento, cobra o valor cheio
// (sem serviço de garçom), lança no caixa aberto e fecha a venda.
// "Compra da equipe" pede o funcionário (vai pra Compras internas) e "Saldo
// cliente" pede o cliente (vai pro fiado dele) — mesmo código do caixa.
export async function finalizarVendaPdv(
  itens: ItemVenda[],
  obs: string,
  // `tef`: já cobrado no pinpad (Pix na maquininha ou cartão), no valor `valorTef`.
  pagamento: { forma: string; colaboradorId?: string | null; clienteId?: string | null; usarCashback?: boolean; tef?: TefDaVenda | null; valorTef?: number; observacao?: string | null; valeCodigo?: string | null } | null,
  local: "aqui" | "viagem" = "aqui",
) {
  // O rótulo da "mesa" vira o cabeçalho grande da comanda na cozinha — então
  // "VIAGEM" aparece bem visível pra saberem que é pra embalar.
  const mesa = local === "viagem" ? "Balcão · VIAGEM" : "Balcão";
  // Cortesia / vale-presente pedem o motivo antes de mandar pra cozinha.
  if (pagamento && naoEntraNoCaixa(tipoDe(pagamento.forma, await formasParaTipo())) && !(pagamento.observacao ?? "").trim() && !(pagamento.valeCodigo ?? "").trim()) {
    return { ok: false as const, mensagem: `Escreva o motivo da ${pagamento.forma} (ex.: aniversário, nº do vale).` };
  }
  // Vale-presente com código: o saldo tem que cobrir a venda toda (no PDV é
  // um pagamento só). Confere ANTES de mandar pra cozinha; dividir em duas
  // formas é no caixa do salão.
  if (pagamento && (pagamento.valeCodigo ?? "").trim()) {
    const sb = await createClient();
    const { data: vs } = await sb.from("vales_presente").select("saldo").eq("codigo", normalizarCodigo(pagamento.valeCodigo)).maybeSingle();
    const saldoVale = Number((vs as { saldo?: number } | null)?.saldo ?? 0);
    const estimado = Math.round(itens.reduce((t, i) => t + Number(i.preco) * Number(i.qtd), 0) * 100) / 100;
    if (!vs) return { ok: false as const, mensagem: "Código de vale não encontrado." };
    if (saldoVale < estimado - 0.005) {
      return { ok: false as const, mensagem: `O vale tem ${saldoVale.toFixed(2).replace(".", ",")} de saldo e a venda dá ${estimado.toFixed(2).replace(".", ",")}. Pra usar o vale e pagar o resto de outro jeito, lance pelo caixa do salão.` };
    }
  }
  const r = await lancarPedidoGarcom(mesa, itens, obs);
  if (!r.ok || !r.comandaId) return r;

  if (!pagamento) {
    return { ok: true as const, numero: r.numero, comandaId: r.comandaId, pago: false, semCaixa: false };
  }

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("pdv_comanda_itens")
    .select("id, qtd, preco_unit")
    .eq("comanda_id", r.comandaId);

  let total = 0;
  const payables: { id: string; payable: number }[] = [];
  for (const it of rows ?? []) {
    const payable = Math.round(Number(it.qtd) * Number(it.preco_unit) * 100) / 100;
    total += payable;
    payables.push({ id: it.id as string, payable });
  }
  total = Math.round(total * 100) / 100;

  const { data: cx } = await supabase
    .from("pdv_caixas")
    .select("id")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cashback (só com cliente vinculado — é opcional no balcão). O usado sai do
  // valor cobrado; o ganho entra depois da venda fechar.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clienteId = pagamento.clienteId ?? null;
  const tipo = tipoDe(pagamento.forma, await formasParaTipo());
  let cashbackUsado = 0;
  type CbCfg = { ativo: boolean; max_resgate: number | null; canais: string[]; sem_promos: boolean };
  let cbCfg: CbCfg | null = null;
  if (clienteId) {
    const { data } = await supabase.from("cashback_config").select("ativo, max_resgate, canais, sem_promos").maybeSingle();
    cbCfg = (data as CbCfg | null) ?? null;
  }
  const cashbackNoPdv = !!(cbCfg?.ativo && (cbCfg.canais ?? []).includes("pdv"));
  if (clienteId && cashbackNoPdv && pagamento.usarCashback && tipo !== "equipe") {
    const { data: saldo } = await supabase.rpc("cashback_saldo", { p_cliente: clienteId });
    const teto = cbCfg?.max_resgate != null ? Number(cbCfg.max_resgate) : Infinity;
    const desejado = r2(Math.max(0, Math.min(Number(saldo ?? 0), teto, total)));
    if (desejado > 0) {
      const { data: usado } = await supabase.rpc("cashback_resgatar_ref", { p_cliente: clienteId, p_pedido: null, p_comanda: r.comandaId, p_valor: desejado });
      cashbackUsado = r2(Number(usado ?? 0));
    }
  }
  const cobrar = r2(total - cashbackUsado);

  // Cobrado no pinpad por um valor diferente do que o servidor calculou (o
  // cashback mudou no meio)? Não fecha: a tela desfaz a cobrança e a comanda
  // fica aberta pra receber no caixa.
  const tef = pagamento.tef ?? null;
  if (tef && Math.abs(r2(Number(pagamento.valorTef ?? 0)) - cobrar) > 0.009) {
    if (cashbackUsado > 0) await supabase.rpc("cashback_estornar_resgate_comanda", { p_comanda: r.comandaId });
    return { ok: false as const, mensagem: `O valor mudou (agora ${cobrar.toFixed(2).replace(".", ",")}). A comanda #${r.numero} foi pra cozinha e ficou aberta pra receber no caixa.` };
  }

  // Funcionário / cliente antes de marcar qualquer coisa como paga: se faltar
  // alguém, a comanda fica aberta e o caixa recebe depois.
  if (tipo === "equipe" || tipo === "saldo") {
    const esp = await lancarFormasEspeciais(supabase, {
      pagamentos: [{ forma: pagamento.forma, valor: cobrar, colaboradorId: pagamento.colaboradorId ?? null }],
      clienteId: pagamento.clienteId ?? null,
      rotulo: `PDV Balcão #${r.numero}`,
      comandaId: r.comandaId,
      caixaId: cx?.id ?? null,
    });
    if (!esp.ok) {
      if (cashbackUsado > 0) await supabase.rpc("cashback_estornar_resgate_comanda", { p_comanda: r.comandaId });
      return { ok: false as const, mensagem: `${esp.mensagem} A comanda #${r.numero} ficou aberta pra receber no caixa.` };
    }
  }

  // Vale-presente com código: baixa no saldo antes de marcar pago. Se não
  // passar (saldo mudou entre a conferência e agora), a comanda fica aberta.
  let baixaVale: Awaited<ReturnType<typeof debitarVale>> | null = null;
  if (tipo === "vale_presente" && (pagamento.valeCodigo ?? "").trim()) {
    baixaVale = await debitarVale(supabase, pagamento.valeCodigo!, cobrar, "pdv", r.comandaId);
    if (!baixaVale.ok) {
      if (cashbackUsado > 0) await supabase.rpc("cashback_estornar_resgate_comanda", { p_comanda: r.comandaId });
      return { ok: false as const, mensagem: `${baixaVale.mensagem} A comanda #${r.numero} foi pra cozinha e ficou aberta pra receber no caixa.` };
    }
  }

  for (const p of payables) {
    await supabase.from("pdv_comanda_itens").update({ valor_pago: p.payable, pago: true }).eq("id", p.id);
  }

  let movId: string | null = null;
  if (cx?.id) {
    const { data: mov } = await supabase.from("pdv_caixa_mov").insert({
      caixa_id: cx.id,
      tipo: tipoDoMovimento(tipo),
      observacao: ((baixaVale?.ok ? obsDaBaixa(baixaVale.baixa) : "") || (pagamento.observacao ?? "").trim()).slice(0, 200) || null,
      descricao: `PDV Balcão #${r.numero}${cashbackUsado > 0 ? ` · cashback ${cashbackUsado.toFixed(2).replace(".", ",")}` : ""}`,
      forma_pagamento: pagamento.forma,
      valor: cobrar,
      comanda_id: r.comandaId,
      ...camposTefDoMov(tef),
    }).select("id").maybeSingle();
    movId = (mov as { id?: string } | null)?.id ?? null;
    if (baixaVale?.ok) await ligarBaixaAoMov(supabase, baixaVale.baixa, movId);
  }
  // Pinpad: a transação nasce "aprovada"; a tela confirma no pinpad e fecha.
  const tefTransacaoId = tef ? await registrarTefDaVenda(supabase, { caixaId: cx?.id ?? null, movId, comandaIds: [r.comandaId], valor: cobrar, tef }) : null;

  await supabase
    .from("pdv_comandas")
    .update({
      status: "fechada",
      fechada_em: new Date().toISOString(),
      forma_pagamento: pagamento.forma,
      servico: 0,
      ...(pagamento.clienteId ? { cliente_id: pagamento.clienteId } : {}),
    })
    .eq("id", r.comandaId);

  // Cashback ganho nesta venda: itens (sem os em promoção, se a config manda),
  // tirando a parte paga com cashback.
  let cashbackGanho = 0;
  if (clienteId && cashbackNoPdv && tipo !== "equipe" && !naoEntraNoCaixa(tipo) && total > 0) {
    let elegivel = total;
    if (cbCfg?.sem_promos !== false) {
      const ids = [...new Set(itens.map((i) => i.itemId).filter(Boolean))];
      const { data: promos } = ids.length
        ? await supabase.from("pdv_itens").select("id").in("id", ids).gt("promo_preco", 0)
        : { data: [] };
      const emPromo = new Set(((promos as { id: string }[]) ?? []).map((p) => p.id));
      elegivel = r2(itens.filter((i) => !emPromo.has(i.itemId)).reduce((s, i) => s + i.preco * i.qtd, 0));
    }
    const base = r2(Math.max(0, elegivel * (1 - cashbackUsado / total)));
    const { data: ganho } = await supabase.rpc("cashback_creditar_venda", { p_cliente: clienteId, p_comanda: r.comandaId, p_base: base, p_forma: pagamento.forma });
    cashbackGanho = r2(Number(ganho ?? 0));
  }

  return { ok: true as const, numero: r.numero, comandaId: r.comandaId, pago: true, semCaixa: !cx?.id, total: cobrar, cashbackUsado, cashbackGanho, tefTransacaoId };
}

// Saldo de cashback do cliente vinculado no balcão (pra mostrar e oferecer usar).
export async function cashbackClientePdv(clienteId: string) {
  await exigirAcesso("/pdv");
  const supabase = await createClient();
  const { data: cfg } = await supabase.from("cashback_config").select("ativo, percentual, max_resgate, canais").maybeSingle();
  const c = cfg as { ativo: boolean; percentual: number; max_resgate: number | null; canais: string[] } | null;
  if (!c?.ativo || !(c.canais ?? []).includes("pdv")) return null;
  const { data: saldo } = await supabase.rpc("cashback_saldo", { p_cliente: clienteId });
  return { saldo: Number(saldo ?? 0), percentual: Number(c.percentual), maxResgate: c.max_resgate != null ? Number(c.max_resgate) : null };
}

// Cliente no balcão (nome, CPF/CNPJ ou telefone) — pro "Saldo cliente" e pro cashback.
export async function buscarClientesPdv(termo: string) {
  await exigirAcesso("/pdv");
  const q = (termo || "").trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const soDigitos = q.replace(/\D/g, "");
  let busca = supabase.from("clientes").select("id, nome, cpf_cnpj, telefone").eq("ativo", true);
  busca = soDigitos.length >= 3
    ? busca.or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${soDigitos}%,telefone.ilike.%${soDigitos}%`)
    : busca.ilike("nome", `%${q}%`);
  const { data } = await busca.order("nome").limit(8);
  return ((data as { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null }[]) ?? []);
}
