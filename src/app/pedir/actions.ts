"use server";

// Ações públicas do app do cliente (/pedir). Sem login: usa o admin client no
// servidor (padrão dos apps por token). TODO preço/taxa é recalculado aqui —
// nada do que vem do navegador é confiado.
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { empresaAtual, empresaAtualId } from "@/lib/empresa";
import { calcularTaxaEntrega, criarPedidoDeliveryCore, type LinhaPedido } from "@/lib/delivery-core";
import { disponivelAgora, type Horarios } from "@/lib/disponibilidade";
import { lerConfigPizzas, pizzasAgora } from "@/lib/pizzas-horario";
import { pixConfigurado, criarCobrancaPix, cancelarCobrancaPix, gerarTxid } from "@/lib/pix";
import { confirmarPixApp, registrarCobrancaApp } from "@/lib/delivery-pix";
import { estadoDelivery, lerConfigHorarios, slotsAgendamento } from "@/lib/delivery-horarios";
import { avisarPedido } from "@/lib/whatsapp";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { semCuringa } from "@/lib/format";
import { foneCandidatos } from "@/lib/telefone";
import { aparelhoReconhece, lembrarAparelho } from "@/lib/pedir-aparelho";

export type { LinhaPedido } from "@/lib/delivery-core";

// Taxa de entrega ao digitar o endereço (exibição pro cliente).
export async function calcularEntregaPublico(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const admin = createAdminClient();
  // CRN-02: no máximo 30 cálculos por IP em 10 min (cada um pode ser uma chamada paga ao Google).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "?";
  const { count } = await admin.from("geo_consultas").select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("em", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 30) return { ok: false as const, mensagem: "Muitas consultas seguidas. Espere uns minutos e tente de novo, ou peça pelo WhatsApp." };
  await admin.from("geo_consultas").insert({ ip });
  if (Math.random() < 0.05) await admin.from("geo_consultas").delete().lt("em", new Date(Date.now() - 86400_000).toISOString());
  return calcularTaxaEntrega(admin, endereco);
}

// Dados de quem já pediu (pelo telefone): nome e o ÚLTIMO endereço de entrega,
// pro cliente não digitar tudo de novo. Só devolve se o telefone bater inteiro.
export async function dadosClientePublico(telefone: string) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10) return null;
  const empresaId = await empresaAtualId();
  if (!empresaId) return null;
  const admin = createAdminClient();
  // SEC-08/DEL-13: só no aparelho que já pediu com este telefone.
  if (!(await aparelhoReconhece(admin, empresaId, fone))) return null;
  const { data } = await admin
    .from("delivery_pedidos")
    .select("nome, tipo, logradouro, numero, complemento, bairro, cidade, referencia, cep")
    .eq("empresa_id", empresaId)
    .eq("telefone", fone)
    .neq("status", "cancelado")
    .order("criado_em", { ascending: false })
    .limit(5);
  const rows = (data as { nome: string; tipo: string; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; referencia: string | null; cep: string | null }[]) ?? [];
  if (rows.length === 0) return null;
  const ent = rows.find((r) => r.tipo === "entrega" && r.logradouro);
  return {
    nome: rows[0].nome,
    endereco: ent ? { logradouro: ent.logradouro ?? "", numero: ent.numero ?? "", complemento: ent.complemento ?? "", bairro: ent.bairro ?? "", cidade: ent.cidade ?? "Ivoti", referencia: ent.referencia ?? "", cep: ent.cep ?? "" } : null,
  };
}

// Últimos pedidos do cliente (pelo telefone) — mostra o mínimo: nº, data,
// status, tipo e total, com o link de acompanhamento (id).
export async function meusPedidos(telefone: string) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10) return [];
  const empresaId = await empresaAtualId();
  if (!empresaId) return [];
  const admin = createAdminClient();
  // SEC-08/DEL-13: os pedidos (com o link de acompanhar) só aparecem no aparelho que pediu.
  if (!(await aparelhoReconhece(admin, empresaId, fone))) return [];
  const { data } = await admin
    .from("delivery_pedidos")
    .select("id, criado_em, status, tipo, taxa_entrega, desconto, comanda_id, numero_turno, pdv_comandas(numero)")
    .eq("empresa_id", empresaId)
    .eq("telefone", fone)
    .order("criado_em", { ascending: false })
    .limit(10);
  const rows = (data as unknown as {
    id: string; criado_em: string; status: string; tipo: string; taxa_entrega: number; desconto: number;
    comanda_id: string | null; numero_turno: number | null; pdv_comandas: { numero: number } | { numero: number }[] | null;
  }[]) ?? [];

  const comandaIds = rows.map((r) => r.comanda_id).filter(Boolean) as string[];
  const somaDe = new Map<string, number>();
  if (comandaIds.length) {
    const { data: itens } = await admin.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", comandaIds);
    for (const it of (itens ?? []) as { comanda_id: string; qtd: number; preco_unit: number | null }[]) {
      somaDe.set(it.comanda_id, (somaDe.get(it.comanda_id) ?? 0) + Number(it.qtd) * Number(it.preco_unit || 0));
    }
  }
  return rows.map((r) => {
    const c = Array.isArray(r.pdv_comandas) ? r.pdv_comandas[0] : r.pdv_comandas;
    const taxa = r.tipo === "retirada" ? 0 : Number(r.taxa_entrega || 0);
    return {
      id: r.id,
      numero: r.numero_turno ?? c?.numero ?? null,
      criadoEm: r.criado_em,
      status: r.status,
      tipo: r.tipo,
      total: Math.round(((somaDe.get(r.comanda_id ?? "") ?? 0) + taxa - Number(r.desconto || 0)) * 100) / 100,
    };
  });
}

// Saldo de cashback do cliente (pelo telefone), pro carrinho e pro "Meus
// pedidos". Só responde com o cashback ligado e valendo no app.
export async function saldoCashbackPublico(telefone: string) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10) return null;
  const empresaId = await empresaAtualId();
  if (!empresaId) return null;
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("cashback_config").select("ativo, percentual, max_resgate, canais").eq("empresa_id", empresaId).maybeSingle();
  const c = cfg as { ativo: boolean; percentual: number; max_resgate: number | null; canais: string[] } | null;
  if (!c?.ativo || !(c.canais ?? []).includes("app")) return null;
  // SEC-08: saldo de outra pessoa não aparece (nem pode ser usado) noutro aparelho.
  if (!(await aparelhoReconhece(admin, empresaId, fone))) return null;
  const { data: cli } = await admin.from("clientes").select("id").eq("empresa_id", empresaId).in("telefone_digitos", foneCandidatos(fone)).limit(1).maybeSingle();
  const base = { percentual: Number(c.percentual), maxResgate: c.max_resgate != null ? Number(c.max_resgate) : null };
  if (!cli?.id) return { ...base, saldo: 0, venceEm: null as string | null, venceValor: 0 };
  const { data: saldo } = await admin.rpc("cashback_saldo", { p_cliente: cli.id });
  // O próximo crédito a vencer (pra avisar "R$ X vencem dia tal").
  const { data: prox } = await admin
    .from("cashback_mov").select("restante, expira_em")
    .eq("cliente_id", cli.id).eq("tipo", "credito").is("estornado_em", null)
    .gt("restante", 0).gt("expira_em", new Date().toISOString())
    .order("expira_em").limit(1).maybeSingle();
  const pr = prox as { restante: number; expira_em: string } | null;
  return { ...base, saldo: Number(saldo ?? 0), venceEm: pr?.expira_em ?? null, venceValor: pr ? Number(pr.restante) : 0 };
}

// Se o cliente (pelo telefone) já aceitou promoções — pra caixa vir marcada.
// Não devolve a data de aniversário (é dado pessoal), só se já está cadastrada.
export async function preferenciasPublico(telefone: string) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10) return null;
  const empresaId = await empresaAtualId();
  if (!empresaId) return null;
  const admin = createAdminClient();
  if (!(await aparelhoReconhece(admin, empresaId, fone))) return null; // SEC-08
  const { data } = await admin.from("clientes").select("aceita_promocoes, nascimento, aceita_aniversario")
    .eq("empresa_id", empresaId).in("telefone_digitos", foneCandidatos(fone)).limit(1).maybeSingle();
  const c = data as { aceita_promocoes: boolean | null; nascimento: string | null; aceita_aniversario: boolean } | null;
  if (!c) return null;
  return { aceita: c.aceita_promocoes === true, temAniversario: !!c.nascimento && c.aceita_aniversario };
}

// Valida um cupom e devolve os dados pra prévia do desconto no carrinho.
type CupomRow = { id: string; codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null; validade: string | null; max_usos: number | null; usos: number; ativo: boolean; uma_vez_por_cliente: boolean };
async function buscarCupomValido(admin: ReturnType<typeof createAdminClient>, codigo: string, empresaId: string) {
  const cod = (codigo || "").trim().toUpperCase();
  if (!cod) return { ok: false as const, mensagem: "Digite o código do cupom." };
  const { data } = await admin.from("cupons").select("*").eq("empresa_id", empresaId).ilike("codigo", semCuringa(cod)).maybeSingle();
  const c = data as CupomRow | null;
  if (!c || !c.ativo) return { ok: false as const, mensagem: "Cupom não encontrado ou desativado." };
  if (c.validade && c.validade < hojeSP()) return { ok: false as const, mensagem: "Esse cupom venceu." };
  if (c.max_usos != null && c.usos >= c.max_usos) return { ok: false as const, mensagem: "Esse cupom esgotou." };
  return { ok: true as const, cupom: c };
}

export async function validarCupomPublico(codigo: string) {
  const admin = createAdminClient();
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const, mensagem: "Não consegui identificar o restaurante." };
  const r = await buscarCupomValido(admin, codigo, empresaId);
  if (!r.ok) return r;
  const c = r.cupom;
  return {
    ok: true as const,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: Number(c.valor),
    minimo: c.minimo != null ? Number(c.minimo) : null,
  };
}

export async function enviarPedidoPublico(d: {
  nome: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco?: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; referencia?: string; cep?: string };
  formaPagamento: string;
  trocoPara?: number | null;
  observacao?: string;
  cupom?: string | null;
  itens: LinhaPedido[];
  agendadoPara?: string | null; // ISO de um horário oferecido pelo servidor
  usarCashback?: boolean;
  aceitaPromocoes?: boolean;     // caixa "Quero receber promoções pelo WhatsApp"
  promoMexeu?: boolean;          // o cliente mexeu na caixa (desmarcar = não quer mais)
  nascimento?: string | null;    // "AAAA-MM-DD", opcional (promoção de aniversário)
  campanhaId?: string | null;    // veio pelo link de uma campanha
}) {
  const admin = createAdminClient();

  // Tudo aqui roda com a chave administrativa, que passa por cima das regras
  // do banco — quem pede pelo cardápio não tem login. Então a empresa é
  // descoberta uma vez, no começo, e entra escrita em cada consulta.
  const empresaId = await empresaAtualId();
  if (!empresaId) return { ok: false as const, mensagem: "Não consegui identificar o restaurante." };

  // Validações básicas.
  const nome = (d.nome || "").trim();
  const fone = (d.telefone || "").replace(/\D/g, "");
  if (nome.length < 2) return { ok: false as const, mensagem: "Informe seu nome." };
  if (fone.length < 10) return { ok: false as const, mensagem: "Informe um telefone com DDD (ex.: 51 99999-9999)." };
  if (!Array.isArray(d.itens) || d.itens.length === 0) return { ok: false as const, mensagem: "Seu carrinho está vazio." };
  if (d.itens.length > 60) return { ok: false as const, mensagem: "Pedido muito grande — fale com a gente no WhatsApp." };

  // Delivery ligado + dentro do horário (ou agendado num horário válido).
  const { data: cfg } = await admin.from("delivery_config").select("aberto, config").eq("empresa_id", empresaId).maybeSingle();
  if (cfg && cfg.aberto === false) return { ok: false as const, mensagem: "O delivery está fechado agora. Tente mais tarde!" };
  const hcfg = lerConfigHorarios((cfg as { config?: unknown } | null)?.config);
  const agoraMs = Date.now();
  let agendadoPara: string | null = null;
  if (d.agendadoPara) {
    const alvo = new Date(d.agendadoPara);
    const slot = slotsAgendamento(hcfg, agoraMs).find((s) => s.ms === alvo.getTime());
    if (!slot) return { ok: false as const, mensagem: "Esse horário não está mais disponível. Escolha outro." };
    if (hcfg.maxPorHorario > 0) {
      const { count } = await admin.from("delivery_pedidos").select("id", { count: "exact", head: true }).eq("agendado_para", slot.iso).neq("status", "cancelado");
      if ((count ?? 0) >= hcfg.maxPorHorario) return { ok: false as const, mensagem: `O horário das ${slot.label} lotou. Escolha outro.` };
    }
    agendadoPara = slot.iso;
  } else {
    const estado = estadoDelivery(hcfg, agoraMs);
    if (!estado.livre) {
      return { ok: false as const, mensagem: estado.proximaAbertura ? `Estamos fechados agora — abrimos ${estado.proximaAbertura.texto}. Você pode agendar!` : "Estamos fechados agora." };
    }
  }

  // Pizza fora do horário das pizzas (ou desligadas) não entra.
  if (d.itens.some((i) => i.kind === "pizza")) {
    const { data: cfgPizzas } = await admin.from("pdv_config").select("chave, valor").eq("empresa_id", empresaId).like("chave", "pizzas_%");
    const cfgP = lerConfigPizzas(Object.fromEntries(((cfgPizzas as { chave: string; valor: string }[] | null) ?? []).map((r) => [r.chave, r.valor])));
    // Agendado: vale o horário marcado.
    if (!pizzasAgora(cfgP, d.agendadoPara ? new Date(d.agendadoPara).getTime() : new Date().getTime())) return { ok: false as const, mensagem: "As pizzas não estão disponíveis agora — tire do carrinho e tente de novo." };
  }

  // Confere se todos os itens ainda estão à venda no app (canal, esgotado, horário).
  const idsPedidos = [...new Set(d.itens.flatMap((i) => ("itemId" in i && i.itemId ? [i.itemId] : [])))];
  if (idsPedidos.length) {
    const agora = new Date().getTime();
    const [{ data: its }, { data: cats }] = await Promise.all([
      admin.from("pdv_itens").select("id, nome, ativo, delivery, disponivel, horarios, categoria").in("id", idsPedidos).eq("empresa_id", empresaId),
      admin.from("pdv_categorias").select("nome, horarios, canal_app, disponivel").eq("empresa_id", empresaId),
    ]);
    const catRows = ((cats ?? []) as { nome: string; horarios: Horarios; canal_app: boolean; disponivel: boolean }[]);
    const catH = new Map(catRows.map((c) => [c.nome, c.horarios]));
    const catBloqueada = new Set(catRows.filter((c) => c.canal_app === false || c.disponivel === false).map((c) => c.nome));
    for (const it of (its ?? []) as { id: string; nome: string; ativo: boolean; delivery: boolean; disponivel: boolean; horarios: Horarios; categoria: string | null }[]) {
      const ok = it.ativo && it.delivery && it.disponivel
        && !catBloqueada.has(it.categoria || "Outros")
        && disponivelAgora(it.horarios, agora)
        && disponivelAgora(catH.get(it.categoria || "Outros") ?? null, agora);
      if (!ok) return { ok: false as const, mensagem: `"${it.nome}" não está disponível agora — tire do carrinho e tente de novo.` };
    }
  }

  // Entrega: recalcula a taxa AQUI (autoritativo) e valida o endereço.
  let taxa = 0;
  let distancia: number | null = null;
  let lat: number | null = null, lng: number | null = null;
  let areaId: string | null = null, areaNome: string | null = null;
  if (d.tipo === "entrega") {
    if (!(d.endereco?.logradouro || "").trim()) return { ok: false as const, mensagem: "Informe o endereço de entrega." };
    const calc = await calcularTaxaEntrega(admin, d.endereco ?? {});
    if (!calc.ok) return { ok: false as const, mensagem: calc.mensagem };
    if (calc.foraDeArea) return { ok: false as const, mensagem: "Esse endereço fica fora da nossa área de entrega." };
    taxa = calc.taxa; distancia = calc.distanciaKm; lat = calc.lat; lng = calc.lng;
    areaId = calc.areaId ?? null; areaNome = calc.areaNome ?? null;
  }

  // Reconhece (ou cadastra) o cliente pelo telefone — dentro da empresa, senão
  // um telefone digitado no cardápio de um restaurante acharia o cadastro de
  // cliente de outro.
  // Preferências de WhatsApp: marcar = aceita; desmarcar uma caixa que veio
  // marcada = não quer mais; não mexer = deixa como está.
  const prefs: Record<string, unknown> = {};
  if (d.aceitaPromocoes) Object.assign(prefs, { aceita_promocoes: true, aceita_promocoes_em: new Date().toISOString(), wpp_sair_em: null });
  else if (d.promoMexeu) Object.assign(prefs, { aceita_promocoes: false, aceita_promocoes_em: new Date().toISOString() });
  const nasc = (d.nascimento || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(nasc)) {
    const ano = Number(nasc.slice(0, 4));
    if (ano >= 1900 && ano <= new Date().getFullYear()) Object.assign(prefs, { nascimento: nasc, aceita_aniversario: true });
  }

  let clienteId: string | null = null;
  // SEC-08: de um aparelho que nunca pediu com este telefone, o pedido sai,
  // mas não usa o cashback da pessoa nem troca o cadastro dela (endereço só
  // preenche o que estava vazio; aceite de promoções não muda).
  const reconhecido = await aparelhoReconhece(admin, empresaId, fone);
  const { data: cli } = await admin
    .from("clientes").select("id, logradouro")
    .eq("empresa_id", empresaId)
    .in("telefone_digitos", foneCandidatos(fone)).limit(1).maybeSingle();
  if (cli?.id) {
    clienteId = cli.id as string;
    if (reconhecido && Object.keys(prefs).length) await admin.from("clientes").update(prefs).eq("id", clienteId);
    // Guarda o endereço mais recente no cadastro do cliente (hoje 0 de 3.269 têm).
    if (d.tipo === "entrega" && (d.endereco?.logradouro || "").trim() && (reconhecido || !(cli as { logradouro: string | null }).logradouro)) {
      await admin.from("clientes").update({
        logradouro: d.endereco?.logradouro ?? null, numero: d.endereco?.numero ?? null, complemento: d.endereco?.complemento ?? null,
        bairro: d.endereco?.bairro ?? null, municipio: d.endereco?.cidade ?? null, cep: d.endereco?.cep ?? null,
      }).eq("id", clienteId);
    }
  } else {
    const { data: novo } = await admin
      .from("clientes")
      .insert({
        empresa_id: empresaId,
        nome,
        telefone: fone,
        logradouro: d.endereco?.logradouro ?? null,
        numero: d.endereco?.numero ?? null,
        complemento: d.endereco?.complemento ?? null,
        bairro: d.endereco?.bairro ?? null,
        municipio: d.endereco?.cidade ?? null,
        cep: d.endereco?.cep ?? null,
        ...prefs,
      })
      .select("id")
      .single();
    clienteId = (novo?.id as string) ?? null;
  }

  // Cupom (revalidado aqui — o desconto real é calculado no core, sobre o
  // subtotal resolvido no servidor).
  let cupom: { codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null } | null = null;
  let cupomId: string | null = null;
  if ((d.cupom || "").trim()) {
    const rc = await buscarCupomValido(admin, d.cupom!, empresaId);
    if (!rc.ok) return { ok: false as const, mensagem: rc.mensagem };
    cupom = { codigo: rc.cupom.codigo, tipo: rc.cupom.tipo, valor: Number(rc.cupom.valor), minimo: rc.cupom.minimo != null ? Number(rc.cupom.minimo) : null };
    cupomId = rc.cupom.id;
    // DEL-11: "uma vez por cliente" (pelo telefone), sem contar pedido cancelado.
    if (rc.cupom.uma_vez_por_cliente) {
      const { count } = await admin.from("delivery_pedidos").select("id", { count: "exact", head: true })
        // O telefone do pedido fica só em números, com ou sem o 55 e o 9: confere todas as formas.
        .eq("empresa_id", empresaId).eq("cupom_id", cupomId).neq("status", "cancelado")
        .in("telefone", foneCandidatos(fone).flatMap((t) => [t, `55${t}`]));
      if ((count ?? 0) > 0) return { ok: false as const, mensagem: `Você já usou o cupom ${rc.cupom.codigo}. Ele vale uma vez por cliente.` };
    }
    // DEL-11: o uso é somado no banco ANTES do pedido, conferindo o limite —
    // dois pedidos ao mesmo tempo não passam mais do "máx. de usos".
    const { data: reservou } = await admin.rpc("cupom_usar", { p_cupom: cupomId });
    if (reservou !== true) return { ok: false as const, mensagem: "Esse cupom esgotou." };
  }

  const r = await criarPedidoDeliveryCore(
    admin,
    {
      clienteId,
      nome,
      telefone: fone,
      tipo: d.tipo,
      endereco: d.tipo === "entrega" ? d.endereco : undefined,
      distanciaKm: distancia,
      lat, lng,
      taxaEntrega: taxa,
      desconto: 0,
      formaPagamento: d.formaPagamento,
      trocoPara: d.trocoPara ?? null,
      origem: "app",
      observacao: d.observacao,
      itens: d.itens,
      agendadoPara,
      areaId, areaNome,
    },
    { status: "pendente", atendenteId: null, criadoPor: null, cupom, pedidoMinimo: hcfg.pedidoMinimo, empresaId, usarCashback: !!d.usarCashback && reconhecido },
  );
  if (!r.ok) {
    if (cupomId) await admin.rpc("cupom_devolver", { p_cupom: cupomId });
    return r;
  }
  if (cupomId) await admin.from("delivery_pedidos").update({ cupom_id: cupomId }).eq("id", r.id);
  // SEC-08: o aparelho que fez o pedido passa a ver os dados deste telefone.
  await lembrarAparelho(admin, empresaId, fone, r.id);
  await avisarPedido(r.id, "recebido");
  // Veio pelo link de uma campanha: marca o pedido (resultado da campanha).
  if (d.campanhaId && /^[0-9a-f-]{36}$/i.test(d.campanhaId)) {
    const { data: camp } = await admin.from("wpp_campanhas").select("id").eq("id", d.campanhaId).eq("empresa_id", empresaId).maybeSingle();
    if (camp) await admin.from("delivery_pedidos").update({ campanha_id: d.campanhaId }).eq("id", r.id);
  }

  // Pix online: cria a cobrança e devolve o copia-e-cola pro QR na tela.
  let pix: { copiaECola: string } | null = null;
  // Virou pedido: o carrinho deste telefone não conta mais como abandonado.
  await admin.from("vitrine_carrinhos").update({ fechado_em: new Date().toISOString() }).eq("empresa_id", empresaId).eq("telefone", fone);

  if (d.formaPagamento === "Pix online" && pixConfigurado() && (r.total ?? 0) > 0) {
    try {
      const cob = await criarCobrancaPix({
        txid: gerarTxid(),
        valor: r.total!,
        nomeDevedor: nome,
        descricao: `Pedido ${(await empresaAtual())?.nome ?? ""} #${r.numero ?? ""}`.replace(/\s+/g, " ").trim(),
      });
      // DEL-03: a cobrança do app fica junto das do caixa (lista de Pix e estorno).
      // Sem esse registro o Pix pago nunca acharia o valor pro caixa: cancela a
      // cobrança no banco e o pedido segue como Pix na entrega.
      const registrou = await registrarCobrancaApp(admin, { empresaId, txid: cob.txid, valor: r.total!, copiaECola: cob.copiaECola, descricao: `Delivery #${r.numero ?? "?"} · ${nome} (app)` });
      if (!registrou) {
        try { await cancelarCobrancaPix(cob.txid); } catch { /* fica sem QR na tela de qualquer jeito */ }
        throw new Error("cobrança sem registro");
      }
      await admin.from("delivery_pedidos").update({
        pix_txid: cob.txid,
        pix_copia_cola: cob.copiaECola,
        pix_status: "aguardando",
        pix_criado_em: new Date().toISOString(),
      }).eq("id", r.id);
      pix = { copiaECola: cob.copiaECola };
    } catch {
      // Cobrança falhou (API fora/credencial) — pedido segue como Pix na entrega.
      await admin.from("delivery_pedidos").update({ forma_pagamento: "Pix", pix_status: "erro" }).eq("id", r.id);
    }
  }

  return { ok: true as const, id: r.id, numero: r.numero, taxa: r.taxa ?? taxa, desconto: r.desconto ?? 0, total: r.total ?? 0, cashbackUsado: r.cashbackUsado ?? 0, pix };
}

// Confere se o Pix do pedido caiu (o app do cliente consulta a cada poucos
// segundos na tela do QR; a rotina /api/delivery/pix faz o mesmo de 5 em 5 min).
// Quando cai, o pedido vira PAGO e a venda entra no caixa (src/lib/delivery-pix.ts).
export async function verificarPixPedido(pedidoId: string) {
  const id = (pedidoId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const };
  const r = await confirmarPixApp(createAdminClient(), id);
  if (!r.ok) return { ok: false as const };
  return { ok: true as const, pago: r.pago };
}
