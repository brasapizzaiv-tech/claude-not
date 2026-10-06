"use server";

import { createClient } from "@/lib/supabase/server";
import { lancarPedidoGarcom } from "@/app/(garcom)/garcom/actions";
import { exigirAcesso } from "@/lib/permissoes-server";
import { tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { lancarFormasEspeciais } from "@/lib/pagamento-especial";

type ItemVenda = { itemId: string; nome: string; preco: number; qtd: number };

// Finaliza uma venda de balcão: cria a comanda "Balcão" + itens + manda pra
// cozinha (reaproveita o garçom) e, se veio pagamento, cobra o valor cheio
// (sem serviço de garçom), lança no caixa aberto e fecha a venda.
// "Compra da equipe" pede o funcionário (vai pra Compras internas) e "Saldo
// cliente" pede o cliente (vai pro fiado dele) — mesmo código do caixa.
export async function finalizarVendaPdv(
  itens: ItemVenda[],
  obs: string,
  pagamento: { forma: string; colaboradorId?: string | null; clienteId?: string | null } | null,
  local: "aqui" | "viagem" = "aqui",
) {
  // O rótulo da "mesa" vira o cabeçalho grande da comanda na cozinha — então
  // "VIAGEM" aparece bem visível pra saberem que é pra embalar.
  const mesa = local === "viagem" ? "Balcão · VIAGEM" : "Balcão";
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

  // Funcionário / cliente antes de marcar qualquer coisa como paga: se faltar
  // alguém, a comanda fica aberta e o caixa recebe depois.
  const tipo = tipoDe(pagamento.forma, await formasParaTipo());
  if (tipo === "equipe" || tipo === "saldo") {
    const esp = await lancarFormasEspeciais(supabase, {
      pagamentos: [{ forma: pagamento.forma, valor: total, colaboradorId: pagamento.colaboradorId ?? null }],
      clienteId: pagamento.clienteId ?? null,
      rotulo: `PDV Balcão #${r.numero}`,
      comandaId: r.comandaId,
      caixaId: cx?.id ?? null,
    });
    if (!esp.ok) {
      return { ok: false as const, mensagem: `${esp.mensagem} A comanda #${r.numero} ficou aberta pra receber no caixa.` };
    }
  }

  for (const p of payables) {
    await supabase.from("pdv_comanda_itens").update({ valor_pago: p.payable, pago: true }).eq("id", p.id);
  }

  if (cx?.id) {
    await supabase.from("pdv_caixa_mov").insert({
      caixa_id: cx.id,
      tipo: "venda",
      descricao: `PDV Balcão #${r.numero}`,
      forma_pagamento: pagamento.forma,
      valor: total,
      comanda_id: r.comandaId,
    });
  }

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

  return { ok: true as const, numero: r.numero, comandaId: r.comandaId, pago: true, semCaixa: !cx?.id, total };
}

// Cliente pro "Saldo cliente" no balcão (nome ou CPF/CNPJ).
export async function buscarClientesPdv(termo: string) {
  await exigirAcesso("/pdv");
  const q = (termo || "").trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const soDigitos = q.replace(/\D/g, "");
  let busca = supabase.from("clientes").select("id, nome, cpf_cnpj").eq("ativo", true);
  busca = soDigitos.length >= 3
    ? busca.or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${soDigitos}%`)
    : busca.ilike("nome", `%${q}%`);
  const { data } = await busca.order("nome").limit(8);
  return ((data as { id: string; nome: string; cpf_cnpj: string | null }[]) ?? []);
}
