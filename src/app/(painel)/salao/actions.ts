"use server";

import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "./util";
import { exigirAcesso } from "@/lib/permissoes-server";
import { sessaoGarcom } from "@/lib/garcom-auth";
import { dbGarcomOuUsuario } from "@/lib/garcom-auth";

// Só deixa mexer em comanda ABERTA (o caixa pode ter fechado enquanto a tela
// do garçom ainda estava aberta).
async function comandaAberta(supabase: Awaited<ReturnType<typeof createClient>>, comandaId: string) {
  const { data } = await supabase.from("pdv_comandas").select("status").eq("id", comandaId).maybeSingle();
  return data?.status === "aberta";
}


// Preço de venda: promoção ativa (promo_preco > 0) substitui o preço normal.
const precoVenda = (p: { preco?: number | null; promo_preco?: number | null } | null) => { const promo = Number(p?.promo_preco ?? 0); return promo > 0 ? promo : Number(p?.preco ?? 0); };
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
  // A chave desta tabela virou o par empresa + nome (migration 0192).
  const empresaIdCfg = await empresaAtualId();
  await supabase
    .from("pdv_config")
    .upsert(
      linhas.map((l) => ({ ...l, empresa_id: empresaIdCfg })),
      { onConflict: "empresa_id,chave" },
    );
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
    const promo = valorNum(formData.get("promo_preco"));
    extras.promo_preco = promo > 0 ? promo : null;
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

// Canais onde a categoria aparece (App/Garçom/PDV).
export async function salvarCanaisCategoria(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  if (!id) return;
  await supabase
    .from("pdv_categorias")
    .update({
      canal_app: formData.get("canal_app") === "on",
      canal_garcom: formData.get("canal_garcom") === "on",
      canal_pdv: formData.get("canal_pdv") === "on",
    })
    .eq("id", id);
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

// Botão LIVRE do quiosque touch: comanda de buffet livre direto, sem pesar.
export async function gerarComandaLivreKiosk() {
  const supabase = await createClient();
  const cfg = await pdvCfg(supabase);
  const { livre } = precoDoDia(cfg);
  if (!(livre > 0)) return { ok: false as const, mensagem: "Preço do buffet livre não está configurado hoje." };
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({ peso: 0, tara: 0, valor_buffet: livre, livre: true, mesa: "Balança" })
    .select("id, numero")
    .single();
  if (!com) return { ok: false as const, mensagem: "Não foi possível criar a comanda." };
  revalidatePath("/salao");
  return { ok: true as const, id: com.id as string, numero: com.numero as number, valor: livre };
}

// Leitor QR do quiosque: pessoa pesou antes e decidiu virar LIVRE — o valor da
// comanda é SUBSTITUÍDO pelo livre do dia (regra do Rafael).
export async function virarLivreKiosk(comandaId: string) {
  const supabase = await createClient();
  const cid = (comandaId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return { ok: false as const, mensagem: "QR inválido." };
  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("id, numero, status, valor_buffet, livre")
    .eq("id", cid)
    .maybeSingle();
  if (!com) return { ok: false as const, mensagem: "Comanda não encontrada." };
  if (com.status !== "aberta") return { ok: false as const, mensagem: `Comanda ${com.numero} já está fechada.` };
  if (com.livre) return { ok: false as const, mensagem: `Comanda ${com.numero} já é BUFFET LIVRE.` };
  const cfg = await pdvCfg(supabase);
  const { livre } = precoDoDia(cfg);
  if (!(livre > 0)) return { ok: false as const, mensagem: "Preço do buffet livre não está configurado hoje." };
  const { error } = await supabase
    .from("pdv_comandas")
    .update({ valor_buffet: livre, livre: true, so_kg: false })
    .eq("id", cid);
  if (error) return { ok: false as const, mensagem: `Não consegui alterar a comanda: ${error.message}` };
  revalidatePath("/salao");
  return {
    ok: true as const,
    id: com.id as string,
    numero: com.numero as number,
    valor: livre,
    antes: Math.round(Number(com.valor_buffet ?? 0) * 100) / 100,
  };
}

// Caixa / tela da comanda: comanda pesada vira BUFFET LIVRE (o valor do dia
// substitui o do peso). É o que faltava — sem isso o caixa pagava o valor do
// livre e EXCLUÍA a comanda pesada, e a nota fiscal ficava sem itens.
// "Conta pedida": a mesa já chamou pra fechar e ainda não pagou. É o terceiro
// estado do mapa do salão na tela inicial.
//
// O Rafael decidiu que marcam OS DOIS, garçom e caixa. Quando a tarefa é de
// todo mundo é fácil ninguém fazer e ninguém saber de onde veio, então
// guardamos o nome de quem marcou e mostramos na mesa.
export async function alternarContaPedida(comandaId: string) {
  // Os dois lados: o caixa entra logado, o garçom entra pelo link pessoal.
  await exigirAcesso(["/salao", "/garcom"]);
  const sessao = await sessaoGarcom();
  if (!sessao) return { ok: false as const, mensagem: "Faça login de novo." };
  const supabase = sessao.db;

  const { data: c } = await supabase
    .from("pdv_comandas")
    .select("id, status, conta_pedida_em")
    .eq("id", comandaId)
    .maybeSingle();
  if (!c) return { ok: false as const, mensagem: "Comanda não encontrada." };
  if (c.status !== "aberta") return { ok: false as const, mensagem: "Esta comanda já foi fechada." };

  const quem = (sessao.nome ?? "").split(" ")[0] || "equipe";
  const marcando = !c.conta_pedida_em;
  await supabase
    .from("pdv_comandas")
    .update({
      conta_pedida_em: marcando ? new Date().toISOString() : null,
      conta_pedida_por: marcando ? quem : null,
    })
    .eq("id", comandaId);

  revalidatePath("/salao");
  revalidatePath("/dashboard");
  revalidatePath("/garcom");
  revalidatePath(`/salao/comandas/${comandaId}`);
  return { ok: true as const, pedida: marcando };
}

export async function virarLivreComanda(comandaId: string) {
  await exigirAcesso("/salao");
  const r = await virarLivreKiosk(comandaId);
  if (r.ok) {
    revalidatePath("/salao/caixa");
    revalidatePath(`/salao/comandas/${comandaId}`);
  }
  return r;
}

// Mesmo que virarLivreKiosk, mas pelo NÚMERO da comanda (digitado no quiosque
// quando o QR não lê). Pega a comanda aberta mais recente com esse número.
export async function virarLivrePorNumeroKiosk(numero: number) {
  const supabase = await createClient();
  const n = Math.floor(Number(numero));
  if (!(n > 0)) return { ok: false as const, mensagem: "Número inválido." };
  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("id")
    .eq("numero", n)
    .eq("status", "aberta")
    .order("aberta_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!com) return { ok: false as const, mensagem: `Comanda ${n} não está aberta.` };
  return virarLivreKiosk(com.id as string);
}

// ---------- PESAR DE NOVO ----------
//
// A pessoa pesou, comeu e voltou ao buffet. Em vez de sair uma segunda
// comanda (que ela pagaria separada), o segundo prato ENTRA NA MESMA:
//
//   • as duas pesagens somam;
//   • se a soma passar do teto do dia, a comanda vira BUFFET LIVRE e o valor
//     é SUBSTITUÍDO pelo preço do livre — nunca a soma dos dois.
//
// É a mesma conta de uma pesagem só, feita sobre o peso somado. Quem come
// duas vezes nunca paga mais do que quem enche o prato uma vez.
//
// Não passa pelo agente do PC: só o sistema sabe o que já tem na comanda.
// Sem internet, esta operação recusa em vez de adivinhar.

/** Acha a comanda de balança pelo número OU pelo id do QR do cupom. */
export async function buscarComandaBalancaKiosk(alvo: string) {
  const supabase = await createClient();
  const txt = (alvo || "").trim();
  const uuid = txt.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const consulta = supabase
    .from("pdv_comandas")
    .select("id, numero, status, peso, tara, valor_buffet, livre, so_kg");

  const { data: com } = uuid
    ? await consulta.eq("id", uuid[1]).maybeSingle()
    : await consulta
        .eq("numero", Math.floor(Number(txt.replace(/\D/g, ""))) || -1)
        .eq("status", "aberta")
        .order("aberta_em", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!com) return { ok: false as const, mensagem: "Não achei essa comanda." };
  if (com.status !== "aberta") {
    return { ok: false as const, mensagem: `Comanda ${com.numero} já foi fechada.` };
  }
  return {
    ok: true as const,
    id: com.id as string,
    numero: Number(com.numero),
    peso: Number(com.peso ?? 0),
    valor: Number(com.valor_buffet ?? 0),
    livre: !!com.livre,
    soKg: !!com.so_kg,
  };
}

/** Soma uma segunda pesagem na comanda que já existe. */
export async function repesarKiosk(comandaId: string, liquidoNovo: number, taraBalanca = 0) {
  const supabase = await createClient();
  const cid = (comandaId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return { ok: false as const, mensagem: "Comanda inválida." };
  if (!(liquidoNovo > 0)) return { ok: false as const, mensagem: "Peso não veio da balança." };

  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("id, numero, status, peso, tara, valor_buffet, livre, so_kg")
    .eq("id", cid)
    .maybeSingle();
  if (!com) return { ok: false as const, mensagem: "Comanda não encontrada." };
  if (com.status !== "aberta") {
    return { ok: false as const, mensagem: `Comanda ${com.numero} já foi fechada.` };
  }
  // Já é livre: somar não muda nada — ela já paga o teto. Melhor dizer isso do
  // que registrar uma pesagem que não altera o valor.
  if (com.livre) {
    return { ok: false as const, mensagem: `Comanda ${com.numero} já é BUFFET LIVRE — pode servir à vontade.` };
  }

  const pesoAntes = Number(com.peso ?? 0);
  const valorAntes = Number(com.valor_buffet ?? 0);
  const soKg = !!com.so_kg; // marmita continua marmita: não ganha teto de livre
  const pesoTotal = Math.round((pesoAntes + liquidoNovo) * 1000) / 1000;

  const cfg = await pdvCfg(supabase);
  // `tara` aqui é só registro (o peso guardado já é o líquido), então a conta
  // vai sobre o total com tara zero, igual à primeira pesagem.
  const { valor, livre } = calcBuffet(cfg, pesoTotal, 0, soKg);

  const { error } = await supabase
    .from("pdv_comandas")
    .update({
      peso: pesoTotal,
      tara: Math.round((Number(com.tara ?? 0) + Math.max(0, taraBalanca)) * 1000) / 1000,
      valor_buffet: valor,
      livre,
    })
    .eq("id", cid);
  if (error) return { ok: false as const, mensagem: "Não consegui somar na comanda." };

  revalidatePath("/salao");
  return {
    ok: true as const,
    id: cid,
    numero: Number(com.numero),
    valor,
    livre,
    peso: pesoTotal,
    liquido: pesoTotal,
    antes: { peso: pesoAntes, valor: valorAntes },
    desta: Math.round(liquidoNovo * 1000) / 1000,
  };
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
  // O quiosque manda o peso LÍQUIDO já resolvido (o que a balança lê; marmita =
  // leitura + tara da balança). Nada de "tara padrão" aqui — tara é só registro.
  const tara = 0;
  const { valor, livre } = calcBuffet(cfg, peso, tara, soPorKg);
  const { data: com } = await supabase
    .from("pdv_comandas")
    .insert({
      peso,
      tara: Math.max(0, taraBalanca),
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
  await exigirAcesso("/salao");
  const id = formData.get("id") as string;
  const motivo = ((formData.get("motivo") as string) || "").trim();
  if (motivo.length < 3) return { ok: false as const, mensagem: "Informe o motivo (pelo menos 3 letras)." };

  // Comanda que já teve dinheiro recebido NÃO pode ser apagada: some o que o
  // caixa registrou, a nota fiscal fica sem itens e o dia não bate. Em 11/09
  // quatro comandas da balança foram pagas e excluídas em menos de um minuto
  // (a moça queria "virar livre") — o certo é o botão Buffet livre na comanda.
  const { data: recebidos } = await supabase
    .from("pdv_caixa_mov")
    .select("valor, forma_pagamento")
    .eq("comanda_id", id)
    .eq("tipo", "venda");
  const totalRecebido = (recebidos ?? []).reduce((s, m) => s + Number(m.valor), 0);
  if (totalRecebido > 0.005) {
    const formas = [...new Set((recebidos ?? []).map((m) => m.forma_pagamento).filter(Boolean))].join(", ");
    return {
      ok: false as const,
      mensagem:
        `Esta comanda já foi recebida no caixa (R$ ${totalRecebido.toFixed(2).replace(".", ",")} em ${formas || "pagamento"}) e não pode ser excluída. ` +
        "Se o cliente virou buffet livre, use o botão Buffet livre na comanda; se o recebimento foi errado, faça o estorno pelo caixa.",
    };
  }

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
  const supabase = await dbGarcomOuUsuario();
  if (!(await comandaAberta(supabase, comandaId))) return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa." };
  const { data: item } = await supabase
    .from("pdv_itens")
    .select("nome, preco, promo_preco")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false as const, mensagem: "Produto não encontrado." };
  const { error } = await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    item_id: itemId,
    descricao: item.nome,
    qtd: 1,
    preco_unit: precoVenda(item),
  });
  if (error) return { ok: false as const, mensagem: "Não consegui adicionar. Tente de novo." };
  revalidatePath(`/salao/comandas/${comandaId}`);
  return { ok: true as const };
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
  const supabase = await dbGarcomOuUsuario();
  if (!tamanhoId || saborIds.length === 0) return { ok: false as const, mensagem: "Escolha tamanho e sabor." };
  if (!(await comandaAberta(supabase, comandaId))) return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa." };

  const [{ data: tam }, { data: sabPrecos }, { data: sabores }] = await Promise.all([
    supabase.from("pdv_pizza_tamanhos").select("nome, max_sabores").eq("id", tamanhoId).single(),
    supabase
      .from("pdv_pizza_sabor_precos")
      .select("sabor_id, preco")
      .eq("tamanho_id", tamanhoId)
      .in("sabor_id", saborIds),
    supabase.from("pdv_pizza_sabores").select("id, nome").in("id", saborIds),
  ]);
  if (!tam) return { ok: false as const, mensagem: "Tamanho não encontrado." };

  const ids = saborIds.slice(0, tam.max_sabores);
  const precoDe = new Map((sabPrecos ?? []).map((p) => [p.sabor_id, Number(p.preco)]));
  const nomeDe = new Map((sabores ?? []).map((s) => [s.id, s.nome]));
  const usados = ids.filter((id) => precoDe.has(id));
  if (usados.length === 0) return { ok: false as const, mensagem: "Sabor sem preço para esse tamanho." };

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

  const { error } = await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    descricao,
    qtd: 1,
    preco_unit: preco,
  });
  if (error) return { ok: false as const, mensagem: "Não consegui adicionar a pizza. Tente de novo." };
  revalidatePath(`/salao/comandas/${comandaId}`);
  return { ok: true as const };
}

// Adiciona um item com complementos (marmita) à comanda.
// Preço = preço base do item + soma das opções escolhidas (tudo validado no servidor).
export async function adicionarComboComanda(
  comandaId: string,
  itemId: string,
  opcaoIds: string[],
) {
  const supabase = await dbGarcomOuUsuario();
  if (!(await comandaAberta(supabase, comandaId))) return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa." };
  const { data: item } = await supabase
    .from("pdv_itens")
    .select("nome, preco, promo_preco")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false as const, mensagem: "Produto não encontrado." };

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

  const preco = Math.round((precoVenda(item) + extra) * 100) / 100;
  // Cada opção numa linha (fica um embaixo do outro na tela e na impressão).
  const descricao = nomes.length
    ? `${item.nome}\n${nomes.map((n) => `- ${n}`).join("\n")}`
    : item.nome;

  const { error } = await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    item_id: itemId,
    descricao,
    qtd: 1,
    preco_unit: preco,
  });
  if (error) return { ok: false as const, mensagem: "Não consegui adicionar. Tente de novo." };
  revalidatePath(`/salao/comandas/${comandaId}`);
  return { ok: true as const };
}

export async function removerItemComanda(formData: FormData) {
  const supabase = await dbGarcomOuUsuario();
  await exigirAcesso(["/salao", "/garcom"]);
  const id = formData.get("id") as string;
  const comandaId = formData.get("comanda_id") as string;
  const { data: it } = await supabase
    .from("pdv_comanda_itens")
    .select("id, descricao, qtd, preco_unit, pago, comanda_id")
    .eq("id", id)
    .maybeSingle();
  // Item já pago (parcial ou total) não sai por aqui — o dinheiro já entrou.
  if (!it || it.pago) return;
  const { data: com } = await supabase.from("pdv_comandas").select("numero, mesa").eq("id", it.comanda_id as string).maybeSingle();
  const { data: userData } = await supabase.auth.getUser();
  // Fica no registro de cancelados (tela /salao/cancelados), como o cancelamento com motivo.
  await supabase.from("pdv_itens_cancelados").insert({
    comanda_numero: com?.numero ?? null,
    mesa: com?.mesa ?? null,
    descricao: (it.descricao as string) || null,
    qtd: Number(it.qtd),
    valor: Number(it.qtd) * Number(it.preco_unit),
    motivo: "Removido na comanda (×)",
    cancelado_por: userData.user?.id ?? null,
  });
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
  await exigirAcesso("/salao");
  const cfg = await pdvCfg(supabase);
  const fator = 1 + servicoAgora(cfg) / 100;
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };

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
        comanda_ids: [comandaId],
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
// O que a maquininha (TEF) devolveu pra um pagamento em cartão.
export type TefPagamento = {
  idAgente: string;
  terminal: string | null;
  nsu: string | null;
  nsuHost: string | null;
  autorizacao: string | null;
  rede: string | null;
  bandeira: string | null;
  produto: string | null;
  tipo: "credito" | "debito" | "voucher";
  parcelas: number;
  panMascarado: string | null;
  viaCliente: string[];
  viaLoja: string[];
  requerConfirmacao: boolean;
};

// "Vincular Cliente" do caixa: busca no servidor, poucas linhas por vez.
// Antes a tela baixava TODOS os clientes (3.2 mil) a cada carregamento e a
// cada atualização depois de receber — o caixa ficava travado esperando.
export async function buscarClientesCaixa(termo: string) {
  await exigirAcesso("/salao");
  const q = (termo || "").trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const soDigitos = q.replace(/\D/g, "");
  let busca = supabase
    .from("clientes")
    .select("id, nome, cpf_cnpj, limite_credito")
    .eq("ativo", true);
  busca = soDigitos.length >= 3
    ? busca.or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${soDigitos}%`)
    : busca.ilike("nome", `%${q}%`);
  const { data } = await busca.order("nome").limit(12);
  const achados = (data as { id: string; nome: string; cpf_cnpj: string | null; limite_credito: number | null }[]) ?? [];
  if (achados.length === 0) return [];
  // Saldo em aberto só dos que apareceram (pra avisar do limite no pagamento).
  const { data: mov } = await supabase
    .from("cliente_fiado")
    .select("cliente_id, tipo, valor")
    .in("cliente_id", achados.map((c) => c.id));
  const saldo = new Map<string, number>();
  for (const r of ((mov as { cliente_id: string; tipo: string; valor: number }[]) ?? [])) {
    const v = Number(r.valor) * (r.tipo === "debito" ? 1 : -1);
    saldo.set(r.cliente_id, Math.round(((saldo.get(r.cliente_id) ?? 0) + v) * 100) / 100);
  }
  return achados.map((c) => ({
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpf_cnpj,
    saldoFiado: saldo.get(c.id) ?? 0,
    limiteCredito: c.limite_credito == null ? null : Number(c.limite_credito),
  }));
}

export async function pagarSelecao(
  sel: { comandaId: string; itemIds: string[]; buffet: boolean }[],
  pagamentos: { forma: string; valor: number; bandeira?: string | null; observacao?: string | null; tef?: TefPagamento | null; colaboradorId?: string | null; colaboradorNome?: string | null }[],
  extras: { comandaId: string; itemId: string; qtd: number }[] = [],
  clienteId?: string | null,
) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  if (sel.length === 0 && extras.length === 0) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  const fator = 1 + servicoAgora(cfg) / 100;
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };

  // Produtos avulsos inseridos no caixa: cria o item na comanda já pago.
  for (const e of extras) {
    if (!(e.qtd > 0)) continue;
    const { data: prod } = await supabase
      .from("pdv_itens")
      .select("nome, preco, promo_preco")
      .eq("id", e.itemId)
      .single();
    if (!prod) continue;
    const payable = Math.round(precoVenda(prod) * e.qtd * fator * 100) / 100;
    await supabase.from("pdv_comanda_itens").insert({
      comanda_id: e.comandaId,
      item_id: e.itemId,
      descricao: prod.nome,
      qtd: e.qtd,
      preco_unit: precoVenda(prod),
      valor_pago: payable,
      pago: true,
    });
  }

  const numeros: number[] = [];
  // Conta o que de fato foi quitado agora. Linha já paga (outro caixa recebeu
  // antes, ou tela desatualizada) é pulada — senão o caixa lançaria a venda 2×.
  let quitadosAgora = 0;
  for (const s of sel) {
    for (const itemId of s.itemIds) {
      const { data: row } = await supabase
        .from("pdv_comanda_itens")
        .select("qtd, preco_unit, pago")
        .eq("id", itemId)
        .single();
      if (!row || row.pago) continue;
      const payable = Math.round(Number(row.qtd) * Number(row.preco_unit) * fator * 100) / 100;
      await supabase
        .from("pdv_comanda_itens")
        .update({ valor_pago: payable, pago: true })
        .eq("id", itemId);
      quitadosAgora++;
    }
    if (s.buffet) {
      const { data: c } = await supabase
        .from("pdv_comandas")
        .select("valor_buffet, buffet_pago")
        .eq("id", s.comandaId)
        .single();
      if (c && !c.buffet_pago) {
        const payable = Math.round(Number(c.valor_buffet ?? 0) * fator * 100) / 100;
        await supabase
          .from("pdv_comandas")
          .update({ buffet_valor_pago: payable, buffet_pago: true })
          .eq("id", s.comandaId);
        quitadosAgora++;
      }
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

  // "Compra da equipe": o consumo do funcionário vai pra conta dele em
  // Compras internas (/retiradas), pra descontar depois — igual ao que o caixa
  // lançaria à mão, só que já ligado às comandas.
  const daEquipe = pagamentos.filter((p) => /compra da equipe|funcion/i.test(p.forma) && p.valor > 0);
  if (daEquipe.length > 0) {
    const semPessoa = daEquipe.find((p) => !p.colaboradorId);
    if (semPessoa) return { ok: false as const, mensagem: "Escolha o funcionário pra lançar a compra da equipe." };
    const { data: userEq } = await supabase.auth.getUser();
    const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    for (const p of daEquipe) {
      const { data: colab } = await supabase.from("colaboradores").select("nome, ativo").eq("id", p.colaboradorId!).maybeSingle();
      if (!colab || !colab.ativo) return { ok: false as const, mensagem: "Funcionário não encontrado (ou desligado)." };
      await supabase.from("retiradas").insert({
        colaborador_id: p.colaboradorId,
        nome: colab.nome as string,
        item: `Consumo · comandas ${numeros.map((n) => `#${n}`).join(", ")}`,
        valor: p.valor,
        data: hojeBR,
        status: "aberto",
        observacao: (p.observacao || "").trim().slice(0, 200) || null,
        criado_por: userEq.user?.id ?? null,
      });
    }
    revalidatePath("/retiradas");
  }

  // "Saldo cliente" (fiado): a parte paga assim vai pra conta do cliente.
  const fiado = Math.round(pagamentos.filter((p) => p.forma === "Saldo cliente" && p.valor > 0).reduce((a, p) => a + p.valor, 0) * 100) / 100;
  if (fiado > 0) {
    if (!clienteId) return { ok: false as const, mensagem: "Pra receber como Saldo cliente, vincule o cliente antes." };
    // Limite de crédito do cliente (vazio = sem limite).
    const { data: cliLim } = await supabase.from("clientes").select("nome, limite_credito").eq("id", clienteId).maybeSingle();
    const limite = cliLim?.limite_credito == null ? null : Number(cliLim.limite_credito);
    if (limite != null && limite >= 0) {
      const { data: mov } = await supabase.from("cliente_fiado").select("tipo, valor").eq("cliente_id", clienteId);
      const saldo = ((mov as { tipo: string; valor: number }[]) ?? []).reduce(
        (a, r) => a + (r.tipo === "debito" ? Number(r.valor) : -Number(r.valor)), 0);
      const novo = Math.round((saldo + fiado) * 100) / 100;
      if (novo > limite + 0.005) {
        const brlS = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return {
          ok: false as const,
          mensagem: `${cliLim?.nome ?? "O cliente"} passaria do limite de crédito: já deve ${brlS(saldo)}, o limite é ${brlS(limite)} e esta conta levaria a ${brlS(novo)}. Receba de outra forma ou aumente o limite no cadastro do cliente.`,
        };
      }
    }
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("cliente_fiado").insert({
      cliente_id: clienteId,
      tipo: "debito",
      valor: fiado,
      descricao: `Comandas ${numeros.map((n) => `#${n}`).join(", ")}`,
      comanda_id: sel[0]?.comandaId ?? extras[0]?.comandaId ?? null,
      caixa_id: caixaId,
      criado_por: userData.user?.id ?? null,
    });
  }

  const totalPago =
    Math.round(pagamentos.reduce((a, p) => a + (p.valor > 0 ? p.valor : 0), 0) * 100) / 100;
  if (sel.length > 0 && quitadosAgora === 0 && extras.length === 0) {
    revalidatePath("/salao/caixa");
    return { ok: false as const, mensagem: "Essa conta já tinha sido recebida (outro caixa?). Nada foi lançado de novo — atualize a tela." };
  }
  const primeiraComanda = sel[0]?.comandaId ?? extras[0]?.comandaId;
  // Todas as comandas quitadas neste recebimento: o link "ver comanda" das
  // Movimentações abre uma por uma (antes só a primeira era guardada).
  const comandasDaVenda = [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])];
  // Pagamentos feitos no TEF: o caixa vai CONFIRMAR no pinpad com estes ids.
  const tefRegistros: { idAgente: string; transacaoId: string }[] = [];
  if (caixaId && primeiraComanda) {
    const desc = `Comandas ${numeros.map((n) => `#${n}`).join(", ")}`;
    const { data: quem } = await supabase.auth.getUser();
    for (const p of pagamentos) {
      if (!(p.valor > 0)) continue;
      const t = p.tef ?? null;
      const { data: mov } = await supabase
        .from("pdv_caixa_mov")
        .insert({
          caixa_id: caixaId,
          tipo: "venda",
          descricao: desc,
          forma_pagamento: p.forma,
          valor: p.valor,
          comanda_id: primeiraComanda,
          comanda_ids: comandasDaVenda,
          bandeira: ((t?.bandeira || p.bandeira) || "").trim().slice(0, 30) || null,
          observacao: (p.observacao || "").trim().slice(0, 200) || null,
          tef_nsu: t?.nsu ?? null,
          tef_autorizacao: t?.autorizacao ?? null,
          tef_rede: t?.rede ?? null,
          tef_terminal: t?.terminal ?? null,
        })
        .select("id")
        .maybeSingle();
      if (t) {
        const { data: tr } = await supabase
          .from("tef_transacoes")
          .insert({
            caixa_id: caixaId,
            comanda_ids: [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])],
            mov_id: (mov as { id?: string } | null)?.id ?? null,
            terminal: t.terminal,
            tipo: t.tipo,
            valor: p.valor,
            parcelas: Math.max(1, Number(t.parcelas) || 1),
            rede: t.rede,
            bandeira: t.bandeira,
            produto: t.produto,
            nsu: t.nsu,
            nsu_host: t.nsuHost,
            autorizacao: t.autorizacao,
            pan_mascarado: t.panMascarado,
            status: "aprovada",
            via_cliente: t.viaCliente ?? [],
            via_loja: t.viaLoja ?? [],
            id_agente: t.idAgente,
            criado_por: quem.user?.id ?? null,
          })
          .select("id")
          .maybeSingle();
        const transacaoId = (tr as { id?: string } | null)?.id;
        if (transacaoId) tefRegistros.push({ idAgente: t.idAgente, transacaoId });
      }
    }
  }

  // Nota automática: Pix, cartão e vale entram na FILA (o caixa tem alguns
  // minutos pra digitar o CPF ou mandar emitir na hora); o resto não gera nota
  // sozinho. Quem emite é a rotina em src/lib/fiscal/pendentes.ts.
  let pendenteId: string | null = null;
  try {
    const eletronico = pagamentos.some(
      (p) => p.valor > 0 && /pix|cart|créd|cred|déb|deb|vale/i.test(p.forma),
    );
    if (eletronico) {
      const { data: cfgN } = await supabase
        .from("config_fiscal")
        .select("chave, valor")
        .in("chave", ["nfce_auto", "nfce_auto_minutos", "emissor_ambiente"]);
      const cfgMap = Object.fromEntries(((cfgN as { chave: string; valor: string }[]) ?? []).map((r) => [r.chave, r.valor]));
      const ligado = cfgMap.nfce_auto === "1";
      const producao = (cfgMap.emissor_ambiente || "") === "producao";
      if (ligado && producao) {
        const minutos = Math.max(0, Math.min(60, Number(cfgMap.nfce_auto_minutos ?? 5) || 0));
        const comandasNota = [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])];
        if (comandasNota.length > 0) {
          const { data: pend } = await supabase.from("nfce_pendentes").insert({
            comanda_ids: comandasNota,
            numeros: numeros.map((n) => `#${n}`).join(", "),
            cliente_id: clienteId ?? null,
            valor: totalPago,
            formas: pagamentos.filter((p) => p.valor > 0).map((p) => p.forma).join(", "),
            caixa_id: caixaId,
            emitir_em: new Date(Date.now() + minutos * 60_000).toISOString(),
          }).select("id").maybeSingle();
          pendenteId = (pend as { id?: string } | null)?.id ?? null;
        }
      }
    }
  } catch {
    // Nota é acessório: se a fila falhar, o recebimento continua valendo.
  }

  revalidatePath("/salao/caixa");
  revalidatePath("/salao");
  return { ok: true as const, numeros, total: totalPago, pendenteId, tefRegistros };
}

// Depois que o pinpad confirmou (CNF) ou desfez (NCN), o registro do TEF
// reflete isso; confirmado → a via do cliente sai na impressora da nota.
export async function fecharTef(transacaoId: string, confirmada: boolean, motivo?: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  await supabase
    .from("tef_transacoes")
    .update({ status: confirmada ? "confirmada" : "desfeita", mensagem: motivo ?? null, atualizado_em: new Date().toISOString() })
    .eq("id", transacaoId);
  if (confirmada) {
    const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
    const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
    if (ids.length > 0) {
      await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "tef", ref_id: transacaoId, impressora_id })));
    }
  }
  return { ok: true as const };
}

// Cancelamento de uma venda no cartão (CNC já aprovado pelo pinpad): marca a
// transação original como cancelada, grava o estorno no caixa aberto (venda
// negativa na mesma forma, pra o fechamento e o Z baterem) e imprime a via.
export async function registrarCancelamentoTef(
  transacaoId: string,
  r: { nsu: string | null; autorizacao: string | null; rede: string | null; bandeira: string | null; viaCliente: string[]; viaLoja: string[]; idAgente: string | null; terminal: string | null },
) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: orig } = await supabase
    .from("tef_transacoes")
    .select("id, tipo, valor, parcelas, rede, bandeira, nsu, status, mov_id, comanda_ids, caixa_id, hostname")
    .eq("id", transacaoId)
    .maybeSingle();
  if (!orig) return { ok: false as const, mensagem: "Transação não encontrada." };
  if (orig.status !== "confirmada") return { ok: false as const, mensagem: "Só dá pra cancelar uma venda aprovada e confirmada." };

  // Transação SEM movimento no caixa é uma cobrança avulsa — hoje, o Pix de
  // teste da homologação. Ela não entrou no caixa, então o cancelamento
  // também não sai de lá: estornar o que nunca entrou deixaria o caixa
  // negativo em cima de dinheiro que não existiu.
  const veioDoCaixa = !!orig.mov_id;
  const caixaId = veioDoCaixa ? await caixaAberto(supabase) : null;
  if (veioDoCaixa && !caixaId) return { ok: false as const, mensagem: "Não tem caixa aberto pra lançar o estorno." };
  const { data: userData } = await supabase.auth.getUser();
  const agora = new Date().toISOString();

  // Forma de pagamento da venda original (pra o estorno cair na mesma).
  let forma = "Cartão";
  if (orig.mov_id) {
    const { data: mov } = await supabase.from("pdv_caixa_mov").select("forma_pagamento").eq("id", orig.mov_id as string).maybeSingle();
    forma = (mov?.forma_pagamento as string | null) || forma;
  } else {
    forma = orig.tipo === "debito" ? "Cartão de débito" : orig.tipo === "voucher" ? "Vale refeição" : "Cartão de crédito";
  }
  const estorno = veioDoCaixa
    ? (
        await supabase
          .from("pdv_caixa_mov")
          .insert({
            caixa_id: caixaId,
            tipo: "venda",
            descricao: `Cancelamento cartão NSU ${orig.nsu ?? "-"}`,
            forma_pagamento: forma,
            valor: -Number(orig.valor),
            tef_nsu: r.nsu, tef_autorizacao: r.autorizacao, tef_rede: r.rede ?? orig.rede, tef_terminal: r.terminal,
          })
          .select("id")
          .single()
      ).data
    : null;

  const { data: nova } = await supabase
    .from("tef_transacoes")
    .insert({
      caixa_id: caixaId,
      comanda_ids: orig.comanda_ids,
      mov_id: (estorno as { id?: string } | null)?.id ?? null,
      terminal: r.terminal, hostname: orig.hostname,
      tipo: orig.tipo, valor: orig.valor, parcelas: orig.parcelas,
      rede: r.rede ?? orig.rede, bandeira: r.bandeira ?? orig.bandeira,
      nsu: r.nsu, autorizacao: r.autorizacao,
      status: "cancelada",
      mensagem: `Cancelamento da venda NSU ${orig.nsu ?? "-"}`,
      via_cliente: r.viaCliente, via_loja: r.viaLoja, id_agente: r.idAgente,
      criado_por: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  await supabase
    .from("tef_transacoes")
    .update({ status: "cancelada", mensagem: `Cancelada em ${agora.slice(0, 16).replace("T", " ")} (NSU do cancelamento ${r.nsu ?? "-"})`, atualizado_em: agora })
    .eq("id", transacaoId);

  const novaId = (nova as { id?: string } | null)?.id;
  if (novaId && r.viaCliente.length > 0) await reimprimirTef(novaId);
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/tef");
  return { ok: true as const };
}

/**
 * Guarda um Pix cobrado direto no pinpad, pela tela Cartões (TEF).
 *
 * É uma cobrança AVULSA: não veio de comanda nem entra no caixa (o Pix do dia a
 * dia é o do Sicoob, sem taxa). Fica registrada por dois motivos: pra aparecer
 * na lista com o NSU, e — principalmente — pra poder ser CANCELADA, que é um
 * item do roteiro de homologação da Elgin.
 *
 * `mov_id` nulo é o que marca isso: o cancelamento olha pra ele e não mexe no
 * caixa.
 */
export async function registrarPixTeste(r: {
  valor: number;
  nsu: string | null;
  nsuHost: string | null;
  autorizacao: string | null;
  rede: string | null;
  bandeira: string | null;
  produto: string | null;
  viaCliente: string[];
  viaLoja: string[];
  idAgente: string | null;
  terminal: string | null;
}) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("tef_transacoes")
    .insert({
      mov_id: null,
      caixa_id: null,
      terminal: r.terminal,
      tipo: "pix",
      valor: r.valor,
      parcelas: 1,
      rede: r.rede,
      bandeira: r.bandeira,
      produto: r.produto,
      nsu: r.nsu,
      nsu_host: r.nsuHost,
      autorizacao: r.autorizacao,
      status: "confirmada",
      mensagem: "Pix cobrado pelo pinpad (fora do caixa)",
      via_cliente: r.viaCliente,
      via_loja: r.viaLoja,
      id_agente: r.idAgente,
      criado_por: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, mensagem: error.message };

  const id = (data as { id: string }).id;
  if (r.viaCliente.length > 0) await reimprimirTef(id);
  revalidatePath("/salao/caixa/tef");
  return { ok: true as const, id };
}

/**
 * Cartão CONFIRMADO no pinpad cuja venda NÃO foi gravada.
 *
 * Acontece na conta com dois cartões: o primeiro é confirmado (CNF) antes de
 * passar o segundo — o gerenciador exige — e depois a venda falha ou o caixa
 * tira o pagamento da conta. O dinheiro já foi cobrado e não dá mais pra
 * desfazer (NCN); só cancelar (CNC), que precisa do cartão de novo. Fica
 * registrado fora do caixa (mov_id nulo), como o Pix de teste, pra aparecer em
 * Cartões (TEF) e poder ser cancelado por lá.
 */
export async function registrarTefAvulso(
  t: {
    idAgente: string; terminal: string | null; nsu: string | null; nsuHost: string | null; autorizacao: string | null;
    rede: string | null; bandeira: string | null; produto: string | null; tipo: "credito" | "debito" | "voucher";
    parcelas: number; panMascarado: string | null; viaCliente: string[]; viaLoja: string[];
  },
  valor: number,
  motivo: string,
) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("tef_transacoes").insert({
    mov_id: null,
    caixa_id: null,
    terminal: t.terminal,
    tipo: t.tipo,
    valor,
    parcelas: Math.max(1, Number(t.parcelas) || 1),
    rede: t.rede,
    bandeira: t.bandeira,
    produto: t.produto,
    nsu: t.nsu,
    nsu_host: t.nsuHost,
    autorizacao: t.autorizacao,
    pan_mascarado: t.panMascarado,
    status: "confirmada",
    mensagem: `Cobrado no pinpad sem venda gravada (${motivo}) — cancelar aqui`,
    via_cliente: t.viaCliente ?? [],
    via_loja: t.viaLoja ?? [],
    id_agente: t.idAgente,
    criado_por: userData.user?.id ?? null,
  });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa/tef");
  return { ok: true as const };
}

// Reimprime a via do cliente de um cartão já passado.
export async function reimprimirTef(transacaoId: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
  if (ids.length === 0) return { ok: false as const, mensagem: "Nenhuma impressora marcada pra NFC-e na Central de Impressões." };
  const { error } = await supabase.from("impressao_fila").insert(ids.map((impressora_id) => ({ tipo: "tef", ref_id: transacaoId, impressora_id })));
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const };
}

// Cliente veio acertar o fiado: registra o pagamento e entra no caixa do dia
// com a forma usada (a venda em si já foi contada como "Saldo cliente").
export async function receberFiado(clienteId: string, valor: number, forma: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const v = Math.round(Number(valor) * 100) / 100;
  if (!clienteId || !(v > 0)) return { ok: false as const, mensagem: "Valor inválido." };
  if (!forma || forma === "Saldo cliente") return { ok: false as const, mensagem: "Escolha a forma de pagamento." };
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };
  const { data: cli } = await supabase.from("clientes").select("nome").eq("id", clienteId).maybeSingle();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("cliente_fiado").insert({
    cliente_id: clienteId,
    tipo: "pagamento",
    valor: v,
    descricao: "Acerto do fiado",
    forma_pagamento: forma,
    caixa_id: caixaId,
    criado_por: userData.user?.id ?? null,
  });
  if (error) return { ok: false as const, mensagem: error.message };
  await supabase.from("pdv_caixa_mov").insert({
    caixa_id: caixaId,
    tipo: "venda",
    descricao: `Fiado — ${(cli as { nome?: string } | null)?.nome ?? "cliente"}`,
    forma_pagamento: forma,
    valor: v,
    comanda_id: null,
  });
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/fiado");
  return { ok: true as const };
}

// Frente de caixa: recebe VÁRIAS comandas de uma vez (somadas), com uma ou mais
// formas de pagamento (split). Cobra só o que falta, marca tudo pago e fecha.
export async function receberComandas(
  comandaIds: string[],
  pagamentos: { forma: string; valor: number }[],
) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  if (comandaIds.length === 0) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };

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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const jaAberto = await caixaAberto(supabase);
  if (jaAberto) redirect("/salao/caixa");
  const nome = ((formData.get("nome") as string) || "Caixa").trim();
  const saldo_inicial = valorNum(formData.get("saldo_inicial"));
  await supabase.from("pdv_caixas").insert({ nome, saldo_inicial });
  // Numeração do salão/balcão reinicia do 1 a cada caixa (a balança reinicia
  // sozinha pelo agente, a partir do número inicial configurado).
  await supabase.rpc("pdv_reiniciar_numeracao");
  revalidatePath("/salao/caixa");
  redirect("/salao/caixa");
}

export async function suprimento(formData: FormData) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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

  // Quem fechou (sai no cupom).
  const { data: authZ } = await supabase.auth.getUser();
  let operador: string | null = null;
  if (authZ.user?.id) {
    const { data: perf } = await supabase.from("profiles").select("nome").eq("id", authZ.user.id).maybeSingle();
    operador = (perf?.nome as string) || authZ.user.email || null;
  }
  const resumo = {
    saldoInicial,
    vendasPorForma,
    totalVendas: Math.round(totalVendas * 100) / 100,
    suprimentos: Math.round(suprimentos * 100) / 100,
    sangrias: Math.round(sangrias * 100) / 100,
    operador,
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

  // Cupom do fechamento direto na impressora da NFC-e (Central de Impressões),
  // sem abrir a janela de impressão do navegador.
  let impressoras = 0;
  const { data: impsZ } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const idsZ = ((impsZ as { id: string }[]) ?? []).map((i) => i.id);
  if (idsZ.length > 0) {
    const { error: errZ } = await supabase
      .from("impressao_fila")
      .insert(idsZ.map((impressora_id) => ({ tipo: "fechamento", ref_id: caixaId, impressora_id })));
    if (!errZ) impressoras = idsZ.length;
  }

  revalidatePath("/salao/caixa");
  return { ok: true as const, esperado, contado, quebra, impressoras };
}

// Reimprime o cupom de um caixa já fechado (botão "imprimir de novo").
export async function reimprimirFechamento(caixaId: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: imps } = await supabase.from("impressoras").select("id").eq("ativo", true).eq("recebe_nfce", true);
  const ids = ((imps as { id: string }[]) ?? []).map((i) => i.id);
  if (ids.length === 0) {
    return { ok: false as const, mensagem: "Nenhuma impressora marcada pra NFC-e na Central de Impressões." };
  }
  const { error } = await supabase
    .from("impressao_fila")
    .insert(ids.map((impressora_id) => ({ tipo: "fechamento", ref_id: caixaId, impressora_id })));
  if (error) return { ok: false as const, mensagem: error.message };
  return { ok: true as const, total: ids.length };
}

// Caixa: divide UM item em N partes iguais (viram N linhas na comanda, cada
// uma com qtd/N e o mesmo preço) — assim duas pessoas pagam metade cada uma
// pelo fluxo normal do caixa. Só item ainda não pago (nem em parte).
export async function dividirItemCaixa(itemId: string, partes: number) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  const n = Math.floor(Number(partes));
  if (!(n >= 2 && n <= 10)) return { ok: false as const, mensagem: "Divida em 2 a 10 partes." };
  const { data: it } = await supabase
    .from("pdv_comanda_itens")
    .select("id, comanda_id, item_id, descricao, qtd, preco_unit, pago, valor_pago, lancamento_id, criado_por, criado_colab_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!it) return { ok: false as const, mensagem: "Esse item já não está mais na comanda." };
  if (it.pago || Number(it.valor_pago ?? 0) > 0.005) return { ok: false as const, mensagem: "Esse item já foi recebido (inteiro ou em parte) e não pode ser dividido." };
  const qtdParte = Math.round((Number(it.qtd) / n) * 1000) / 1000;
  const base = String(it.descricao).replace(/\s*\(\d+\/\d+\)$/, "");
  const { error: e1 } = await supabase
    .from("pdv_comanda_itens")
    .update({ qtd: qtdParte, descricao: `${base} (1/${n})` })
    .eq("id", itemId);
  if (e1) return { ok: false as const, mensagem: e1.message };
  const copias = [];
  for (let i = 2; i <= n; i++) {
    copias.push({
      comanda_id: it.comanda_id, item_id: it.item_id, descricao: `${base} (${i}/${n})`, qtd: qtdParte, preco_unit: it.preco_unit,
      lancamento_id: it.lancamento_id, criado_por: it.criado_por, criado_colab_id: it.criado_colab_id, pago: false, valor_pago: 0,
    });
  }
  const { error: e2 } = await supabase.from("pdv_comanda_itens").insert(copias);
  if (e2) return { ok: false as const, mensagem: e2.message };
  revalidatePath("/salao/caixa");
  revalidatePath(`/salao/comandas/${it.comanda_id}`);
  revalidatePath(`/garcom/comanda/${it.comanda_id}`);
  return { ok: true as const };
}

// Caixa: tira um item da comanda ali mesmo, depois de ler o cupom, pedindo o
// motivo (mesmo esquema da exclusão de comanda). Item já pago (inteiro ou
// parcial) não sai — o dinheiro já entrou. Fica no registro de cancelados.
export async function removerItemCaixa(itemId: string, motivo: string) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  const mot = (motivo || "").trim();
  if (mot.length < 3) return { ok: false as const, mensagem: "Informe o motivo (pelo menos 3 letras)." };
  const { data: it } = await supabase
    .from("pdv_comanda_itens")
    .select("id, descricao, qtd, preco_unit, pago, valor_pago, comanda_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!it) return { ok: false as const, mensagem: "Esse item já não está mais na comanda." };
  if (it.pago || Number(it.valor_pago ?? 0) > 0.005) {
    return { ok: false as const, mensagem: "Esse item já foi recebido (inteiro ou em parte) e não pode ser excluído. Se o recebimento foi errado, faça o estorno pelo caixa." };
  }
  const { data: com } = await supabase.from("pdv_comandas").select("numero, mesa").eq("id", it.comanda_id as string).maybeSingle();
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("pdv_itens_cancelados").insert({
    comanda_numero: com?.numero ?? null,
    mesa: com?.mesa ?? null,
    descricao: (it.descricao as string) || null,
    qtd: Number(it.qtd),
    valor: Number(it.qtd) * Number(it.preco_unit),
    motivo: `Excluído no caixa: ${mot}`,
    cancelado_por: userData.user?.id ?? null,
  });
  const { error } = await supabase.from("pdv_comanda_itens").delete().eq("id", itemId);
  if (error) return { ok: false as const, mensagem: "Não consegui excluir. Tente de novo." };
  revalidatePath("/salao/caixa");
  revalidatePath(`/salao/comandas/${it.comanda_id}`);
  revalidatePath(`/garcom/comanda/${it.comanda_id}`);
  return { ok: true as const };
}
