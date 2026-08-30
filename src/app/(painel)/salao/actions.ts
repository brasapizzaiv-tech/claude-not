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
    { chave: "qtd_mesas", valor: String(Math.max(0, Math.round(valorNum(formData.get("qtd_mesas"))))) },
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
  // Preços por dia da semana (0=Dom..6=Sáb). Vazio = usa o preço geral.
  for (let d = 0; d <= 6; d++) {
    const kg = formData.get(`preco_kg_${d}`);
    const lv = formData.get(`buffet_livre_${d}`);
    if (kg !== null) linhas.push({ chave: `preco_kg_${d}`, valor: kg ? String(valorNum(kg)) : "" });
    if (lv !== null) linhas.push({ chave: `buffet_livre_${d}`, valor: lv ? String(valorNum(lv)) : "" });
  }
  await supabase.from("pdv_config").upsert(linhas);
  revalidatePath("/salao/cardapio");
}

// ---------- Categorias do cardápio ----------
async function garantirCategoria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nome: string,
) {
  const n = nome.trim();
  if (!n) return;
  const { data } = await supabase.from("pdv_categorias").select("id").eq("nome", n).maybeSingle();
  if (data) return;
  const { data: max } = await supabase
    .from("pdv_categorias")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("pdv_categorias").insert({ nome: n, ordem: (Number(max?.ordem) || 0) + 1 });
}

export async function adicionarCategoria(formData: FormData) {
  const supabase = await createClient();
  await garantirCategoria(supabase, (formData.get("nome") as string) || "");
  revalidatePath("/salao/cardapio");
}

export async function toggleCategoria(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const disponivel = formData.get("disponivel") === "1";
  await supabase.from("pdv_categorias").update({ disponivel }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

export async function moverCategoria(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const dir = (formData.get("dir") as string) === "cima" ? -1 : 1;
  const { data: cats } = await supabase
    .from("pdv_categorias")
    .select("id, ordem")
    .order("ordem", { ascending: true });
  const lista = (cats as { id: string; ordem: number }[]) ?? [];
  const idx = lista.findIndex((c) => c.id === id);
  const alvo = idx + dir;
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
  const a = lista[idx];
  const b = lista[alvo];
  await Promise.all([
    supabase.from("pdv_categorias").update({ ordem: b.ordem }).eq("id", a.id),
    supabase.from("pdv_categorias").update({ ordem: a.ordem }).eq("id", b.id),
  ]);
  revalidatePath("/salao/cardapio");
}

export async function excluirCategoria(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("pdv_categorias").delete().eq("id", formData.get("id") as string);
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
  if (categoria) await garantirCategoria(supabase, categoria);

  // O editor completo manda também descrição, canais e disponibilidade.
  const extras: Record<string, unknown> = {};
  if (formData.get("completo") === "1") {
    extras.descricao = String(formData.get("descricao") ?? "").trim().slice(0, 400) || null;
    extras.delivery = formData.get("canal_app") === "on";
    extras.canal_garcom = formData.get("canal_garcom") === "on";
    extras.canal_pdv = formData.get("canal_pdv") === "on";
    extras.disponivel = formData.get("disponivel") === "on";
  }

  if (id)
    await supabase.from("pdv_itens").update({ nome, categoria, preco, ...extras }).eq("id", id);
  else await supabase.from("pdv_itens").insert({ nome, categoria, preco, ...extras });
  revalidatePath("/salao/cardapio");
}

// Horários de disponibilidade (app do cliente) por categoria ou item.
export async function salvarHorarios(formData: FormData) {
  const supabase = await createClient();
  const tipo = formData.get("tipo") as string; // 'categoria' | 'item'
  const id = formData.get("id") as string;
  if (!["categoria", "item"].includes(tipo) || !id) return;
  const raw = String(formData.get("horarios") ?? "").trim();
  let horarios: unknown = null;
  if (raw) {
    try {
      const p = JSON.parse(raw) as { dias?: number[]; turnos?: { ini: string; fim: string }[] };
      const dias = (Array.isArray(p.dias) ? p.dias : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const turnos = (Array.isArray(p.turnos) ? p.turnos : [])
        .filter((t) => /^\d{2}:\d{2}$/.test(t?.ini ?? "") && /^\d{2}:\d{2}$/.test(t?.fim ?? ""))
        .slice(0, 4);
      horarios = dias.length === 0 && turnos.length === 0 ? null : { dias, turnos };
    } catch { horarios = null; }
  }
  const tabela = tipo === "categoria" ? "pdv_categorias" : "pdv_itens";
  await supabase.from(tabela).update({ horarios }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Disponível/indisponível manual (ex.: esgotou) — vale em todos os canais.
export async function toggleDisponivelItem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const disponivel = formData.get("disponivel") === "1";
  await supabase.from("pdv_itens").update({ disponivel }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Liga/desliga uma opção de complemento (adicional)
export async function toggleOpcaoComplemento(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const itemId = formData.get("item_id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("pdv_item_opcoes").update({ ativo }).eq("id", id);
  revalidatePath(`/salao/cardapio/adicionais/${itemId}`);
}

// Edita o preço de uma opção de complemento
export async function editarPrecoOpcao(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const itemId = formData.get("item_id") as string;
  const preco = valorNum(formData.get("preco"));
  await supabase.from("pdv_item_opcoes").update({ preco }).eq("id", id);
  revalidatePath(`/salao/cardapio/adicionais/${itemId}`);
}

export async function toggleItem(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("pdv_itens").update({ ativo }).eq("id", id);
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

// Preço do buffet HOJE (por dia da semana). Se o dia não tiver preço próprio,
// cai no preço geral (preco_kg / buffet_livre). Fuso de Brasília.
function precoDoDia(cfg: Record<string, string>) {
  const dow = new Date(new Date().getTime() - 3 * 3600 * 1000).getUTCDay(); // 0=Dom..6=Sáb
  const kgDia = cfg[`preco_kg_${dow}`];
  const livreDia = cfg[`buffet_livre_${dow}`];
  const precoKg = kgDia != null && kgDia !== "" ? Number(kgDia) : Number(cfg.preco_kg || 0);
  const livre = livreDia != null && livreDia !== "" ? Number(livreDia) : Number(cfg.buffet_livre || 0);
  return { precoKg, livre };
}

// Calcula o valor do buffet. soPorKg=true (marmita) NÃO aplica o teto "livre".
function calcBuffet(
  cfg: Record<string, string>,
  peso: number,
  tara: number,
  soPorKg = false,
) {
  const liquido = Math.max(0, peso - tara);
  const { precoKg, livre } = precoDoDia(cfg);
  let valor = liquido * precoKg;
  let ehLivre = false;
  if (!soPorKg && livre > 0 && valor >= livre) {
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
  const mesa = ((formData.get("mesa") as string) || "Balança").trim();
  const soPorKg = formData.get("so_kg") === "1";
  const { valor, livre } = calcBuffet(cfg, peso, tara, soPorKg);
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({ peso, tara, valor_buffet: valor, livre, mesa, so_kg: soPorKg })
    .select("id")
    .single();
  revalidatePath("/salao");
  if (com) redirect(`/salao/comandas/${com.id}`);
}

// Quiosque de autoatendimento: gera a comanda de buffet e RETORNA os dados
// (número, valor) para mostrar na tela — sem redirecionar.
export async function gerarComandaBuffetKiosk(
  peso: number,
  soPorKg = false,
  taraBalanca = 0,
) {
  const supabase = await createClient();
  if (!(peso > 0)) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  // Se tarou NA balança, o peso já vem líquido → tara do sistema = 0.
  const tara = taraBalanca > 0.001 ? 0 : Number(cfg.tara_padrao || 0);
  const { valor, livre } = calcBuffet(cfg, peso, tara, soPorKg);
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({
      peso,
      tara: taraBalanca > 0.001 ? taraBalanca : tara,
      valor_buffet: valor,
      livre,
      mesa: "Balança",
      so_kg: soPorKg,
    })
    .select("id, numero")
    .single();
  revalidatePath("/salao");
  if (!com) return { ok: false as const };
  return {
    ok: true as const,
    id: com.id as string,
    numero: Number(com.numero),
    valor,
    peso,
    tara,
    liquido: Math.max(0, peso - tara),
    livre,
  };
}

// Nova comanda "à la carte" numa mesa (sem buffet). Abre a comanda em seguida.
export async function criarComandaMesa(formData: FormData) {
  const supabase = await createClient();
  const mesa = ((formData.get("mesa") as string) || "").trim();
  if (!mesa) return;
  const garcom = (formData.get("destino") as string) === "garcom";
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({ mesa, peso: 0, tara: 0, valor_buffet: 0, livre: false })
    .select("id")
    .single();
  revalidatePath("/salao");
  revalidatePath("/garcom");
  if (com) redirect(`${garcom ? "/garcom/comanda" : "/salao/comandas"}/${com.id}`);
}

// Edita o buffet da comanda (peso/tara) e recalcula o valor (respeita marmita).
export async function editarBuffet(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const peso = valorNum(formData.get("peso"));
  const tara = valorNum(formData.get("tara"));
  const cfg = await pdvCfg(supabase);
  const { data: atual } = await supabase
    .from("pdv_comandas")
    .select("so_kg")
    .eq("id", id)
    .maybeSingle();
  const { valor, livre } = calcBuffet(cfg, peso, tara, !!atual?.so_kg);
  await supabase
    .from("pdv_comandas")
    .update({ peso, tara, valor_buffet: valor, livre })
    .eq("id", id);
  revalidatePath(`/salao/comandas/${id}`);
}

// Caixa: troca rápida entre buffet (com teto livre) e marmita (só por kg),
// recalculando o valor da comanda.
export async function alternarMarmita(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("peso, tara, so_kg")
    .eq("id", id)
    .maybeSingle();
  if (!com) return;
  const novo = !com.so_kg;
  const cfg = await pdvCfg(supabase);
  const { valor, livre } = calcBuffet(cfg, Number(com.peso), Number(com.tara), novo);
  await supabase
    .from("pdv_comandas")
    .update({ so_kg: novo, valor_buffet: valor, livre })
    .eq("id", id);
  revalidatePath("/salao/caixa");
  revalidatePath(`/salao/comandas/${id}`);
}

export async function excluirComanda(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const motivo = ((formData.get("motivo") as string) || "").trim();
  if (motivo.length < 3) return; // motivo obrigatório

  // Registra no log de auditoria antes de apagar.
  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("numero, mesa, valor_buffet")
    .eq("id", id)
    .maybeSingle();
  const { data: itc } = await supabase
    .from("pdv_comanda_itens")
    .select("qtd, preco_unit")
    .eq("comanda_id", id);
  const valor =
    Number(com?.valor_buffet ?? 0) +
    (itc ?? []).reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("pdv_comandas_excluidas").insert({
    comanda_numero: com?.numero ?? null,
    mesa: com?.mesa ?? null,
    valor,
    motivo,
    excluido_por: userData.user?.id ?? null,
  });

  await supabase.from("pdv_comandas").delete().eq("id", id);
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

// Adiciona um item com complementos (marmita) à comanda.
// Preço = preço base do item + soma das opções escolhidas (tudo validado no servidor).
export async function adicionarComboComanda(
  comandaId: string,
  itemId: string,
  opcaoIds: string[],
) {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("pdv_itens")
    .select("nome, preco")
    .eq("id", itemId)
    .single();
  if (!item) return;

  const nomes: string[] = [];
  let extra = 0;
  if (opcaoIds.length > 0) {
    // conta repetições (opcaoIds pode ter ids repetidos)
    const cont = new Map<string, number>();
    for (const id of opcaoIds) cont.set(id, (cont.get(id) || 0) + 1);

    // só opções que realmente pertencem aos grupos deste item
    const { data: grupos } = await supabase
      .from("pdv_item_grupos")
      .select("id")
      .eq("item_id", itemId);
    const grupoIds = (grupos ?? []).map((g) => g.id);
    if (grupoIds.length) {
      const { data: ops } = await supabase
        .from("pdv_item_opcoes")
        .select("id, nome, preco")
        .in("id", [...cont.keys()])
        .in("grupo_id", grupoIds);
      for (const o of ops ?? []) {
        const qtd = cont.get(o.id) || 0;
        const preco = Number(o.preco);
        extra += preco * qtd;
        const prefixo = qtd > 1 ? `${qtd}× ` : "";
        nomes.push(preco > 0 ? `${prefixo}${o.nome} (+${preco})` : `${prefixo}${o.nome}`);
      }
    }
  }

  const preco = Math.round((Number(item.preco) + extra) * 100) / 100;
  // Cada opção numa linha (fica um embaixo do outro na tela e na impressão).
  const descricao = nomes.length
    ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}`
    : item.nome;

  await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    item_id: itemId,
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
  revalidatePath(`/garcom/comanda/${comandaId}`);
}

// Total de uma comanda = buffet + itens + serviço (do horário).
async function calcTotalComanda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comandaId: string,
  cfg: Record<string, string>,
) {
  const [{ data: com }, { data: itens }] = await Promise.all([
    supabase.from("pdv_comandas").select("numero, valor_buffet").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("qtd, preco_unit").eq("comanda_id", comandaId),
  ]);
  const subtotal =
    Number(com?.valor_buffet ?? 0) +
    (itens ?? []).reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  const servico = Math.round(subtotal * servicoAgora(cfg)) / 100;
  return { numero: com?.numero as number | undefined, servico, total: subtotal + servico };
}

// O que ainda falta pagar de uma comanda (itens e buffet não pagos + serviço).
// Fecha a comanda quando não sobra nada a pagar (itens + buffet quitados).
async function fecharSeQuitou(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comandaId: string,
  cfg: Record<string, string>,
) {
  const [{ data: itens }, { data: c2 }] = await Promise.all([
    supabase.from("pdv_comanda_itens").select("pago").eq("comanda_id", comandaId),
    supabase.from("pdv_comandas").select("valor_buffet, buffet_pago").eq("id", comandaId).single(),
  ]);
  const temBuffet = Number(c2?.valor_buffet ?? 0) > 0;
  const quitou = (itens ?? []).every((i) => i.pago) && (!temBuffet || !!c2?.buffet_pago);
  if (quitou) {
    const { servico } = await calcTotalComanda(supabase, comandaId, cfg);
    await supabase
      .from("pdv_comandas")
      .update({
        status: "fechada",
        fechada_em: new Date().toISOString(),
        forma_pagamento: "Dividido",
        servico,
      })
      .eq("id", comandaId);
  }
  return quitou;
}

// O que falta pagar de uma comanda (por item e buffet, com serviço).
async function pendenteComanda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comandaId: string,
  cfg: Record<string, string>,
) {
  const fator = 1 + servicoAgora(cfg) / 100;
  const [{ data: com }, { data: itens }] = await Promise.all([
    supabase.from("pdv_comandas").select("numero, valor_buffet, buffet_valor_pago").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("id, qtd, preco_unit, valor_pago").eq("comanda_id", comandaId),
  ]);
  const itensPag: { id: string; valor: number }[] = [];
  let restante = 0;
  for (const i of itens ?? []) {
    const rem = Math.round((Number(i.qtd) * Number(i.preco_unit) * fator - Number(i.valor_pago)) * 100) / 100;
    if (rem > 0.005) {
      itensPag.push({ id: i.id as string, valor: rem });
      restante += rem;
    }
  }
  const buffetRem =
    Math.round((Number(com?.valor_buffet ?? 0) * fator - Number(com?.buffet_valor_pago ?? 0)) * 100) / 100;
  if (buffetRem > 0.005) restante += buffetRem;
  return {
    numero: com?.numero as number | undefined,
    restante: Math.round(restante * 100) / 100,
    itensPag,
    buffetRem: Math.max(0, buffetRem),
  };
}

// Aplica um pagamento (por valor) aos itens/buffet de uma comanda. Cada item
// acumula valor_pago; vira "pago" quando cobre o total dele. Fecha ao quitar.
export async function pagarValores(
  comandaId: string,
  itensPag: { id: string; valor: number }[],
  buffetValor: number,
  pagamentos: { forma: string; valor: number }[],
) {
  const supabase = await createClient();
  const cfg = await pdvCfg(supabase);
  const fator = 1 + servicoAgora(cfg) / 100;
  const caixaId = await caixaAberto(supabase);

  for (const it of itensPag) {
    if (!(it.valor > 0)) continue;
    const { data: row } = await supabase
      .from("pdv_comanda_itens")
      .select("qtd, preco_unit, valor_pago")
      .eq("id", it.id)
      .single();
    if (!row) continue;
    const payable = Number(row.qtd) * Number(row.preco_unit) * fator;
    const novo = Math.round((Number(row.valor_pago) + it.valor) * 100) / 100;
    await supabase
      .from("pdv_comanda_itens")
      .update({ valor_pago: novo, pago: novo >= payable - 0.01 })
      .eq("id", it.id);
  }
  if (buffetValor > 0) {
    const { data: c } = await supabase
      .from("pdv_comandas")
      .select("valor_buffet, buffet_valor_pago")
      .eq("id", comandaId)
      .single();
    if (c) {
      const payable = Number(c.valor_buffet) * fator;
      const novo = Math.round((Number(c.buffet_valor_pago) + buffetValor) * 100) / 100;
      await supabase
        .from("pdv_comandas")
        .update({ buffet_valor_pago: novo, buffet_pago: novo >= payable - 0.01 })
        .eq("id", comandaId);
    }
  }

  const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", comandaId).single();
  if (caixaId) {
    for (const p of pagamentos) {
      if (!(p.valor > 0)) continue;
      await supabase.from("pdv_caixa_mov").insert({
        caixa_id: caixaId,
        tipo: "venda",
        descricao: `Comanda #${com?.numero ?? ""} (dividida)`,
        forma_pagamento: p.forma,
        valor: p.valor,
        comanda_id: comandaId,
      });
    }
  }

  const quitou = await fecharSeQuitou(supabase, comandaId, cfg);
  revalidatePath("/salao/caixa");
  revalidatePath("/salao");
  return { ok: true as const, quitou };
}

// Frente de caixa (3 colunas): paga os ITENS/BUFFET selecionados de uma ou mais
// comandas, com desconto/acréscimo já embutido nos pagamentos. Marca cada item
// pago pelo valor devido (com serviço), fecha a comanda que quitou e lança o(s)
// pagamento(s) no caixa aberto.
export async function pagarSelecao(
  sel: { comandaId: string; itemIds: string[]; buffet: boolean }[],
  pagamentos: { forma: string; valor: number }[],
  extras: { comandaId: string; itemId: string; qtd: number }[] = [],
  clienteId?: string | null,
) {
  const supabase = await createClient();
  if (sel.length === 0 && extras.length === 0) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  const fator = 1 + servicoAgora(cfg) / 100;
  const caixaId = await caixaAberto(supabase);

  // Produtos avulsos inseridos no caixa: cria o item na comanda já pago.
  for (const e of extras) {
    if (!(e.qtd > 0)) continue;
    const { data: prod } = await supabase
      .from("pdv_itens")
      .select("nome, preco")
      .eq("id", e.itemId)
      .single();
    if (!prod) continue;
    const payable = Math.round(Number(prod.preco) * e.qtd * fator * 100) / 100;
    await supabase.from("pdv_comanda_itens").insert({
      comanda_id: e.comandaId,
      item_id: e.itemId,
      descricao: prod.nome,
      qtd: e.qtd,
      preco_unit: prod.preco,
      valor_pago: payable,
      pago: true,
    });
  }

  const numeros: number[] = [];
  for (const s of sel) {
    for (const itemId of s.itemIds) {
      const { data: row } = await supabase
        .from("pdv_comanda_itens")
        .select("qtd, preco_unit")
        .eq("id", itemId)
        .single();
      if (!row) continue;
      const payable = Math.round(Number(row.qtd) * Number(row.preco_unit) * fator * 100) / 100;
      await supabase
        .from("pdv_comanda_itens")
        .update({ valor_pago: payable, pago: true })
        .eq("id", itemId);
    }
    if (s.buffet) {
      const { data: c } = await supabase
        .from("pdv_comandas")
        .select("valor_buffet")
        .eq("id", s.comandaId)
        .single();
      const payable = Math.round(Number(c?.valor_buffet ?? 0) * fator * 100) / 100;
      await supabase
        .from("pdv_comandas")
        .update({ buffet_valor_pago: payable, buffet_pago: true })
        .eq("id", s.comandaId);
    }
    const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", s.comandaId).single();
    if (com?.numero != null) numeros.push(com.numero);
    await fecharSeQuitou(supabase, s.comandaId, cfg);
  }

  // Comandas que receberam SÓ produtos avulsos (fora do "sel") também fecham.
  const idsSel = new Set(sel.map((s) => s.comandaId));
  const soExtras = [...new Set(extras.map((e) => e.comandaId))].filter((id) => !idsSel.has(id));
  for (const id of soExtras) {
    const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", id).single();
    if (com?.numero != null) numeros.push(com.numero);
    await fecharSeQuitou(supabase, id, cfg);
  }

  // Vincula o cliente às comandas envolvidas (destinatário de uma NF-e futura).
  if (clienteId) {
    const todas = [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])];
    if (todas.length > 0) {
      await supabase.from("pdv_comandas").update({ cliente_id: clienteId }).in("id", todas);
    }
  }

  const totalPago =
    Math.round(pagamentos.reduce((a, p) => a + (p.valor > 0 ? p.valor : 0), 0) * 100) / 100;
  const primeiraComanda = sel[0]?.comandaId ?? extras[0]?.comandaId;
  if (caixaId && primeiraComanda) {
    const desc = `Comandas ${numeros.map((n) => `#${n}`).join(", ")}`;
    for (const p of pagamentos) {
      if (!(p.valor > 0)) continue;
      await supabase.from("pdv_caixa_mov").insert({
        caixa_id: caixaId,
        tipo: "venda",
        descricao: desc,
        forma_pagamento: p.forma,
        valor: p.valor,
        comanda_id: primeiraComanda,
      });
    }
  }

  revalidatePath("/salao/caixa");
  revalidatePath("/salao");
  return { ok: true as const, numeros, total: totalPago };
}

// Frente de caixa: recebe VÁRIAS comandas de uma vez (somadas), com uma ou mais
// formas de pagamento (split). Cobra só o que falta, marca tudo pago e fecha.
export async function receberComandas(
  comandaIds: string[],
  pagamentos: { forma: string; valor: number }[],
) {
  const supabase = await createClient();
  if (comandaIds.length === 0) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  const caixaId = await caixaAberto(supabase);

  let totalGeral = 0;
  const numeros: number[] = [];
  const formaUnica = pagamentos.length === 1 ? pagamentos[0].forma : "Múltiplas";
  for (const id of comandaIds) {
    const { restante, numero, itensPag, buffetRem } = await pendenteComanda(supabase, id, cfg);
    totalGeral += restante;
    if (numero != null) numeros.push(numero);
    // Quita tudo o que falta desta comanda.
    for (const it of itensPag) {
      const { data: row } = await supabase
        .from("pdv_comanda_itens")
        .select("qtd, preco_unit")
        .eq("id", it.id)
        .single();
      const payable = row ? Number(row.qtd) * Number(row.preco_unit) * (1 + servicoAgora(cfg) / 100) : it.valor;
      await supabase
        .from("pdv_comanda_itens")
        .update({ valor_pago: Math.round(payable * 100) / 100, pago: true })
        .eq("id", it.id);
    }
    if (buffetRem > 0.005) {
      const { data: c } = await supabase.from("pdv_comandas").select("valor_buffet").eq("id", id).single();
      const payable = Number(c?.valor_buffet ?? 0) * (1 + servicoAgora(cfg) / 100);
      await supabase
        .from("pdv_comandas")
        .update({ buffet_valor_pago: Math.round(payable * 100) / 100, buffet_pago: true })
        .eq("id", id);
    }
    const { servico } = await calcTotalComanda(supabase, id, cfg);
    await supabase
      .from("pdv_comandas")
      .update({
        status: "fechada",
        fechada_em: new Date().toISOString(),
        forma_pagamento: formaUnica,
        servico,
      })
      .eq("id", id);
  }

  if (caixaId) {
    const desc = `Comandas ${numeros.map((n) => `#${n}`).join(", ")}`;
    for (const pg of pagamentos) {
      if (!(pg.valor > 0)) continue;
      await supabase.from("pdv_caixa_mov").insert({
        caixa_id: caixaId,
        tipo: "venda",
        descricao: desc,
        forma_pagamento: pg.forma,
        valor: pg.valor,
        comanda_id: comandaIds[0],
      });
    }
  }

  revalidatePath("/salao/caixa");
  revalidatePath("/salao");
  return { ok: true as const, total: totalGeral, numeros };
}

export async function fecharComanda(formData: FormData) {
  const supabase = await createClient();
  const comandaId = formData.get("id") as string;
  const forma = (formData.get("forma") as string) || null;

  const [{ data: com }, { data: itens }, cfg] = await Promise.all([
    supabase.from("pdv_comandas").select("numero, valor_buffet").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_itens").select("qtd, preco_unit").eq("comanda_id", comandaId),
    pdvCfg(supabase),
  ]);
  const subtotal =
    Number(com?.valor_buffet ?? 0) +
    (itens ?? []).reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  const perc = servicoAgora(cfg);
  const servico = Math.round(subtotal * perc) / 100;
  const total = subtotal + servico;

  await supabase
    .from("pdv_comandas")
    .update({
      status: "fechada",
      fechada_em: new Date().toISOString(),
      forma_pagamento: forma,
      servico,
    })
    .eq("id", comandaId);

  // lança a venda no caixa aberto (se houver)
  const caixaId = await caixaAberto(supabase);
  if (caixaId) {
    await supabase.from("pdv_caixa_mov").delete().eq("comanda_id", comandaId).eq("tipo", "venda");
    await supabase.from("pdv_caixa_mov").insert({
      caixa_id: caixaId,
      tipo: "venda",
      descricao: `Comanda #${com?.numero ?? ""}`,
      forma_pagamento: forma,
      valor: total,
      comanda_id: comandaId,
    });
  }

  revalidatePath(`/salao/comandas/${comandaId}`);
  revalidatePath("/salao");
  revalidatePath("/salao/caixa");
}

export async function reabrirComanda(formData: FormData) {
  const supabase = await createClient();
  const comandaId = formData.get("id") as string;
  await supabase
    .from("pdv_comandas")
    .update({ status: "aberta", fechada_em: null })
    .eq("id", comandaId);
  // desfaz a venda lançada no caixa (se houver)
  await supabase.from("pdv_caixa_mov").delete().eq("comanda_id", comandaId).eq("tipo", "venda");
  revalidatePath(`/salao/comandas/${comandaId}`);
  revalidatePath("/salao/caixa");
}

// ---------- Frente de Caixa ----------
async function caixaAberto(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("pdv_caixas")
    .select("id")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
}

export async function abrirCaixa(formData: FormData) {
  const supabase = await createClient();
  const jaAberto = await caixaAberto(supabase);
  if (jaAberto) redirect("/salao/caixa");
  const nome = ((formData.get("nome") as string) || "Caixa").trim();
  const saldo_inicial = valorNum(formData.get("saldo_inicial"));
  await supabase.from("pdv_caixas").insert({ nome, saldo_inicial });
  revalidatePath("/salao/caixa");
  redirect("/salao/caixa");
}

export async function suprimento(formData: FormData) {
  const supabase = await createClient();
  const caixaId = (formData.get("caixa_id") as string) || (await caixaAberto(supabase));
  const valor = valorNum(formData.get("valor"));
  if (!caixaId || valor <= 0) return;
  await supabase.from("pdv_caixa_mov").insert({
    caixa_id: caixaId,
    tipo: "suprimento",
    descricao: ((formData.get("descricao") as string) || "Suprimento").trim(),
    forma_pagamento: "Dinheiro",
    valor,
  });
  revalidatePath("/salao/caixa");
}

export async function sangria(formData: FormData) {
  const supabase = await createClient();
  const caixaId = (formData.get("caixa_id") as string) || (await caixaAberto(supabase));
  const valor = valorNum(formData.get("valor"));
  if (!caixaId || valor <= 0) return;
  await supabase.from("pdv_caixa_mov").insert({
    caixa_id: caixaId,
    tipo: "sangria",
    descricao: ((formData.get("descricao") as string) || "Sangria").trim(),
    forma_pagamento: "Dinheiro",
    valor,
  });
  revalidatePath("/salao/caixa");
}

export async function fecharCaixa(formData: FormData) {
  const supabase = await createClient();
  const caixaId = formData.get("caixa_id") as string;
  await supabase
    .from("pdv_caixas")
    .update({ status: "fechado", fechado_em: new Date().toISOString() })
    .eq("id", caixaId);
  revalidatePath("/salao/caixa");
}

// Fechamento Z: confere o dinheiro contado x esperado, grava a quebra e o
// resumo por forma de pagamento, e fecha o caixa.
export async function fecharCaixaZ(caixaId: string, dinheiroContado: number, obs: string) {
  const supabase = await createClient();
  const { data: caixa } = await supabase
    .from("pdv_caixas")
    .select("saldo_inicial")
    .eq("id", caixaId)
    .single();
  if (!caixa) return { ok: false as const };

  const { data: movs } = await supabase
    .from("pdv_caixa_mov")
    .select("tipo, forma_pagamento, valor")
    .eq("caixa_id", caixaId);

  const vendasPorForma: Record<string, number> = {};
  let suprimentos = 0;
  let sangrias = 0;
  for (const m of movs ?? []) {
    const v = Number(m.valor);
    if (m.tipo === "venda") {
      const f = m.forma_pagamento || "Outros";
      vendasPorForma[f] = (vendasPorForma[f] || 0) + v;
    } else if (m.tipo === "suprimento") suprimentos += v;
    else if (m.tipo === "sangria") sangrias += v;
  }
  const saldoInicial = Number(caixa.saldo_inicial);
  const vendasDinheiro = vendasPorForma["Dinheiro"] || 0;
  const esperado = Math.round((saldoInicial + vendasDinheiro + suprimentos - sangrias) * 100) / 100;
  const contado = Math.round(dinheiroContado * 100) / 100;
  const quebra = Math.round((contado - esperado) * 100) / 100;
  const totalVendas = Object.values(vendasPorForma).reduce((s, v) => s + v, 0);

  const resumo = {
    saldoInicial,
    vendasPorForma,
    totalVendas: Math.round(totalVendas * 100) / 100,
    suprimentos: Math.round(suprimentos * 100) / 100,
    sangrias: Math.round(sangrias * 100) / 100,
  };

  await supabase
    .from("pdv_caixas")
    .update({
      status: "fechado",
      fechado_em: new Date().toISOString(),
      dinheiro_contado: contado,
      dinheiro_esperado: esperado,
      quebra,
      resumo,
      obs: obs || null,
    })
    .eq("id", caixaId);

  revalidatePath("/salao/caixa");
  return { ok: true as const, esperado, contado, quebra };
}
