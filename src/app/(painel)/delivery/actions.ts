"use server";

import { exigirAcesso } from "@/lib/permissoes-server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { lancarFormasEspeciais } from "@/lib/pagamento-especial";
import { avisarPedido, enviarTemplate, listarModelos, whatsappConfigurado } from "@/lib/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodificar } from "@/lib/geo";
import { criarPedidoDeliveryCore, imprimirComandaDoPedido, calcularTaxaEntrega, type DadosPedidoDelivery } from "@/lib/delivery-core";

export type { LinhaPedido, DadosPedidoDelivery } from "@/lib/delivery-core";

// Cria o pedido pelo painel (atendente): já nasce "aceito" e imprime na cozinha.
export async function criarPedidoDelivery(d: DadosPedidoDelivery) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const r = await criarPedidoDeliveryCore(supabase, d, { status: "aceito", atendenteId: uid, criadoPor: uid });
  if (r.ok) revalidatePath("/delivery");
  return r;
}

const CARIMBO: Record<string, string> = {
  aceito: "aceito_em", em_preparo: "preparo_em", pronto: "pronto_em",
  saiu: "saiu_em", entregue: "entregue_em", cancelado: "cancelado_em",
};

// extra.tempoMin: ao ACEITAR, o tempo prometido (a previsão vira agora + tempo;
// pedido agendado mantém o horário marcado). extra.motivo: ao CANCELAR.
export async function definirStatusDelivery(id: string, status: string, extra?: { tempoMin?: number; motivo?: string }) {
  const supabase = await createClient();
  if (!(status in CARIMBO) && status !== "pendente") return { ok: false as const };
  const { data: ped } = await supabase.from("delivery_pedidos").select("entregador_id, comanda_id, status, agendado_para").eq("id", id).single();
  if (status === "saiu" && !ped?.entregador_id) return { ok: false as const, mensagem: "Escolha o entregador antes de despachar." };
  if (status === "cancelado" && !(extra?.motivo || "").trim()) return { ok: false as const, mensagem: "Informe o motivo do cancelamento." };

  const patch: Record<string, unknown> = { status };
  if (status in CARIMBO) patch[CARIMBO[status]] = new Date().toISOString();
  if (status === "aceito" && extra?.tempoMin && extra.tempoMin > 0 && !ped?.agendado_para) {
    patch.previsao_em = new Date(Date.now() + Math.round(extra.tempoMin) * 60000).toISOString();
  }
  if (status === "cancelado") patch.cancelado_motivo = (extra?.motivo || "").trim().slice(0, 200);
  await supabase.from("delivery_pedidos").update(patch).eq("id", id);

  // Pedido do app: ao ACEITAR (saindo de pendente), imprime na cozinha.
  // Agendado: imprime só quando vai pra "em preparo" (senão o papel fica
  // horas na bancada e a cozinha faz cedo demais).
  if (status === "aceito" && ped?.status === "pendente" && !ped?.agendado_para) {
    await imprimirComandaDoPedido(supabase, id);
  }
  if (status === "em_preparo" && ped?.agendado_para) {
    await imprimirComandaDoPedido(supabase, id);
  }

  // WhatsApp pro cliente (só com a API configurada; nunca trava o status).
  if (status === "aceito") await avisarPedido(id, "confirmado");
  else if (status === "saiu") await avisarPedido(id, "saiu");
  else if (status === "entregue") await avisarPedido(id, "entregue");

  // Fecha/reabre a comanda junto do ciclo.
  if (ped?.comanda_id) {
    if (status === "entregue" || status === "cancelado") {
      await supabase.from("pdv_comandas").update({ status: "fechada", fechada_em: new Date().toISOString() }).eq("id", ped.comanda_id);
    } else {
      await supabase.from("pdv_comandas").update({ status: "aberta", fechada_em: null }).eq("id", ped.comanda_id);
    }
  }
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirEntregador(id: string, entregadorId: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ entregador_id: entregadorId }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPagoDelivery(id: string, pago: boolean) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ pago }).eq("id", id);
  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function definirPrevisao(id: string, previsaoISO: string | null) {
  const supabase = await createClient();
  await supabase.from("delivery_pedidos").update({ previsao_em: previsaoISO }).eq("id", id);
  revalidatePath(`/delivery/${id}`);
  return { ok: true as const };
}

export async function reimprimirDelivery(id: string) {
  const supabase = await createClient();
  const enviado = await imprimirComandaDoPedido(supabase, id);
  return { ok: enviado > 0, enviado } as { ok: boolean; enviado: number };
}

// ---------- Entregadores ----------
export async function criarEntregador(formData: FormData) {
  const supabase = await createClient();
  const nome = ((formData.get("nome") as string) || "").trim();
  const telefone = ((formData.get("telefone") as string) || "").trim();
  if (!nome) return;
  // Link pessoal do app do entregador (/entrega/{token}).
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
  await supabase.from("entregadores").insert({ nome, telefone: telefone || null, token });
  revalidatePath("/delivery/entregadores");
}

export async function alternarEntregador(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("entregadores").update({ ativo: !ativo }).eq("id", id);
  revalidatePath("/delivery/entregadores");
}

// Calcula a taxa de entrega pela distância (endereço → restaurante).
export async function calcularEntrega(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const supabase = await createClient();
  return calcularTaxaEntrega(supabase, endereco);
}

// Salva a config do delivery e geocodifica o endereço do restaurante.
export async function salvarConfigDelivery(formData: FormData) {
  const supabase = await createClient();
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
  const origemEndereco = String(formData.get("origem_endereco") ?? "").trim();

  // Horários e agendamento → config.horarios (jsonb), por cima do que já havia no config.
  const { data: atual } = await supabase.from("delivery_config").select("config").maybeSingle();
  const configAtual = ((atual as { config?: Record<string, unknown> | null } | null)?.config ?? {}) as Record<string, unknown>;
  const hhmm = (k: string, padrao: string) => { const v = String(formData.get(k) ?? "").trim(); return /^\d{2}:\d{2}$/.test(v) ? v : padrao; };
  const turnos = [
    { id: "almoco", nome: "Almoço", padrao: ["08:30", "11:15", "13:20"] },
    { id: "noite", nome: "Noite", padrao: ["15:00", "18:30", "22:00"] },
  ].map((t) => ({
    id: t.id, nome: t.nome,
    dias: formData.getAll(`t_${t.id}_dias`).map((v) => Number(v)).filter((d) => d >= 0 && d <= 6),
    agendaAbre: hhmm(`t_${t.id}_agenda`, t.padrao[0]),
    livreAbre: hhmm(`t_${t.id}_livre_abre`, t.padrao[1]),
    livreFecha: hhmm(`t_${t.id}_livre_fecha`, t.padrao[2]),
  }));
  const horarios = {
    turnos,
    intervaloMin: Math.max(5, Math.round(num("intervalo_min")) || 15),
    maxPorHorario: Math.max(0, Math.round(num("max_por_horario"))),
    antecedenciaMin: Math.max(0, Math.round(num("antecedencia_min"))),
    pedidoMinimo: Math.max(0, num("pedido_minimo")),
  };

  const patch: Record<string, unknown> = {
    id: 1,
    config: { ...configAtual, horarios },
    origem_endereco: origemEndereco || null,
    taxa_base: num("taxa_base"),
    preco_km: num("preco_km"),
    raio_max_km: num("raio_max_km"),
    tempo_preparo_min: Math.round(num("tempo_preparo_min")) || 40,
    aberto: formData.get("aberto") === "on",
    aviso: String(formData.get("aviso") ?? "").trim() || null,
    atualizado_em: new Date().toISOString(),
  };
  if (origemEndereco) {
    const c = await geocodificar(origemEndereco);
    if (c) { patch.origem_lat = c.lat; patch.origem_lng = c.lng; }
  }
  await supabase.from("delivery_config").upsert(patch, { onConflict: "id" });
  revalidatePath("/delivery/config");
}

// ---------- Cupons de desconto do app ----------
export async function criarCupom(formData: FormData) {
  const supabase = await createClient();
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!codigo) return;
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };
  await supabase.from("cupons").insert({
    codigo,
    tipo: formData.get("tipo") === "valor" ? "valor" : "percent",
    valor: num("valor") ?? 0,
    minimo: num("minimo"),
    validade: String(formData.get("validade") ?? "").trim() || null,
    max_usos: num("max_usos") ? Math.round(num("max_usos")!) : null,
  });
  revalidatePath("/delivery/cupons");
}

export async function alternarCupom(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const ativo = formData.get("ativo") === "1";
  await supabase.from("cupons").update({ ativo }).eq("id", id);
  revalidatePath("/delivery/cupons");
}

export async function excluirCupom(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("cupons").delete().eq("id", formData.get("id") as string);
  revalidatePath("/delivery/cupons");
}

// ---------- Cardápio do app (/delivery/cardapio) ----------

// Sobe a foto de um item ou sabor pro bucket público e grava a URL.
export async function salvarFotoCardapio(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, mensagem: "Sem acesso." };

  const tipo = formData.get("tipo") as string; // 'item' | 'sabor'
  const id = formData.get("id") as string;
  const file = formData.get("foto") as File | null;
  if (!["item", "sabor"].includes(tipo) || !id || !file || file.size === 0) return { ok: false as const, mensagem: "Escolha uma foto." };
  if (file.size > 4 * 1024 * 1024) return { ok: false as const, mensagem: "Foto muito grande (máx. 4MB)." };
  if (!file.type.startsWith("image/")) return { ok: false as const, mensagem: "O arquivo precisa ser uma imagem." };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tipo}/${id}.${ext}`;
  const admin = createAdminClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("cardapio").upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return { ok: false as const, mensagem: `Falha no upload: ${error.message}` };

  const { data: pub } = admin.storage.from("cardapio").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${new Date().getTime()}`; // cache-bust ao trocar a foto
  const tabela = tipo === "item" ? "pdv_itens" : "pdv_pizza_sabores";
  await supabase.from(tabela).update({ foto_url: url }).eq("id", id);
  revalidatePath("/salao/cardapio");
  return { ok: true as const, url };
}

export async function removerFotoCardapio(formData: FormData) {
  const supabase = await createClient();
  const tipo = formData.get("tipo") as string;
  const id = formData.get("id") as string;
  if (!["item", "sabor"].includes(tipo) || !id) return;
  const tabela = tipo === "item" ? "pdv_itens" : "pdv_pizza_sabores";
  await supabase.from(tabela).update({ foto_url: null }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Salva descrição (item/sabor) e a visibilidade do item no app.
export async function salvarDetalheCardapio(formData: FormData) {
  const supabase = await createClient();
  const tipo = formData.get("tipo") as string;
  const id = formData.get("id") as string;
  if (!["item", "sabor"].includes(tipo) || !id) return;
  const descricao = String(formData.get("descricao") ?? "").trim().slice(0, 300) || null;
  if (tipo === "item") {
    const delivery = formData.get("delivery") === "on";
    await supabase.from("pdv_itens").update({ descricao, delivery }).eq("id", id);
  } else {
    // Sabor: além da descrição, se é salgada ou doce e se entra no rodízio
    // (o quadro da cozinha separa salgadas e doces em duas colunas).
    const tipoSabor = formData.get("tipo_sabor") === "doce" ? "doce" : "salgada";
    const rodizio = formData.get("rodizio") === "on";
    await supabase.from("pdv_pizza_sabores").update({ descricao, tipo: tipoSabor, rodizio }).eq("id", id);
    await salvarPrecosDoSabor(supabase, id, formData);
  }
  revalidatePath("/salao/cardapio");
}

// Preço digitado do jeito brasileiro ("12,50") ou com ponto ("12.50").
function precoDigitado(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

// Campos "preco_<id do tamanho>" do formulário → uma linha por tamanho.
// Sabor sem preço num tamanho NÃO é vendido naquele tamanho (o montador de
// pizza só oferece o sabor onde acha preço), então vazio/zero apaga a linha.
async function salvarPrecosDoSabor(supabase: Awaited<ReturnType<typeof createClient>>, saborId: string, formData: FormData) {
  const com: { sabor_id: string; tamanho_id: string; preco: number }[] = [];
  const sem: string[] = [];
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("preco_")) continue;
    const tamanhoId = chave.slice("preco_".length);
    if (!tamanhoId) continue;
    const preco = precoDigitado(valor);
    if (preco > 0) com.push({ sabor_id: saborId, tamanho_id: tamanhoId, preco });
    else sem.push(tamanhoId);
  }
  if (com.length > 0) await supabase.from("pdv_pizza_sabor_precos").upsert(com, { onConflict: "sabor_id,tamanho_id" });
  if (sem.length > 0) await supabase.from("pdv_pizza_sabor_precos").delete().eq("sabor_id", saborId).in("tamanho_id", sem);
}

// Sabor novo de pizza, pela tela Cardápio. Até 25/09/2026 os sabores só
// entravam por importação. Entra no fim da lista (ordem = último + 1).
export async function adicionarSabor(formData: FormData) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  if (!nome) return;
  const descricao = String(formData.get("descricao") ?? "").trim().slice(0, 300) || null;
  const tipo = formData.get("tipo_sabor") === "doce" ? "doce" : "salgada";
  const rodizio = formData.get("rodizio") === "on";
  const { data: ultimo } = await supabase.from("pdv_pizza_sabores").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  const ordem = (Number((ultimo as { ordem?: number } | null)?.ordem) || 0) + 1;
  const { data: novo } = await supabase
    .from("pdv_pizza_sabores")
    .insert({ nome, ordem, ativo: true, descricao, tipo, rodizio })
    .select("id")
    .single();
  const id = (novo as { id?: string } | null)?.id;
  if (id) await salvarPrecosDoSabor(supabase, id, formData);
  revalidatePath("/salao/cardapio");
}

// Tira o sabor do cardápio sem apagar: as pizzas já vendidas apontam pra ele.
export async function desativarSabor(id: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  if (!id) return;
  await supabase.from("pdv_pizza_sabores").update({ ativo: false }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

export async function salvarFatias(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const fatias = Math.round(Number(formData.get("fatias"))) || null;
  if (!id) return;
  await supabase.from("pdv_pizza_tamanhos").update({ fatias }).eq("id", id);
  revalidatePath("/salao/cardapio");
}

// Busca cliente por telefone (autocompleta o Novo pedido).
export async function buscarClientePorTelefone(termo: string) {
  const supabase = await createClient();
  const t = (termo || "").replace(/\D/g, "");
  if (t.length < 4) return [];
  const { data } = await supabase
    .from("clientes")
    .select("id, nome, telefone, logradouro, numero, complemento, bairro, municipio, cep")
    .ilike("telefone", `%${t}%`)
    .limit(6);
  return (data ?? []) as {
    id: string; nome: string; telefone: string | null;
    logradouro: string | null; numero: string | null; complemento: string | null;
    bairro: string | null; municipio: string | null; cep: string | null;
  }[];
}

// Botão "Testar Pix" da config: cria uma cobrança de R$ 0,01 e mostra o resultado.
export async function testarPixDelivery() {
  await exigirAcesso("/delivery");
  const { testarPix } = await import("@/lib/pix");
  return testarPix();
}

// Valores do entregador: fixo por turno e por tele (a área pode ter a dela).
export async function salvarValoresEntregador(formData: FormData) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const num = (k: string) => { const t = String(formData.get(k) ?? "").trim().replace(",", "."); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? Math.max(0, v) : null; };
  await supabase.from("entregadores").update({ valor_fixo_dia: num("valor_fixo_dia"), valor_fixo_noite: num("valor_fixo_noite"), valor_tele: num("valor_tele") }).eq("id", id);
  revalidatePath("/delivery/entregadores");
}

// Acerto do dia de um entregador (fixo + teles); aparece em "Meus ganhos" no app.
export async function registrarAcertoEntregador(formData: FormData) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? Math.max(0, v) : 0; };
  const entregador_id = String(formData.get("entregador_id") ?? "");
  const data = String(formData.get("data") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !entregador_id) return;
  const fixo = num("fixo"), teles_valor = num("teles_valor"), teles_qtd = Math.round(num("teles_qtd"));
  await supabase.from("entregador_acertos").upsert({
    entregador_id, data, fixo, teles_qtd, teles_valor, total: Math.round((fixo + teles_valor) * 100) / 100,
    recebido_dinheiro: num("recebido_dinheiro"), recebido_cartao: num("recebido_cartao"), recebido_pix: num("recebido_pix"),
    obs: String(formData.get("obs") ?? "").trim() || null,
  }, { onConflict: "entregador_id,data" });
  revalidatePath("/delivery/entregadores/acerto");
}

// Botão "Testar envio" da config: manda o modelo hello_world (que toda conta
// nova já tem aprovado, em inglês) pro número digitado. Não expõe token nenhum.
export async function testarWhatsappDelivery(telefone: string) {
  await exigirAcesso("/delivery");
  if (!whatsappConfigurado()) return { ok: false as const, mensagem: "Faltam WHATSAPP_TOKEN e/ou WHATSAPP_PHONE_ID na Vercel (e um redeploy)." };
  // Usa o nosso modelo pedido_recebido (pt_BR); se ainda não foi aprovado, tenta o hello_world da Meta.
  const r = await enviarTemplate(telefone, "pedido_recebido", ["Teste", "0", "https://www.brasarestaurante.com.br/pedir"], null, "pt_BR");
  if (r.ok) return { ok: true as const };
  const r2 = await enviarTemplate(telefone, "hello_world", [], null, "en_US");
  if (r2.ok) return { ok: true as const };
  return { ok: false as const, mensagem: `${r.erro} — o modelo pedido_recebido ainda não existe/foi aprovado na Meta? Cadastre os 4 modelos e tente de novo.` };
}

export async function modelosWhatsappDelivery() {
  await exigirAcesso("/delivery");
  return listarModelos();
}

// Recebe o pedido na tela do delivery: lança no caixa aberto, fecha a comanda
// e marca pago. A forma pode ser diferente da que o cliente disse no app — um
// funcionário pede com "Pix" e o operador recebe como "Compra da equipe"
// (vai pra Compras internas); "Saldo cliente" usa o cliente ligado ao pedido.
// Comanda que o caixa do salão já recebeu só ganha a marca de pago.
export async function receberDelivery(id: string, dados: { forma: string; colaboradorId?: string | null }) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const forma = (dados.forma || "").trim();
  if (!forma) return { ok: false as const, mensagem: "Escolha a forma de pagamento." };

  const { data: ped } = await supabase
    .from("delivery_pedidos")
    .select("id, comanda_id, cliente_id, nome, tipo, taxa_entrega, desconto, pago, pdv_comandas(numero)")
    .eq("id", id)
    .maybeSingle();
  if (!ped) return { ok: false as const, mensagem: "Pedido não encontrado." };
  const p = ped as { comanda_id: string | null; cliente_id: string | null; nome: string; tipo: string; taxa_entrega: number | null; desconto: number | null; pago: boolean; pdv_comandas: { numero: number } | { numero: number }[] | null };
  if (p.pago) return { ok: false as const, mensagem: "Este pedido já está pago." };
  const com = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas;
  const numero = com?.numero ?? null;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const { data: itensRaw } = p.comanda_id
    ? await supabase.from("pdv_comanda_itens").select("id, qtd, preco_unit, pago").eq("comanda_id", p.comanda_id)
    : { data: [] as { id: string; qtd: number; preco_unit: number | null; pago: boolean }[] };
  const itens = (itensRaw as { id: string; qtd: number; preco_unit: number | null; pago: boolean }[]) ?? [];
  const subtotal = r2(itens.reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit || 0), 0));
  const taxa = p.tipo === "retirada" ? 0 : Number(p.taxa_entrega ?? 0);
  const total = r2(subtotal + taxa - Number(p.desconto ?? 0));

  // O caixa do salão já recebeu esta comanda (itens pagos)? Então só a marca.
  const jaRecebida = itens.length > 0 && itens.every((i) => i.pago);
  if (jaRecebida) {
    await supabase.from("delivery_pedidos").update({ pago: true, forma_pagamento: forma }).eq("id", id);
    revalidatePath("/delivery");
    revalidatePath(`/delivery/${id}`);
    return { ok: true as const };
  }

  const { data: cx } = await supabase
    .from("pdv_caixas")
    .select("id")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cx?.id) return { ok: false as const, mensagem: "O caixa está fechado. Abra o caixa antes de receber." };

  const tipo = tipoDe(forma, await formasParaTipo());
  if (tipo === "equipe" || tipo === "saldo") {
    const esp = await lancarFormasEspeciais(supabase, {
      pagamentos: [{ forma, valor: total, colaboradorId: dados.colaboradorId ?? null }],
      clienteId: p.cliente_id,
      rotulo: `delivery #${numero ?? "?"} · ${p.nome}`,
      comandaId: p.comanda_id,
      caixaId: cx.id,
    });
    if (!esp.ok) return { ok: false as const, mensagem: esp.mensagem };
  }

  for (const i of itens) {
    if (i.pago) continue;
    await supabase.from("pdv_comanda_itens").update({ valor_pago: r2(Number(i.qtd) * Number(i.preco_unit || 0)), pago: true }).eq("id", i.id);
  }
  await supabase.from("pdv_caixa_mov").insert({
    caixa_id: cx.id,
    tipo: "venda",
    descricao: `Delivery #${numero ?? "?"} · ${p.nome}`,
    forma_pagamento: forma,
    valor: total,
    comanda_id: p.comanda_id,
  });
  if (p.comanda_id) {
    await supabase
      .from("pdv_comandas")
      .update({
        status: "fechada",
        fechada_em: new Date().toISOString(),
        forma_pagamento: forma,
        servico: 0,
        ...(p.cliente_id ? { cliente_id: p.cliente_id } : {}),
      })
      .eq("id", p.comanda_id);
  }
  await supabase.from("delivery_pedidos").update({ pago: true, forma_pagamento: forma }).eq("id", id);

  revalidatePath("/delivery");
  revalidatePath(`/delivery/${id}`);
  revalidatePath("/salao/caixa");
  revalidatePath("/retiradas");
  return { ok: true as const };
}

// Cashback (Etapa 6): configuração da empresa. Uma linha por empresa.
export async function salvarCashback(formData: FormData) {
  await exigirAcesso("/delivery");
  const supabase = await createClient();
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
  const pct = num("percentual");
  const max = String(formData.get("max_resgate") ?? "").trim() === "" ? null : num("max_resgate");
  const dias = Math.round(num("validade_dias"));
  const canais = ["app", "delivery", "pdv"].filter((c) => formData.get(`canal_${c}`) === "on");
  const formas = formData.getAll("formas_excluidas").map((f) => String(f).trim()).filter(Boolean);
  const row = {
    ativo: formData.get("ativo") === "on",
    percentual: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 2,
    max_resgate: max != null && Number.isFinite(max) ? Math.max(0, max) : null,
    validade_dias: Number.isFinite(dias) && dias > 0 ? dias : 30,
    canais: canais.length ? canais : ["app"],
    formas_excluidas: formData.get("excluir_formas") === "on" ? formas : [],
    sem_combos: formData.get("sem_combos") === "on",
    sem_promos: formData.get("sem_promos") === "on",
    atualizado_em: new Date().toISOString(),
  };
  const { data: atual } = await supabase.from("cashback_config").select("empresa_id").maybeSingle();
  if (atual) await supabase.from("cashback_config").update(row).eq("empresa_id", (atual as { empresa_id: string }).empresa_id);
  else await supabase.from("cashback_config").insert(row);
  revalidatePath("/delivery/cashback");
}
