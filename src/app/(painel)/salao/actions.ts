"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "./util";

const valorNum = (s: unknown) =>
  Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;

// ---------- Configurações do PDV (pdv_config chave/valor) ----------
export async function salvarConfigPdv(formData: FormData) {
  const supabase = await createClient();
  const linhas = [
    { chave: "nome_restaurante", valor: ((formData.get("nome_restaurante") as string) || "").trim() },
    { chave: "tara_padrao", valor: String(valorNum(formData.get("tara_padrao"))) },
    { chave: "preco_kg", valor: String(valorNum(formData.get("preco_kg"))) },
    { chave: "buffet_livre", valor: String(valorNum(formData.get("buffet_livre"))) },
    { chave: "servico_percent", valor: String(valorNum(formData.get("servico_percent"))) },
    { chave: "servico_so_noite", valor: formData.get("servico_so_noite") === "on" ? "1" : "0" },
    { chave: "servico_inicio", valor: (formData.get("servico_inicio") as string) || "18:00" },
    { chave: "cupom_endereco", valor: ((formData.get("cupom_endereco") as string) || "").trim() },
    { chave: "cupom_telefone", valor: ((formData.get("cupom_telefone") as string) || "").trim() },
    { chave: "cupom_msg", valor: ((formData.get("cupom_msg") as string) || "").trim() },
  ];
  await supabase.from("pdv_config").upsert(linhas);
  revalidatePath("/salao/cardapio");
}

// ---------- Itens do cardápio ----------
export async function salvarItem(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const nome = (formData.get("nome") as string)?.trim();
  if (!nome) return;
  const categoria = (formData.get("categoria") as string)?.trim() || null;
  const preco = valorNum(formData.get("preco"));
  if (id)
    await supabase.from("pdv_itens").update({ nome, categoria, preco }).eq("id", id);
  else await supabase.from("pdv_itens").insert({ nome, categoria, preco });
  revalidatePath("/salao/cardapio");
}

export async function excluirItem(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("pdv_itens").delete().eq("id", formData.get("id") as string);
  revalidatePath("/salao/cardapio");
}

// ---------- Comandas ----------
async function pdvCfg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("pdv_config").select("chave, valor");
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[r.chave] = r.valor;
  return m;
}

// Calcula o valor do buffet a partir do peso/tara e da config (aplica "livre").
function calcBuffet(cfg: Record<string, string>, peso: number, tara: number) {
  const liquido = Math.max(0, peso - tara);
  const precoKg = Number(cfg.preco_kg || 0);
  const livre = Number(cfg.buffet_livre || 0);
  let valor = liquido * precoKg;
  let ehLivre = false;
  if (livre > 0 && valor >= livre) {
    valor = livre;
    ehLivre = true;
  }
  return { valor: Math.round(valor * 100) / 100, livre: ehLivre };
}

// Nova comanda de buffet a partir do peso (kg). Aplica "livre" (teto) se passar.
export async function criarComandaBuffet(formData: FormData) {
  const supabase = await createClient();
  const peso = valorNum(formData.get("peso"));
  if (peso <= 0) return;
  const cfg = await pdvCfg(supabase);
  const tara = valorNum(formData.get("tara")) || Number(cfg.tara_padrao || 0);
  const { valor, livre } = calcBuffet(cfg, peso, tara);
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({ peso, tara, valor_buffet: valor, livre })
    .select("id")
    .single();
  revalidatePath("/salao");
  if (com) redirect(`/salao/comandas/${com.id}`);
}

// Edita o buffet da comanda (peso/tara) e recalcula o valor.
export async function editarBuffet(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const peso = valorNum(formData.get("peso"));
  const tara = valorNum(formData.get("tara"));
  const cfg = await pdvCfg(supabase);
  const { valor, livre } = calcBuffet(cfg, peso, tara);
  await supabase
    .from("pdv_comandas")
    .update({ peso, tara, valor_buffet: valor, livre })
    .eq("id", id);
  revalidatePath(`/salao/comandas/${id}`);
}

export async function excluirComanda(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("pdv_comandas").delete().eq("id", formData.get("id") as string);
  revalidatePath("/salao");
  redirect("/salao");
}

// Junta OUTRA comanda nesta: move os itens, soma buffet/peso/tara e apaga a outra.
export async function juntarComandas(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const outra = formData.get("outra") as string;
  if (!outra || outra === id) return;

  const [{ data: a }, { data: o }] = await Promise.all([
    supabase.from("pdv_comandas").select("peso, tara, valor_buffet, livre").eq("id", id).single(),
    supabase.from("pdv_comandas").select("peso, tara, valor_buffet, livre").eq("id", outra).single(),
  ]);
  if (!a || !o) return;

  await supabase.from("pdv_comanda_itens").update({ comanda_id: id }).eq("comanda_id", outra);
  await supabase
    .from("pdv_comandas")
    .update({
      peso: Number(a.peso || 0) + Number(o.peso || 0),
      tara: Number(a.tara || 0) + Number(o.tara || 0),
      valor_buffet: Number(a.valor_buffet) + Number(o.valor_buffet),
      livre: a.livre || o.livre,
    })
    .eq("id", id);
  await supabase.from("pdv_comandas").delete().eq("id", outra);
  revalidatePath(`/salao/comandas/${id}`);
  revalidatePath("/salao");
}

export async function adicionarItemComanda(comandaId: string, itemId: string) {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("pdv_itens")
    .select("nome, preco")
    .eq("id", itemId)
    .single();
  if (!item) return;
  await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    item_id: itemId,
    descricao: item.nome,
    qtd: 1,
    preco_unit: item.preco,
  });
  revalidatePath(`/salao/comandas/${comandaId}`);
}

// Monta uma pizza (tamanho + sabores + borda) e adiciona à comanda.
// Preço = média dos sabores escolhidos (para o tamanho) + borda (para o tamanho).
// O cálculo é feito no servidor a partir das tabelas — o cliente só manda os ids.
export async function adicionarPizzaComanda(
  comandaId: string,
  tamanhoId: string,
  saborIds: string[],
  bordaId: string | null,
) {
  const supabase = await createClient();
  if (!tamanhoId || saborIds.length === 0) return;

  const [{ data: tam }, { data: sabPrecos }, { data: sabores }] = await Promise.all([
    supabase.from("pdv_pizza_tamanhos").select("nome, max_sabores").eq("id", tamanhoId).single(),
    supabase
      .from("pdv_pizza_sabor_precos")
      .select("sabor_id, preco")
      .eq("tamanho_id", tamanhoId)
      .in("sabor_id", saborIds),
    supabase.from("pdv_pizza_sabores").select("id, nome").in("id", saborIds),
  ]);
  if (!tam) return;

  const ids = saborIds.slice(0, tam.max_sabores);
  const precoDe = new Map((sabPrecos ?? []).map((p) => [p.sabor_id, Number(p.preco)]));
  const nomeDe = new Map((sabores ?? []).map((s) => [s.id, s.nome]));
  const usados = ids.filter((id) => precoDe.has(id));
  if (usados.length === 0) return;

  const media =
    usados.reduce((s, id) => s + (precoDe.get(id) || 0), 0) / usados.length;

  let bordaNome = "";
  let bordaPreco = 0;
  if (bordaId) {
    const [{ data: b }, { data: bp }] = await Promise.all([
      supabase.from("pdv_pizza_bordas").select("nome").eq("id", bordaId).single(),
      supabase
        .from("pdv_pizza_borda_precos")
        .select("preco")
        .eq("borda_id", bordaId)
        .eq("tamanho_id", tamanhoId)
        .single(),
    ]);
    if (b) bordaNome = b.nome;
    bordaPreco = Number(bp?.preco ?? 0);
  }

  const preco = Math.round((media + bordaPreco) * 100) / 100;
  const nomes = usados.map((id) => nomeDe.get(id) || "?").join(" / ");
  const descricao =
    `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : "");

  await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    descricao,
    qtd: 1,
    preco_unit: preco,
  });
  revalidatePath(`/salao/comandas/${comandaId}`);
}

export async function removerItemComanda(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const comandaId = formData.get("comanda_id") as string;
  await supabase.from("pdv_comanda_itens").delete().eq("id", id);
  revalidatePath(`/salao/comandas/${comandaId}`);
}

export async function fecharComanda(formData: FormData) {
  const supabase = await createClient();
  const comandaId = formData.get("id") as string;
  const forma = (formData.get("forma") as string) || null;

  const [{ data: com }, { data: itens }, cfg] = await Promise.all([
    supabase.from("pdv_comandas").select("valor_buffet").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("qtd, preco_unit").eq("comanda_id", comandaId),
    pdvCfg(supabase),
  ]);
  const subtotal =
    Number(com?.valor_buffet ?? 0) +
    (itens ?? []).reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  const perc = servicoAgora(cfg);
  const servico = Math.round(subtotal * perc) / 100;

  await supabase
    .from("pdv_comandas")
    .update({
      status: "fechada",
      fechada_em: new Date().toISOString(),
      forma_pagamento: forma,
      servico,
    })
    .eq("id", comandaId);
  revalidatePath(`/salao/comandas/${comandaId}`);
  revalidatePath("/salao");
}

export async function reabrirComanda(formData: FormData) {
  const supabase = await createClient();
  const comandaId = formData.get("id") as string;
  await supabase
    .from("pdv_comandas")
    .update({ status: "aberta", fechada_em: null })
    .eq("id", comandaId);
  revalidatePath(`/salao/comandas/${comandaId}`);
}
