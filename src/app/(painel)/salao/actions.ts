"use server";

import { revalidatePath } from "next/cache";
import { empresaAtualId } from "@/lib/empresa";
import { registrarErro } from "@/lib/saude";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "./util";
import { aplicarParte, faltasDaComanda, r2, servicoCobrado } from "@/lib/comanda-parte";
import { exigirAcesso } from "@/lib/permissoes-server";
import { conferirFormasEspeciais, lancarFormasEspeciais } from "@/lib/pagamento-especial";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { sessaoGarcom } from "@/lib/garcom-auth";
import { dbGarcomOuUsuario } from "@/lib/garcom-auth";
import { fecharTefNoBanco, PREFIXO_SEM_CONTA, transacaoSemConta } from "@/lib/tef-venda-server";
import { codigoDaForma, naoEntraNoCaixa, tipoDe, tipoDoMovimento } from "@/lib/formas-pagamento";
import { reimprimirNaCozinha, resolverCombo } from "@/lib/delivery-core";
import { debitarVale, estornarBaixas, ligarBaixaAoMov, obsDaBaixa, type BaixaVale } from "@/lib/vale-presente-server";
import { nomesDosSabores } from "@/lib/pizza-sabores";
import { fmtKg } from "@/lib/peso-kg";
import { aplicarJuntar, buffetJuntado, lerParaJuntar, podeSomar, type ModoJuntar, type PrecoBuffet } from "@/lib/juntar-comandas";
import { contagemValida, valorDe, type Quantidades } from "@/lib/cofre";
import { repartirDesconto } from "@/lib/fiscal/desconto-nota";

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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const supabase = await createClient();
  await garantirCategoria(supabase, (formData.get("nome") as string) || "");
  revalidatePath("/salao/cardapio");
}

export async function toggleCategoria(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const disponivel = formData.get("disponivel") === "1";
  await supabase.from("pdv_categorias").update({ disponivel }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

export async function moverCategoria(formData: FormData) {
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const supabase = await createClient();
  await supabase.from("pdv_categorias").delete().eq("id", formData.get("id") as string);
  revalidatePath("/salao/cardapio");
}

// ---------- Itens do cardápio ----------
export async function salvarItem(formData: FormData) {
  await exigirAcesso("/salao");
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
    extras.por_kg = formData.get("por_kg") === "on"; // migration 0259
  }

  if (id)
    await supabase.from("pdv_itens").update({ nome, categoria, preco, ...extras }).eq("id", id);
  else await supabase.from("pdv_itens").insert({ nome, categoria, preco, ...extras });
  revalidatePath("/salao/cardapio");
}

// Horários de disponibilidade (app do cliente) por categoria ou item.
export async function salvarHorarios(formData: FormData) {
  await exigirAcesso("/salao");
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

// Horário e disponível das pizzas no app do cliente (pdv_config, src/lib/pizzas-horario.ts).
export async function salvarPizzasDisponibilidade(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  if (!empresaId) return;
  const raw = String(formData.get("horarios") ?? "").trim();
  let horarios = "";
  if (raw) {
    try {
      const p = JSON.parse(raw) as { dias?: number[]; turnos?: { ini: string; fim: string }[] };
      const dias = (Array.isArray(p.dias) ? p.dias : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const turnos = (Array.isArray(p.turnos) ? p.turnos : []).filter((t) => /^\d{2}:\d{2}$/.test(t?.ini ?? "") && /^\d{2}:\d{2}$/.test(t?.fim ?? "")).slice(0, 4);
      horarios = dias.length === 0 && turnos.length === 0 ? "" : JSON.stringify({ dias, turnos });
    } catch { horarios = ""; }
  }
  await supabase.from("pdv_config").upsert([
    { empresa_id: empresaId, chave: "pizzas_horarios", valor: horarios },
    { empresa_id: empresaId, chave: "pizzas_disponivel", valor: formData.get("disponivel") === "on" ? "1" : "0" },
  ], { onConflict: "empresa_id,chave" });
  revalidatePath("/salao/cardapio");
  revalidatePath("/pedir");
}

// Canais onde a categoria aparece (App/Garçom/PDV).
export async function salvarCanaisCategoria(formData: FormData) {
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const disponivel = formData.get("disponivel") === "1";
  await supabase.from("pdv_itens").update({ disponivel }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Liga/desliga um CANAL do item direto na listagem do cardápio (pedido do
// Rafael, 03/10/2026: "sem ter que entrar no Editar"). "app" é a coluna
// `delivery` (nome antigo da flag do app do cliente).
export async function toggleCanalItem(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const canal = formData.get("canal") as string;
  const ligado = formData.get("ligado") === "1";
  const coluna = canal === "app" ? "delivery" : canal === "garcom" ? "canal_garcom" : canal === "pdv" ? "canal_pdv" : null;
  if (!id || !coluna) return;
  await supabase.from("pdv_itens").update({ [coluna]: ligado }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Liga/desliga uma opção de complemento (adicional)
export async function toggleOpcaoComplemento(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const itemId = formData.get("item_id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("pdv_item_opcoes").update({ ativo }).eq("id", id);
  revalidatePath(`/salao/cardapio/adicionais/${itemId}`);
}

// Edita o preço de uma opção de complemento
export async function editarPrecoOpcao(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const itemId = formData.get("item_id") as string;
  const preco = valorNum(formData.get("preco"));
  await supabase.from("pdv_item_opcoes").update({ preco }).eq("id", id);
  revalidatePath(`/salao/cardapio/adicionais/${itemId}`);
}

export async function toggleItem(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("pdv_itens").update({ ativo }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

export async function excluirItem(formData: FormData) {
  await exigirAcesso("/salao");
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
// Teto de uma pesagem do buffet (SEC-11): nenhum prato passa disso, e barra
// número absurdo mandado direto pro servidor.
const PESO_MAX_KG = 8;

function calcBuffet(
  cfg: Record<string, string>,
  peso: number,
  tara: number,
  soPorKg = false,
) {
  const liquido = Math.max(0, (Number(peso) || 0) - (Number(tara) || 0));
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
  await exigirAcesso("/salao");
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
// "A balança está tarada com o prato" do quiosque, guardado no sistema (27/10/2026):
// só no navegador, o PC perdeu a marca e o quiosque parou de pesar sozinho.
export async function salvarBalancaTaradaKiosk(tarada: boolean) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const empresaId = await empresaAtualId();
  const { error } = await supabase.from("pdv_config")
    .upsert({ empresa_id: empresaId, chave: "balanca_tarada", valor: tarada ? "1" : "0" }, { onConflict: "empresa_id,chave" });
  return { ok: !error };
}

export async function virarLivreKiosk(comandaId: string) {
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const cid = (comandaId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return { ok: false as const, mensagem: "Comanda inválida." };
  if (!(liquidoNovo > 0)) return { ok: false as const, mensagem: "Peso não veio da balança." };
  if (liquidoNovo > PESO_MAX_KG) return { ok: false as const, mensagem: `Peso fora do normal (${liquidoNovo} kg). Tire o prato e pese de novo.` };

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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
  const supabase = await createClient();
  if (!(peso > 0) || peso > PESO_MAX_KG) return { ok: false as const, mensagem: `Peso fora do normal (${peso} kg). Tire o prato e pese de novo.` };
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  await exigirAcesso("/salao");
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
  const id = String(formData.get("id") ?? "");
  // O id entra num filtro .or(): só aceita uuid (vírgula/parêntese mudariam o filtro).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false as const, mensagem: "Comanda inválida." };
  const motivo = ((formData.get("motivo") as string) || "").trim();
  if (motivo.length < 3) return { ok: false as const, mensagem: "Informe o motivo (pelo menos 3 letras)." };

  // Comanda que já teve dinheiro recebido NÃO pode ser apagada: some o que o
  // caixa registrou, a nota fiscal fica sem itens e o dia não bate. Em 11/09
  // quatro comandas da balança foram pagas e excluídas em menos de um minuto
  // (a moça queria "virar livre") — o certo é o botão Buffet livre na comanda.
  // Num recebimento de várias comandas, `comanda_id` guarda só a primeira; as
  // outras estão em `comanda_ids`. Olhar só a primeira deixava excluir as outras
  // já pagas (CX-01: 4 casos de 07 a 22/10).
  const { data: recebidos, error: errRecebidos } = await supabase
    .from("pdv_caixa_mov")
    .select("valor, forma_pagamento")
    .or(`comanda_id.eq.${id},comanda_ids.cs.{${id}}`)
    .eq("tipo", "venda");
  if (errRecebidos) return { ok: false as const, mensagem: "Não consegui conferir os pagamentos da comanda. Tente de novo." };
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

  const { data: com } = await supabase
    .from("pdv_comandas")
    .select("numero, mesa, valor_buffet, buffet_pago, buffet_base_pago")
    .eq("id", id)
    .maybeSingle();
  const { data: itc } = await supabase
    .from("pdv_comanda_itens")
    .select("qtd, preco_unit, pago, base_pago")
    .eq("comanda_id", id);
  // Parte já paga (item, buffet ou "Pagar parte") também trava: o dinheiro está no caixa.
  const temPago =
    !!com?.buffet_pago || Number(com?.buffet_base_pago ?? 0) > 0.005 ||
    (itc ?? []).some((i) => i.pago || Number(i.base_pago ?? 0) > 0.005);
  if (temPago) {
    return {
      ok: false as const,
      mensagem: "Esta comanda tem parte já paga no caixa e não pode ser excluída. Se o cliente virou buffet livre, use o botão Buffet livre na comanda; se o recebimento foi errado, fale com a gerência.",
    };
  }
  const valor =
    Number(com?.valor_buffet ?? 0) +
    (itc ?? []).reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  // Apaga primeiro e só registra no log se apagou (antes o log contava como
  // excluída uma comanda que o banco recusou apagar).
  const { data: apagou, error: errApagar } = await supabase.from("pdv_comandas").delete().eq("id", id).select("id");
  if (errApagar || !apagou?.length) return { ok: false as const, mensagem: "Não consegui excluir a comanda. Nada foi apagado; tente de novo." };
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("pdv_comandas_excluidas").insert({
    comanda_numero: com?.numero ?? null,
    mesa: com?.mesa ?? null,
    valor,
    motivo,
    excluido_por: userData.user?.id ?? null,
  });
  revalidatePath("/salao");
  redirect("/salao");
}

// Junta as comandas da mesma pessoa no caixa: fica a de menor número. A regra e a
// ordem de gravação moram em src/lib/juntar-comandas.ts.
function precoParaJuntar(cfg: Record<string, string>): PrecoBuffet {
  return { livreHoje: precoDoDia(cfg).livre, calcular: (peso, soKg) => calcBuffet(cfg, peso, 0, soKg) };
}

/** O que o caixa vê antes de escolher: as comandas e quanto dá cada opção. */
export async function previaJuntarComandas(ids: string[]) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const r = await lerParaJuntar(supabase, ids);
  if (!r.ok) return r;
  const preco = precoParaJuntar(await pdvCfg(supabase));
  const somar = podeSomar(r.comandas) ? buffetJuntado(r.comandas, { tipo: "somar" }, preco) : null;
  return {
    ok: true as const,
    comandas: r.comandas.map((c) => ({ id: c.id, numero: c.numero, peso: c.peso, valor: c.valor, livre: c.livre })),
    livreHoje: preco.livreHoje,
    somar: somar?.ok ? { valor: somar.campos.valor_buffet, peso: somar.campos.peso, livre: somar.campos.livre } : null,
  };
}

export async function juntarComandasCaixa(ids: string[], modo: ModoJuntar) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const lidas = await lerParaJuntar(supabase, ids);
  if (!lidas.ok) return lidas;
  const preco = precoParaJuntar(await pdvCfg(supabase));
  const { data: userData } = await supabase.auth.getUser();
  const r = await aplicarJuntar(supabase, lidas.comandas, modo, preco, userData.user?.id ?? null);
  revalidatePath("/salao");
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/cancelados");
  return r;
}

// pesoKg: item vendido por kg (migration 0259) — a quantidade é o peso.
export async function adicionarItemComanda(comandaId: string, itemId: string, pesoKg?: number) {
  await exigirAcesso(["/salao", "/garcom"]);
  const supabase = await dbGarcomOuUsuario();
  if (!(await comandaAberta(supabase, comandaId))) return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa." };
  const { data: item } = await supabase
    .from("pdv_itens")
    .select("nome, preco, promo_preco, por_kg")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false as const, mensagem: "Produto não encontrado." };
  const kg = item.por_kg ? Math.round(Math.min(20, Math.max(0, Number(pesoKg) || 0)) * 1000) / 1000 : 0;
  if (item.por_kg && kg <= 0) return { ok: false as const, mensagem: "Digite o peso (ex.: 0,452)." };
  const { error } = await supabase.from("pdv_comanda_itens").insert({
    comanda_id: comandaId,
    item_id: itemId,
    descricao: item.por_kg ? `${item.nome} (${fmtKg(kg)})` : item.nome,
    qtd: item.por_kg ? kg : 1,
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
  await exigirAcesso(["/salao", "/garcom"]);
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
  const nomes = nomesDosSabores(usados, (id) => nomeDe.get(id) || "?");
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
  await exigirAcesso(["/salao", "/garcom"]);
  const supabase = await dbGarcomOuUsuario();
  if (!(await comandaAberta(supabase, comandaId))) return { ok: false as const, mensagem: "Essa comanda já foi fechada no caixa." };
  // Mesma conta do delivery/garçom (etapas, média da pizza, mínimo/máximo).
  const linha = await resolverCombo(supabase, itemId, opcaoIds);
  if (!linha) return { ok: false as const, mensagem: "Confira as escolhas desse produto." };
  const { descricao, preco } = linha;

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
  // Era o que faltava de uma comanda já paga em parte: fecha.
  if (await fecharSeJaRecebeu(supabase, it.comanda_id as string)) revalidatePath("/salao");
  revalidatePath(`/salao/comandas/${comandaId}`);
  revalidatePath(`/garcom/comanda/${comandaId}`);
}

// Exclui o buffet que sobrou em aberto na comanda. Na 334 de 05/11 o caixa cobrou
// o produto "Buffet Livre" no lugar dele e a comanda ficou aberta, sem ter como
// tirar. Buffet com pagamento não sai por aqui; o motivo fica em Cancelados.
export async function removerBuffetComanda(comandaId: string, motivo: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const texto = (motivo ?? "").trim();
  if (texto.length < 3) return { ok: false as const, mensagem: "Informe o motivo (pelo menos 3 letras)." };

  const { data: c } = await supabase
    .from("pdv_comandas")
    .select("numero, mesa, status, peso, valor_buffet, livre, buffet_pago, buffet_valor_pago, buffet_base_pago")
    .eq("id", comandaId)
    .maybeSingle();
  if (!c || c.status !== "aberta") return { ok: false as const, mensagem: "Esta comanda não está mais aberta. Atualize a tela." };
  const valor = Number(c.valor_buffet ?? 0);
  if (!(valor > 0)) return { ok: false as const, mensagem: "Esta comanda não tem buffet para excluir. Atualize a tela." };
  const semPagamento = !c.buffet_pago && Number(c.buffet_valor_pago ?? 0) <= 0.005 && Number(c.buffet_base_pago ?? 0) <= 0.005;
  if (!semPagamento) return { ok: false as const, mensagem: "Este buffet já recebeu pagamento e não pode ser excluído. Se o recebimento foi errado, faça o estorno pelo caixa." };

  // Só muda se ninguém pagou o buffet nesse meio-tempo (outro caixa).
  const { data: mudou } = await supabase
    .from("pdv_comandas")
    .update({ peso: 0, tara: 0, valor_buffet: 0, livre: false })
    .eq("id", comandaId)
    .eq("status", "aberta")
    .eq("buffet_pago", false)
    .or("buffet_valor_pago.is.null,buffet_valor_pago.eq.0")
    .select("id");
  if (!mudou?.length) return { ok: false as const, mensagem: "O buffet não foi excluído: a comanda mudou agora há pouco. Atualize a tela e confira." };

  const peso = Number(c.peso ?? 0);
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("pdv_itens_cancelados").insert({
    comanda_numero: c.numero,
    mesa: c.mesa ?? null,
    descricao: `Buffet${c.livre ? " livre" : ""}${peso > 0 ? ` (${peso.toFixed(3).replace(".", ",")} kg)` : ""}`,
    qtd: 1,
    valor,
    motivo: texto.slice(0, 200),
    cancelado_por: userData.user?.id ?? null,
  });

  // Era o que faltava de uma comanda já paga: fecha.
  await fecharSeJaRecebeu(supabase, comandaId);
  revalidatePath("/salao");
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/cancelados");
  revalidatePath(`/salao/comandas/${comandaId}`);
  return { ok: true as const };
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
) {
  const [{ data: itens }, { data: c2 }] = await Promise.all([
    supabase.from("pdv_comanda_itens").select("id, pago, qtd, preco_unit").eq("comanda_id", comandaId),
    supabase.from("pdv_comandas").select("valor_buffet, buffet_pago").eq("id", comandaId).single(),
  ]);
  const temBuffet = Number(c2?.valor_buffet ?? 0) > 0;
  // Item de preço zero (refri do rodízio) nunca aparece pra pagar: não pode
  // segurar a comanda aberta (16/10/2026 três comandas pagas ficaram abertas).
  const gratis = (i: { qtd: number; preco_unit: number }) => Math.abs(Number(i.qtd) * Number(i.preco_unit)) < 0.005;
  const quitou = (itens ?? []).every((i) => i.pago || gratis(i)) && (!temBuffet || !!c2?.buffet_pago);
  if (quitou) {
    const zerados = (itens ?? []).filter((i) => !i.pago && gratis(i)).map((i) => i.id as string);
    if (zerados.length) await supabase.from("pdv_comanda_itens").update({ pago: true }).in("id", zerados);
    const servico = await servicoCobrado(supabase, comandaId);
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

// Fora do pagamento (item excluído, botão "Fechar comanda"): fecha a comanda
// aberta que já recebeu alguma coisa e não tem mais nada a pagar. Comanda que
// nunca recebeu fica aberta mesmo vazia. Em 31/10 a 171 ficou aberta com tudo
// pago: a metade que faltava foi excluída no caixa depois do pagamento.
async function fecharSeJaRecebeu(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comandaId: string,
) {
  const [{ data: com }, { data: pagos }] = await Promise.all([
    supabase.from("pdv_comandas").select("status, buffet_pago, buffet_valor_pago").eq("id", comandaId).maybeSingle(),
    supabase.from("pdv_comanda_itens").select("id").eq("comanda_id", comandaId).or("pago.eq.true,valor_pago.gt.0").limit(1),
  ]);
  if (com?.status !== "aberta") return false;
  const recebeu = (pagos ?? []).length > 0 || !!com.buffet_pago || Number(com.buffet_valor_pago ?? 0) > 0.005;
  if (!recebeu) return false;
  return fecharSeQuitou(supabase, comandaId);
}

// "Fechar comanda" na tela da comanda: só quando já está toda paga.
export async function fecharComandaPaga(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const id = formData.get("id") as string;
  if (!id) return;
  await fecharSeJaRecebeu(supabase, id);
  revalidatePath("/salao");
  revalidatePath("/salao/caixa");
  revalidatePath(`/salao/comandas/${id}`);
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

  const quitou = await fecharSeQuitou(supabase, comandaId);
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
  tipo: "credito" | "debito" | "voucher" | "pix";
  parcelas: number;
  panMascarado: string | null;
  viaCliente: string[];
  viaLoja: string[];
  requerConfirmacao: boolean;
  /** Veio de "Recebido sem conta": a linha de tef_transacoes que esta venda liga. */
  semContaId?: string | null;
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
  pagamentos: { forma: string; valor: number; bandeira?: string | null; observacao?: string | null; tef?: TefPagamento | null; colaboradorId?: string | null; colaboradorNome?: string | null; valeCodigo?: string | null }[],
  extras: { comandaId: string; itemId: string; qtd: number }[] = [],
  clienteId?: string | null,
  /** Cliente não quis pagar os 10%: este pagamento sai sem serviço. */
  cobrarServico = true,
  /** "Pagar parte": dinheiro (já com ou sem os 10%) que cobre um pedaço da comanda. */
  partes: { comandaId: string; valor: number }[] = [],
  /** Desconto deste recebimento, sem os 10% (digitado + 5% do dinheiro): sai na NFC-e. */
  desconto = 0,
) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  partes = partes.filter((p) => p.comandaId && p.valor > 0);
  // Comanda paga em parte entra na lista como as outras (número, nota, cliente…).
  sel = [...sel, ...partes.filter((p) => !sel.some((s) => s.comandaId === p.comandaId)).map((p) => ({ comandaId: p.comandaId, itemIds: [], buffet: false }))];
  if (sel.length === 0 && extras.length === 0) return { ok: false as const };
  const cfg = await pdvCfg(supabase);
  const fator = 1 + (cobrarServico ? servicoAgora(cfg) : 0) / 100;
  const caixaId = await caixaAberto(supabase);
  if (!caixaId) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };
  // A parte não pode passar do que falta (tela desatualizada, outro caixa recebeu).
  for (const p of partes) {
    const falta = (await faltasDaComanda(supabase, p.comandaId)).reduce((a, l) => a + l.falta, 0);
    if (p.valor / fator > falta + 0.02) {
      return { ok: false as const, mensagem: `A parte (${p.valor.toFixed(2).replace(".", ",")}) é maior do que falta nessa comanda. Atualize a tela.` };
    }
  }
  // Desconto que zera a conta (100%) fechava a comanda sem pagamento e sem motivo
  // (CX-06). O PDV já recusava: conta dada é Cortesia, que pede o motivo.
  if (Number(desconto) > 0 && !pagamentos.some((p) => p.valor > 0)) {
    return { ok: false as const, mensagem: "Desconto de 100% não fecha a conta. Se é por conta da casa, use a forma Cortesia (ela pede o motivo)." };
  }
  // Tipo de cada forma (cadastro): cortesia e vale-presente pedem o motivo e
  // não entram como venda (migration 0233).
  const formasT = await formasParaTipo();
  // Vale-presente com código (migration 0235) dispensa o motivo: o código é o registro.
  const semMotivo = pagamentos.find((p) => p.valor > 0 && naoEntraNoCaixa(tipoDe(p.forma, formasT)) && !(p.observacao ?? "").trim() && !(p.valeCodigo ?? "").trim());
  if (semMotivo) return { ok: false as const, mensagem: `Escreva na observação o motivo da ${semMotivo.forma} (ex.: aniversário, nº do vale).` };
  // Forma que exige código (ex.: cupom do Juntos Sicredi): sem ele, não recebe.
  const semCodigo = pagamentos.find((p) => p.valor > 0 && codigoDaForma(p.forma, formasT) && !(p.observacao ?? "").trim());
  if (semCodigo) return { ok: false as const, mensagem: `Preencha o ${(codigoDaForma(semCodigo.forma, formasT) ?? "código").toLowerCase()} do ${semCodigo.forma}.` };

  // "Recebido sem conta": o pagamento guardado ainda está livre? (Outra conta
  // ou outra tela pode ter usado depois que a lista abriu.) Senão contaria
  // duas vezes o mesmo dinheiro.
  const semContaIds = pagamentos.map((p) => p.tef?.semContaId).filter((x): x is string => !!x);
  if (semContaIds.length > 0) {
    const { data: livres } = await supabase.from("tef_transacoes").select("id").in("id", semContaIds).is("mov_id", null);
    if (((livres as { id: string }[] | null) ?? []).length < new Set(semContaIds).size) {
      return { ok: false as const, mensagem: "Um pagamento de \"Recebido sem conta\" já foi usado em outra venda. Tire ele desta conta e confira a lista." };
    }
  }

  // Compra da equipe / Saldo cliente: confere ANTES de marcar qualquer coisa
  // como paga (antes a comanda fechava e só depois vinha o erro).
  const conferencia = await conferirFormasEspeciais(supabase, { pagamentos, clienteId: clienteId ?? null, formas: formasT });
  if (!conferencia.ok) return { ok: false as const, mensagem: conferencia.mensagem };

  // Outro caixa recebeu parte DESTA seleção enquanto a tela estava aberta: antes
  // passava (havia algo a quitar) e o pagamento entrava inteiro, inclusive o das
  // linhas já pagas. Confere tudo antes de marcar qualquer coisa (revisão do CX-04).
  {
    const pedidos = sel.flatMap((s) => s.itemIds);
    if (pedidos.length > 0) {
      const { data: jaPagos } = await supabase.from("pdv_comanda_itens").select("id").in("id", pedidos).eq("pago", true);
      const comBuffet = sel.filter((s) => s.buffet).map((s) => s.comandaId);
      const { data: buffetsPagos } = comBuffet.length
        ? await supabase.from("pdv_comandas").select("id").in("id", comBuffet).eq("buffet_pago", true)
        : { data: [] as { id: string }[] };
      if ((jaPagos?.length ?? 0) > 0 || (buffetsPagos?.length ?? 0) > 0) {
        return { ok: false as const, mensagem: "Parte dessa conta já foi recebida (outro caixa?). Nada foi lançado — atualize a tela e confira o que falta." };
      }
    }
  }

  // Baixa nos vales ANTES de marcar a conta como paga: sem saldo (ou vencido),
  // nada é lançado. Se a conta não fechar depois, o saldo volta pro vale.
  const baixas = new Map<number, BaixaVale>();
  for (const [i, p] of pagamentos.entries()) {
    if (!(p.valor > 0) || !(p.valeCodigo ?? "").trim() || tipoDe(p.forma, formasT) !== "vale_presente") continue;
    const b = await debitarVale(supabase, p.valeCodigo!, p.valor, "caixa", sel[0]?.comandaId ?? extras[0]?.comandaId ?? null);
    if (!b.ok) {
      await estornarBaixas(supabase, [...baixas.values()], "conta não fechou");
      return { ok: false as const, mensagem: b.mensagem };
    }
    baixas.set(i, b.baixa);
  }

  // Consumo (sem os 10%) quitado agora em cada comanda: é por ele que o desconto
  // se reparte entre as comandas pra sair na nota.
  const basePorComanda = new Map<string, number>();
  const somarBase = (id: string, v: number) => { if (v > 0) basePorComanda.set(id, r2((basePorComanda.get(id) ?? 0) + v)); };

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
      base_pago: r2(precoVenda(prod) * e.qtd),
      pago: true,
    });
    somarBase(e.comandaId, r2(precoVenda(prod) * e.qtd));
  }

  const numeros: number[] = [];
  // Conta o que de fato foi quitado agora. Linha já paga (outro caixa recebeu
  // antes, ou tela desatualizada) é pulada — senão o caixa lançaria a venda 2×.
  let quitadosAgora = 0;
  for (const s of sel) {
    for (const itemId of s.itemIds) {
      const { data: row } = await supabase
        .from("pdv_comanda_itens")
        .select("qtd, preco_unit, pago, base_pago, valor_pago")
        .eq("id", itemId)
        .single();
      if (!row || row.pago) continue;
      // Paga o que falta do preço (pode já ter recebido uma parte antes).
      const preco = r2(Number(row.qtd) * Number(row.preco_unit));
      const falta = Math.max(0, preco - Number(row.base_pago ?? 0));
      // Só marca se ainda não estiver pago: dois caixas recebendo a mesma conta
      // ao mesmo tempo passavam os dois e lançavam a venda 2× (CX-04).
      const { data: mudou } = await supabase
        .from("pdv_comanda_itens")
        .update({ valor_pago: r2(Number(row.valor_pago ?? 0) + falta * fator), base_pago: preco, pago: true })
        .eq("id", itemId)
        .eq("pago", false)
        .select("id");
      if (!mudou?.length) continue;
      somarBase(s.comandaId, falta);
      quitadosAgora++;
    }
    if (s.buffet) {
      const { data: c } = await supabase
        .from("pdv_comandas")
        .select("valor_buffet, buffet_pago, buffet_base_pago, buffet_valor_pago")
        .eq("id", s.comandaId)
        .single();
      // Sem valor = o buffet foi excluído e esta tela está desatualizada: não
      // pode contar como recebido, senão lançaria a venda de algo que saiu.
      if (c && !c.buffet_pago && Number(c.valor_buffet ?? 0) > 0) {
        const preco = r2(Number(c.valor_buffet ?? 0));
        const falta = Math.max(0, preco - Number(c.buffet_base_pago ?? 0));
        const { data: mudou } = await supabase
          .from("pdv_comandas")
          .update({ buffet_valor_pago: r2(Number(c.buffet_valor_pago ?? 0) + falta * fator), buffet_base_pago: preco, buffet_pago: true })
          .eq("id", s.comandaId)
          .eq("buffet_pago", false)
          .select("id");
        if (mudou?.length) {
          somarBase(s.comandaId, falta);
          quitadosAgora++;
        }
      }
    }
    const parte = partes.find((p) => p.comandaId === s.comandaId);
    if (parte && (await aplicarParte(supabase, s.comandaId, parte.valor, fator)) > 0) {
      somarBase(s.comandaId, r2(parte.valor / fator));
      quitadosAgora++;
    }
    const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", s.comandaId).single();
    if (com?.numero != null) numeros.push(com.numero);
    await fecharSeQuitou(supabase, s.comandaId);
  }

  // Comandas que receberam SÓ produtos avulsos (fora do "sel") também fecham.
  const idsSel = new Set(sel.map((s) => s.comandaId));
  const soExtras = [...new Set(extras.map((e) => e.comandaId))].filter((id) => !idsSel.has(id));
  for (const id of soExtras) {
    const { data: com } = await supabase.from("pdv_comandas").select("numero").eq("id", id).single();
    if (com?.numero != null) numeros.push(com.numero);
    await fecharSeQuitou(supabase, id);
  }

  // Vincula o cliente às comandas envolvidas (destinatário de uma NF-e futura).
  if (clienteId) {
    const todas = [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])];
    if (todas.length > 0) {
      await supabase.from("pdv_comandas").update({ cliente_id: clienteId }).in("id", todas);
    }
  }

  // Nada foi quitado agora (outro caixa recebeu antes, tela desatualizada): para
  // AQUI, antes de lançar fiado ou Compra da equipe — antes o fiado ficava gravado
  // e a resposta dizia "já tinha sido recebida" (CX-03).
  if (sel.length > 0 && quitadosAgora === 0 && extras.length === 0) {
    await estornarBaixas(supabase, [...baixas.values()], "conta já recebida");
    revalidatePath("/salao/caixa");
    return { ok: false as const, mensagem: "Essa conta já tinha sido recebida (outro caixa?). Nada foi lançado de novo — atualize a tela." };
  }

  // "Compra da equipe" (vai pra Compras internas) e "Saldo cliente" (fiado):
  // mesmo código do PDV e do recebimento do delivery (src/lib/pagamento-especial.ts).
  const especiais = await lancarFormasEspeciais(supabase, {
    pagamentos,
    clienteId: clienteId ?? null,
    rotulo: `comandas ${numeros.map((n) => `#${n}`).join(", ")}`,
    comandaId: sel[0]?.comandaId ?? extras[0]?.comandaId ?? null,
    caixaId,
    formas: formasT,
  });
  if (!especiais.ok) {
    await estornarBaixas(supabase, [...baixas.values()], "conta não fechou");
    return { ok: false as const, mensagem: especiais.mensagem };
  }
  revalidatePath("/retiradas");

  // Desconto na nota (migration 0273): reparte pelo consumo quitado agora e soma
  // no que a comanda já tinha (pagamento em partes). Nunca passa do consumo.
  const descontoNota = r2(Math.max(0, Math.min(Number(desconto) || 0, [...basePorComanda.values()].reduce((a, b) => a + b, 0))));
  if (descontoNota > 0) {
    const ids = [...basePorComanda.keys()];
    const fatias = repartirDesconto(ids.map((id) => basePorComanda.get(id) ?? 0), descontoNota);
    for (const [k, id] of ids.entries()) {
      if (!(fatias[k] > 0)) continue;
      const { data: c } = await supabase.from("pdv_comandas").select("desconto_nota").eq("id", id).single();
      await supabase.from("pdv_comandas").update({ desconto_nota: r2(Number(c?.desconto_nota ?? 0) + fatias[k]) }).eq("id", id);
    }
  }

  const totalPago =
    Math.round(pagamentos.reduce((a, p) => a + (p.valor > 0 ? p.valor : 0), 0) * 100) / 100;
  const primeiraComanda = sel[0]?.comandaId ?? extras[0]?.comandaId;
  // Todas as comandas quitadas neste recebimento: o link "ver comanda" das
  // Movimentações abre uma por uma (antes só a primeira era guardada).
  const comandasDaVenda = [...new Set([...sel.map((s) => s.comandaId), ...extras.map((e) => e.comandaId)])];
  // Pagamentos feitos no TEF: o caixa vai CONFIRMAR no pinpad com estes ids.
  const tefRegistros: { idAgente: string; transacaoId: string }[] = [];
  if (caixaId && primeiraComanda) {
    const desc = `Comandas ${numeros.map((n) => `#${n}`).join(", ")}`;
    const { data: quem } = await supabase.auth.getUser();
    for (const [i, p] of pagamentos.entries()) {
      if (!(p.valor > 0)) continue;
      const t = p.tef ?? null;
      const baixa = baixas.get(i);
      const { data: mov } = await supabase
        .from("pdv_caixa_mov")
        .insert({
          caixa_id: caixaId,
          // Cortesia / vale-presente: movimento próprio, fora do caixa e do faturamento.
          tipo: tipoDoMovimento(tipoDe(p.forma, formasT)),
          descricao: desc,
          forma_pagamento: p.forma,
          valor: p.valor,
          comanda_id: primeiraComanda,
          comanda_ids: comandasDaVenda,
          bandeira: ((t?.bandeira || p.bandeira) || "").trim().slice(0, 30) || null,
          observacao: ((baixa ? obsDaBaixa(baixa) : "") || (p.observacao || "").trim()).slice(0, 200) || null,
          tef_nsu: t?.nsu ?? null,
          tef_autorizacao: t?.autorizacao ?? null,
          tef_rede: t?.rede ?? null,
          tef_terminal: t?.terminal ?? null,
        })
        .select("id")
        .maybeSingle();
      if (baixa) await ligarBaixaAoMov(supabase, baixa, (mov as { id?: string } | null)?.id ?? null);
      if (t) {
        const campos = {
          caixa_id: caixaId,
          comanda_ids: comandasDaVenda,
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
        };
        // Veio de "Recebido sem conta" (ou outra tela já guardou): liga aquela
        // linha a esta venda em vez de nascer outra pro mesmo NSU. Só liga se
        // ainda estiver livre (mov_id nulo) — ligar por cima tiraria o
        // pagamento de outra venda.
        const existente = t.semContaId ?? (await transacaoSemConta(supabase, t));
        const ligada = existente
          ? (await supabase.from("tef_transacoes").update({ ...campos, mensagem: null }).eq("id", existente).is("mov_id", null).select("id").maybeSingle()).data
          : null;
        const tr = ligada ?? (await supabase.from("tef_transacoes").insert(campos).select("id").maybeSingle()).data;
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
      (p) => p.valor > 0 && !naoEntraNoCaixa(tipoDe(p.forma, formasT)) && /pix|cart|créd|cred|déb|deb|vale/i.test(p.forma),
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
  } catch (e) {
    // Nota é acessório: se a fila falhar, o recebimento continua valendo.
    // Mas fica o rastro na Saúde do sistema (COD-004).
    await registrarErro("caixa:fila-da-nota", e, { caixaId });
  }

  revalidatePath("/salao/caixa");
  revalidatePath("/salao");
  return { ok: true as const, numeros, total: totalPago, pendenteId, tefRegistros };
}

// A resposta do "Pagar" se perdeu (conexão caiu): a venda gravou ou não? O NSU do
// cartão identifica — se já há transação desse NSU ligada a um movimento do caixa,
// a venda está gravada e o cartão deve ser CONFIRMADO, não desfeito (CX-05).
export async function conferirVendaGravada(tefs: { idAgente: string; nsu: string | null }[]) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  const desde = new Date(Date.now() - 20 * 60_000).toISOString();
  const registros: { idAgente: string; transacaoId: string }[] = [];
  for (const t of tefs) {
    if (!t.nsu) return { gravada: false as const };
    const { data, error } = await supabase
      .from("tef_transacoes")
      .select("id")
      .eq("nsu", t.nsu)
      .eq("id_agente", t.idAgente)
      .not("mov_id", "is", null)
      .gte("criado_em", desde)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("sem resposta do banco");
    if (!data) return { gravada: false as const };
    registros.push({ idAgente: t.idAgente, transacaoId: (data as { id: string }).id });
  }
  return { gravada: true as const, tefRegistros: registros };
}

// Depois que o pinpad confirmou (CNF) ou desfez (NCN), o registro do TEF
// reflete isso; confirmado → a via do cliente sai na impressora da nota.
// PDV e delivery também passam no pinpad (12/10/2026), então quem vende por
// lá também fecha a transação. A regra mora em src/lib/tef-venda-server.ts.
export async function fecharTef(transacaoId: string, confirmada: boolean, motivo?: string) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  await fecharTefNoBanco(supabase, transacaoId, confirmada, motivo);
  return { ok: true as const };
}

// Cancelamento de uma venda no cartão (CNC já aprovado pelo pinpad): marca a
// transação original como cancelada, grava o estorno no caixa aberto (venda
// negativa na mesma forma, pra o fechamento e o Z baterem) e imprime a via.
// Confere ANTES de acionar o pinpad: a venda ainda está confirmada e há caixa
// aberto pra lançar o estorno. Antes a conferência vinha depois do cancelamento
// já aprovado na adquirente, e sem caixa o cartão ficava cancelado e o sistema
// seguia "confirmada" (PAG-03).
export async function conferirAntesDeCancelarTef(transacaoId: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: orig } = await supabase.from("tef_transacoes").select("status, mov_id").eq("id", transacaoId).maybeSingle();
  if (!orig) return { ok: false as const, mensagem: "Transação não encontrada. Atualize a tela." };
  if (orig.status !== "confirmada") return { ok: false as const, mensagem: "Essa venda não está mais confirmada (outra tela já cancelou?). Atualize a tela." };
  if (orig.mov_id && !(await caixaAberto(supabase))) return { ok: false as const, mensagem: "Abra o caixa antes de cancelar: o estorno precisa de um caixa aberto." };
  return { ok: true as const };
}

// Depois de olhar o extrato: o pagamento "A CONFERIR" entrou ou não (PAG-01).
export async function resolverTefAConferir(transacaoId: string, entrou: boolean) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: atual } = await supabase.from("tef_transacoes").select("status, mensagem").eq("id", transacaoId).maybeSingle();
  const msgAtual = (atual as { mensagem: string | null } | null)?.mensagem ?? "";
  if ((atual as { status: string } | null)?.status !== "desfeita" || !/^A CONFERIR|^o CNF não chegou e o agente não tem mais/.test(msgAtual)) {
    return { ok: false as const, mensagem: "Esse pagamento não está mais a conferir. Atualize a tela." };
  }
  const { data: quem } = await supabase.auth.getUser();
  const nota = `conferido no extrato em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${quem.user?.email ? ` por ${quem.user.email}` : ""}`;
  const { data, error } = await supabase
    .from("tef_transacoes")
    .update(entrou
      ? { status: "confirmada", mensagem: `Entrou (${nota})`, atualizado_em: new Date().toISOString() }
      : { mensagem: `Não entrou: voltou pro cliente (${nota})`, atualizado_em: new Date().toISOString() })
    .eq("id", transacaoId)
    .eq("status", "desfeita")
    .eq("mensagem", msgAtual)
    .select("id");
  if (error || !data?.length) return { ok: false as const, mensagem: "Não consegui marcar (já foi marcado em outra tela?). Atualize a tela." };
  revalidatePath("/salao/caixa/tef");
  return { ok: true as const };
}

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
  const { data: userData } = await supabase.auth.getUser();
  const agora = new Date().toISOString();

  // Marca a original PRIMEIRO, e só se ainda estiver confirmada: dois registros
  // do mesmo cancelamento (tela repetida, nova tentativa) lançavam dois estornos.
  // E sem caixa aberto o cartão JÁ foi cancelado na adquirente: registra assim
  // mesmo (antes ficava "confirmada") e avisa pra lançar o estorno à mão.
  const { data: marcou, error: errMarcar } = await supabase
    .from("tef_transacoes")
    .update({ status: "cancelada", mensagem: `Cancelada em ${agora.slice(0, 16).replace("T", " ")} (NSU do cancelamento ${r.nsu ?? "-"})${veioDoCaixa && !caixaId ? " — SEM ESTORNO NO CAIXA (não havia caixa aberto)" : ""}`, atualizado_em: agora })
    .eq("id", transacaoId)
    .eq("status", "confirmada")
    .select("id");
  // Erro do banco não é "já registrado": joga a exceção pra tela guardar o
  // cancelamento e tentar de novo (senão o cartão cancelado ficava "confirmada").
  if (errMarcar) throw new Error("Não consegui gravar o cancelamento agora. Ele fica guardado e é gravado de novo.");
  if (!marcou?.length) return { ok: false as const, mensagem: "Esse cancelamento já tinha sido registrado." };

  // Forma de pagamento da venda original (pra o estorno cair na mesma).
  let forma = "Cartão";
  if (orig.mov_id) {
    const { data: mov } = await supabase.from("pdv_caixa_mov").select("forma_pagamento").eq("id", orig.mov_id as string).maybeSingle();
    forma = (mov?.forma_pagamento as string | null) || forma;
  } else {
    forma = orig.tipo === "debito" ? "Cartão de débito" : orig.tipo === "voucher" ? "Vale refeição" : "Cartão de crédito";
  }
  const resEstorno = veioDoCaixa && caixaId
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
      )
    : null;
  const estorno = resEstorno?.data ?? null;
  const estornoFalhou = !!resEstorno?.error;

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

  const novaId = (nova as { id?: string } | null)?.id;
  if (novaId && r.viaCliente.length > 0) await reimprimirTef(novaId);
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/tef");
  if (estornoFalhou) {
    return { ok: true as const, aviso: `O cartão foi cancelado, mas não consegui lançar o estorno no caixa: lance a saída de ${Number(orig.valor).toFixed(2).replace(".", ",")} à mão.` };
  }
  if (veioDoCaixa && !caixaId) {
    return { ok: true as const, aviso: `O cartão foi cancelado, mas não havia caixa aberto: lance a saída de ${Number(orig.valor).toFixed(2).replace(".", ",")} à mão no próximo caixa.` };
  }
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
 * Cartão ou Pix CONFIRMADO no pinpad cuja venda NÃO foi gravada.
 *
 * Acontece na conta com dois cartões: o primeiro é confirmado (CNF) antes de
 * passar o segundo — o gerenciador exige — e depois a venda falha ou o caixa
 * tira o pagamento da conta. E desde 31/10 (BUG-001, comanda 238) também quando
 * o pinpad aprova e não tem mais tela pra receber (o caixa saiu da conta): em
 * vez de desfazer — o cliente pagava e recebia de volta —, a guarda do pinpad
 * (src/lib/tef-guarda.ts) confirma e guarda aqui.
 *
 * Fica fora do caixa (mov_id nulo) e aparece em "Recebido sem conta" no
 * Pagamento do caixa, pra usar numa conta, e em Cartões (TEF), pra cancelar.
 */
export async function registrarTefAvulso(
  t: {
    idAgente: string; terminal: string | null; nsu: string | null; nsuHost: string | null; autorizacao: string | null;
    rede: string | null; bandeira: string | null; produto: string | null;
    // Nulo quando a tela que cobrou foi fechada antes de o pinpad responder e
    // ninguém anotou o tipo (o agente só guarda valor e NSU).
    tipo: "credito" | "debito" | "voucher" | "pix" | null;
    parcelas: number; panMascarado: string | null; viaCliente: string[]; viaLoja: string[];
  },
  valor: number,
  motivo: string,
) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  // Já registrado (a venda gravou no meio do caminho, ou outra aba guardou antes).
  if (t.idAgente && t.nsu) {
    let q = supabase
      .from("tef_transacoes")
      .select("id, status, mov_id")
      .eq("id_agente", t.idAgente)
      .eq("nsu", t.nsu)
      .gte("criado_em", new Date(Date.now() - 7 * 86400000).toISOString());
    if (t.terminal) q = q.eq("terminal", t.terminal);
    const { data: ja } = await q.limit(1).maybeSingle();
    if (ja) {
      // A guarda acabou de confirmar no pinpad: se a linha ficou "aprovada" ou
      // "desfeita" (o caixa não conseguiu o CNF na hora), passa a valer.
      const linha = ja as { id: string; status: string; mov_id: string | null };
      // Já está numa venda: fecha pelo caminho normal, que põe o comprovante na fila.
      if (linha.status === "aprovada" && linha.mov_id) {
        await fecharTefNoBanco(supabase, linha.id, true);
      } else if (linha.status === "aprovada" || linha.status === "desfeita") {
        await supabase.from("tef_transacoes").update({ status: "confirmada", atualizado_em: new Date().toISOString() }).eq("id", linha.id);
      }
      return { ok: true as const };
    }
  }
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
    mensagem: `${PREFIXO_SEM_CONTA} gravada (${motivo}) — use numa conta pelo Pagamento do caixa, ou cancele aqui`,
    via_cliente: t.viaCliente ?? [],
    via_loja: t.viaLoja ?? [],
    id_agente: t.idAgente,
    criado_por: userData.user?.id ?? null,
  });
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa/tef");
  return { ok: true as const };
}

/**
 * Cobrança que o pinpad não aprovou: guarda data, hora, valor, tipo, terminal e a
 * mensagem, para ter o que mostrar à Elgin (06/11/2026). Só um registro: mov_id e
 * id_agente nulos, status fora de "confirmada", então não entra em caixa, totais
 * nem "Recebido sem conta".
 */
export async function registrarRecusaTef(d: {
  status: "negada" | "erro";
  tipo: "credito" | "debito" | "voucher" | "pix";
  valor: number;
  parcelas?: number | null;
  terminal?: string | null;
  hostname?: string | null;
  rede?: string | null;
  bandeira?: string | null;
  produto?: string | null;
  panMascarado?: string | null;
  mensagem?: string | null;
  conta?: string | null;
}) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const valor = Number(d.valor);
  if (!(valor > 0) || !["negada", "erro"].includes(d.status)) return { ok: false as const };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const texto = (d.mensagem ?? "").trim() || "Sem mensagem do pinpad";
  const { error } = await supabase.from("tef_transacoes").insert({
    mov_id: null,
    caixa_id: null,
    id_agente: null,
    status: d.status,
    tipo: d.tipo,
    valor,
    parcelas: Math.max(1, Number(d.parcelas) || 1),
    terminal: d.terminal ?? null,
    hostname: d.hostname ?? null,
    rede: d.rede ?? null,
    bandeira: d.bandeira ?? null,
    produto: d.produto ?? null,
    pan_mascarado: d.panMascarado ?? null,
    mensagem: `${texto}${d.conta ? ` (${d.conta})` : ""}`.slice(0, 500),
    criado_por: userData.user?.id ?? null,
  });
  return error ? { ok: false as const } : { ok: true as const };
}

export type TefSemConta = {
  id: string;
  valor: number;
  criadoEm: string;
  /** O que a guarda anotou: de que conta era e por que ficou sem venda. */
  motivo: string;
  tef: {
    idAgente: string; terminal: string | null; nsu: string | null; nsuHost: string | null; autorizacao: string | null;
    rede: string | null; bandeira: string | null; produto: string | null; tipo: "credito" | "debito" | "voucher" | "pix" | null;
    parcelas: number; panMascarado: string | null; viaCliente: string[]; viaLoja: string[];
  };
};

/**
 * "Recebido sem conta": pagamentos aprovados no pinpad que ficaram sem venda
 * (registrarTefAvulso) nos últimos 7 dias e ainda não foram usados numa conta,
 * cancelados nem resolvidos à mão. Aparecem no Pagamento do caixa.
 */
export async function listarTefSemConta(): Promise<TefSemConta[]> {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data } = await supabase
    .from("tef_transacoes")
    .select("id, valor, criado_em, mensagem, id_agente, terminal, nsu, nsu_host, autorizacao, rede, bandeira, produto, tipo, parcelas, pan_mascarado, via_cliente, via_loja")
    .is("mov_id", null)
    .eq("status", "confirmada")
    .like("mensagem", `${PREFIXO_SEM_CONTA}%`)
    .gte("criado_em", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("criado_em", { ascending: false })
    .limit(20);
  type Linha = {
    id: string; valor: number | string; criado_em: string; mensagem: string | null; id_agente: string | null; terminal: string | null;
    nsu: string | null; nsu_host: string | null; autorizacao: string | null; rede: string | null; bandeira: string | null; produto: string | null;
    tipo: TefSemConta["tef"]["tipo"]; parcelas: number | null; pan_mascarado: string | null; via_cliente: string[] | null; via_loja: string[] | null;
  };
  return ((data as Linha[] | null) ?? [])
    .filter((l) => !!l.id_agente)
    .map((l) => ({
      id: l.id,
      valor: Number(l.valor),
      criadoEm: l.criado_em,
      motivo: (l.mensagem ?? "").match(/\((.*)\)/)?.[1] ?? "",
      tef: {
        idAgente: l.id_agente as string, terminal: l.terminal, nsu: l.nsu, nsuHost: l.nsu_host, autorizacao: l.autorizacao,
        rede: l.rede, bandeira: l.bandeira, produto: l.produto, tipo: l.tipo, parcelas: Number(l.parcelas) || 1,
        panMascarado: l.pan_mascarado, viaCliente: l.via_cliente ?? [], viaLoja: l.via_loja ?? [],
      },
    }));
}

/** O caixa já acertou à mão (lançou sem o pinpad, ou o cliente não era daqui): sai da lista. */
export async function resolverTefSemConta(id: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data } = await supabase.from("tef_transacoes").select("mensagem").eq("id", id).is("mov_id", null).maybeSingle();
  if (!data) return { ok: false as const, mensagem: "Esse pagamento não está mais sem conta." };
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const { error } = await supabase
    .from("tef_transacoes")
    .update({ mensagem: `Resolvido à mão em ${quando} — ${(data as { mensagem: string | null }).mensagem ?? ""}`.slice(0, 500), atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .is("mov_id", null);
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
    // Entra na conferência do caixa, mas não é venda nova: a venda já contou no
    // dia em que foi pro saldo (BUG-006, migration 0274).
    recebe_fiado: true,
  });
  revalidatePath("/salao/caixa");
  revalidatePath("/salao/caixa/fiado");
  return { ok: true as const };
}

// Baixa no fiado SEM entrar no caixa (pedido do Rafael, 08/11/2026): troca de
// serviço (Auto Center), cortesia de família e amigos, ou outro motivo escrito.
// Não precisa de caixa aberto e não lança nada em pdv_caixa_mov.
export async function baixarFiadoSemCaixa(clienteId: string, valor: number, motivo: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const v = Math.round(Number(valor) * 100) / 100;
  const m = (motivo || "").trim().slice(0, 120);
  if (!clienteId || !(v > 0)) return { ok: false as const, mensagem: "Valor inválido." };
  if (m.length < 3) return { ok: false as const, mensagem: "Escreva o motivo da baixa." };
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("cliente_fiado").insert({
    cliente_id: clienteId,
    tipo: "pagamento",
    valor: v,
    descricao: `Baixa sem caixa: ${m}`,
    forma_pagamento: "Sem caixa",
    caixa_id: null,
    criado_por: userData.user?.id ?? null,
  });
  if (error) return { ok: false as const, mensagem: error.message };
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
  await exigirAcesso("/salao");
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
  // Troco contado nota por nota (pedido do Rafael, 10/11/2026): o total sai
  // das notas e a contagem vai pronta pro Cofre. Sem notas, vale o total.
  let notasAbertura: Quantidades | null = null;
  try {
    const bruto = formData.get("notas");
    if (typeof bruto === "string" && bruto.trim() && bruto.trim() !== "{}") notasAbertura = contagemValida(JSON.parse(bruto));
  } catch { notasAbertura = null; }
  const temNotas = !!notasAbertura && Object.keys(notasAbertura).length > 0;
  const saldo_inicial = temNotas ? valorDe(notasAbertura as Quantidades) : valorNum(formData.get("saldo_inicial"));
  await supabase.from("pdv_caixas").insert({ nome, saldo_inicial, abertura_notas: temNotas ? notasAbertura : null });
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
  // A tela só envia com o destino escolhido. Pagamento sem categoria entraria no
  // Cofre como dinheiro a guardar, então não grava. Sem destino nenhum é aba
  // aberta antes da publicação: segue como antes para não perder a saída.
  const categoriaId = ((formData.get("categoria_id") as string) || "").trim();
  const categoriaValida = /^[0-9a-f-]{36}$/i.test(categoriaId);
  if (formData.get("destino") === "pagamento" && !categoriaValida) return;
  const { finDaSangria, lancarSangriaNoFinanceiro } = await import("@/lib/sangria-financeiro");
  const fin = categoriaValida ? await finDaSangria() : null;
  if (categoriaValida && !fin) throw new Error("Não consegui saber a empresa deste acesso. Entre de novo.");
  const { data: mov } = await supabase.from("pdv_caixa_mov").insert({
    caixa_id: caixaId,
    tipo: "sangria",
    descricao: ((formData.get("descricao") as string) || "Sangria").trim(),
    forma_pagamento: "Dinheiro",
    valor,
  }).select("id").single();
  // Pagamento com categoria = despesa paga no financeiro (migration 0252).
  if (mov?.id && categoriaValida && fin) {
    const r = await lancarSangriaNoFinanceiro(supabase, fin, mov.id as string, categoriaId);
    if (!r.ok) await registrarErro("caixa:sangria-financeiro", `Sangria sem despesa no financeiro: ${r.mensagem}`, { movId: mov.id }, fin.empresaId);
  }
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

// Pedidos de delivery do dia do caixa que impedem o fechamento: não
// cancelados e (não entregues OU entregues sem receber).
async function deliveryEmAberto(supabase: Awaited<ReturnType<typeof createClient>>, abertoEm: string) {
  const dia = new Date(abertoEm).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const inicio = `${dia}T00:00:00-03:00`;
  const fim = `${dia}T23:59:59-03:00`;
  const { data } = await supabase
    .from("delivery_pedidos")
    .select("nome, status, pago, agendado_para, numero_turno, pdv_comandas(numero), entregadores(nome)")
    .neq("status", "cancelado")
    .gte("criado_em", inicio)
    .or("status.neq.entregue,pago.is.false")
    .limit(200);
  type Row = { nome: string; status: string; pago: boolean; agendado_para: string | null; numero_turno: number | null; pdv_comandas: { numero: number } | { numero: number }[] | null; entregadores: { nome: string } | { nome: string }[] | null };
  return ((data as Row[]) ?? [])
    .filter((p) => !p.agendado_para || p.agendado_para <= fim)
    .map((p) => {
      const com = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas;
      const boy = Array.isArray(p.entregadores) ? p.entregadores[0] : p.entregadores;
      return { numero: p.numero_turno ?? com?.numero ?? null, nome: p.nome, motivo: p.status === "entregue" ? (boy ? `com o motoboy ${boy.nome}: feche o caixa dele` : "entregue, falta receber") : p.status.replace("_", " ") };
    });
}

// Comandas abertas com valor a receber: também impedem o fechamento (pedido
// do Rafael, 31/10 — a 502 da mesa 5 ficou aberta desde o almoço e o caixa do
// almoço fechou assim mesmo). Vale qualquer dia, não só o do caixa. Comanda
// vazia (nada a pagar) não trava. As do delivery ficam de fora: quem cuida
// delas é o deliveryEmAberto, com a mensagem certa.
async function comandasEmAberto(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa, aberta_em")
    .eq("status", "aberta")
    .order("aberta_em")
    .limit(300);
  const abertas = (data as { id: string; numero: number; mesa: string | null; aberta_em: string }[]) ?? [];
  if (abertas.length === 0) return [];
  const { data: dels } = await supabase.from("delivery_pedidos").select("comanda_id").in("comanda_id", abertas.map((c) => c.id));
  const doDelivery = new Set(((dels as { comanda_id: string | null }[]) ?? []).map((d) => d.comanda_id));
  const comFalta = await Promise.all(
    abertas
      .filter((c) => !doDelivery.has(c.id))
      .map(async (c) => ({ c, falta: (await faltasDaComanda(supabase, c.id)).reduce((a, l) => a + l.falta, 0) })),
  );
  return comFalta
    .filter((x) => x.falta > 0.004)
    .map(({ c, falta }) => ({ id: c.id, numero: c.numero, mesa: c.mesa, falta: r2(falta), abertaEm: c.aberta_em }));
}

/** O que impede fechar o caixa agora: a tela mostra antes de contar o dinheiro. */
export async function pendenciasDoFechamento(caixaId: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { data: caixa } = await supabase.from("pdv_caixas").select("aberto_em").eq("id", caixaId).maybeSingle();
  if (!caixa) return { comandas: [], delivery: [] };
  const [delivery, comandas] = await Promise.all([
    deliveryEmAberto(supabase, String(caixa.aberto_em)),
    comandasEmAberto(supabase),
  ]);
  return { comandas, delivery };
}

// Fechamento Z: confere o dinheiro contado x esperado, grava a quebra e o
// resumo por forma de pagamento, e fecha o caixa.
export async function fecharCaixaZ(caixaId: string, dinheiroContado: number, obs: string, notas?: Quantidades | null) {
  const supabase = await createClient();
  await exigirAcesso("/salao");
  // Contou nota por nota: o total sai das notas, e o Cofre usa a mesma contagem.
  const notasContadas = notas ? contagemValida(notas) : null;
  if (notas && !notasContadas) return { ok: false as const, mensagem: "A contagem das notas está com um número inválido. Confira e tente de novo." };
  const { data: caixa } = await supabase
    .from("pdv_caixas")
    .select("saldo_inicial, aberto_em")
    .eq("id", caixaId)
    .single();
  if (!caixa) return { ok: false as const };

  // Trava (14/10/2026): não fecha com delivery do dia em aberto — nem pedido
  // ainda não entregue, nem entregue sem receber (o Kern ficava assim e o
  // valor nunca entrava no caixa). Agendado pra outro dia não conta.
  const pendentes = await deliveryEmAberto(supabase, String(caixa.aberto_em));
  if (pendentes.length > 0) {
    const lista = pendentes.slice(0, 6).map((p) => `#${p.numero ?? "?"} ${p.nome} (${p.motivo})`).join("; ");
    return {
      ok: false as const,
      mensagem: `Não dá pra fechar o caixa: ${pendentes.length} pedido(s) de delivery em aberto — ${lista}${pendentes.length > 6 ? "…" : ""}. Entregue e receba (ou cancele) no Delivery — o que está com motoboy fecha em Delivery → Entregadores → Caixa dos motoboys — e tente de novo.`,
    };
  }
  const abertas = await comandasEmAberto(supabase);
  if (abertas.length > 0) {
    const lista = abertas.slice(0, 8).map((c) => `#${c.numero}${c.mesa ? ` (${c.mesa})` : ""}`).join(", ");
    return {
      ok: false as const,
      mensagem: `Não dá pra fechar o caixa: ${abertas.length} comanda(s) aberta(s) com valor a receber — ${lista}${abertas.length > 8 ? "…" : ""}. Receba cada uma (ou exclua, se foi aberta por engano) e tente de novo.`,
    };
  }

  const { data: movs } = await supabase
    .from("pdv_caixa_mov")
    .select("tipo, forma_pagamento, valor, recebe_fiado")
    .eq("caixa_id", caixaId);

  const vendasPorForma: Record<string, number> = {};
  let suprimentos = 0;
  let sangrias = 0;
  // Acerto de fiado: conta na conferência por forma, mas não é venda nova (BUG-006).
  let recebidoFiado = 0;
  for (const m of movs ?? []) {
    const v = Number(m.valor);
    if (m.tipo === "venda") {
      const f = m.forma_pagamento || "Outros";
      vendasPorForma[f] = (vendasPorForma[f] || 0) + v;
      if (m.recebe_fiado) recebidoFiado += v;
    } else if (m.tipo === "suprimento") suprimentos += v;
    else if (m.tipo === "sangria") sangrias += v;
  }
  const saldoInicial = Number(caixa.saldo_inicial);
  const vendasDinheiro = vendasPorForma["Dinheiro"] || 0;
  const esperado = Math.round((saldoInicial + vendasDinheiro + suprimentos - sangrias) * 100) / 100;
  const notasDoResumo = notasContadas && Object.keys(notasContadas).length > 0 ? notasContadas : null;
  const contado = Math.round((notasDoResumo ? valorDe(notasDoResumo) : dinheiroContado) * 100) / 100;
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
    ...(recebidoFiado >= 0.01 ? { recebidoFiado: Math.round(recebidoFiado * 100) / 100 } : {}),
    suprimentos: Math.round(suprimentos * 100) / 100,
    sangrias: Math.round(sangrias * 100) / 100,
    operador,
    ...(notasDoResumo ? { notas: notasDoResumo } : {}),
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
  // Era o que faltava de uma comanda já paga em parte: fecha (BUG-003, 171).
  const fechou = await fecharSeJaRecebeu(supabase, it.comanda_id as string);
  if (fechou) revalidatePath("/salao");
  revalidatePath("/salao/caixa");
  revalidatePath(`/salao/comandas/${it.comanda_id}`);
  revalidatePath(`/garcom/comanda/${it.comanda_id}`);
  return { ok: true as const, fechou, numero: (com?.numero as number | null) ?? null };
}

// "Reimprimir na cozinha" na tela da comanda.
export async function reimprimirPedidoComanda(comandaId: string, lancamentoId: string | null) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const r = await reimprimirNaCozinha(supabase, comandaId, lancamentoId);
  revalidatePath(`/salao/comandas/${comandaId}`);
  return r;
}
