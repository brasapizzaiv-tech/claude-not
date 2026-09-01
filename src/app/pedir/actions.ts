"use server";

// Ações públicas do app do cliente (/pedir). Sem login: usa o admin client no
// servidor (padrão dos apps por token). TODO preço/taxa é recalculado aqui —
// nada do que vem do navegador é confiado.
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularTaxaEntrega, criarPedidoDeliveryCore, type LinhaPedido } from "@/lib/delivery-core";
import { disponivelAgora, type Horarios } from "@/lib/disponibilidade";
import { pixConfigurado, criarCobrancaPix, consultarCobrancaPix, gerarTxid } from "@/lib/pix-sicredi";

export type { LinhaPedido } from "@/lib/delivery-core";

// Taxa de entrega ao digitar o endereço (exibição pro cliente).
export async function calcularEntregaPublico(endereco: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; cep?: string;
}) {
  const admin = createAdminClient();
  return calcularTaxaEntrega(admin, endereco);
}

// Últimos pedidos do cliente (pelo telefone) — mostra o mínimo: nº, data,
// status, tipo e total, com o link de acompanhamento (id).
export async function meusPedidos(telefone: string) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("delivery_pedidos")
    .select("id, criado_em, status, tipo, taxa_entrega, desconto, comanda_id, pdv_comandas(numero)")
    .eq("telefone", fone)
    .order("criado_em", { ascending: false })
    .limit(10);
  const rows = (data as unknown as {
    id: string; criado_em: string; status: string; tipo: string; taxa_entrega: number; desconto: number;
    comanda_id: string | null; pdv_comandas: { numero: number } | { numero: number }[] | null;
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
      numero: c?.numero ?? null,
      criadoEm: r.criado_em,
      status: r.status,
      tipo: r.tipo,
      total: Math.round(((somaDe.get(r.comanda_id ?? "") ?? 0) + taxa - Number(r.desconto || 0)) * 100) / 100,
    };
  });
}

// Valida um cupom e devolve os dados pra prévia do desconto no carrinho.
type CupomRow = { id: string; codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null; validade: string | null; max_usos: number | null; usos: number; ativo: boolean };
async function buscarCupomValido(admin: ReturnType<typeof createAdminClient>, codigo: string) {
  const cod = (codigo || "").trim().toUpperCase();
  if (!cod) return { ok: false as const, mensagem: "Digite o código do cupom." };
  const { data } = await admin.from("cupons").select("*").ilike("codigo", cod).maybeSingle();
  const c = data as CupomRow | null;
  if (!c || !c.ativo) return { ok: false as const, mensagem: "Cupom não encontrado ou desativado." };
  if (c.validade && c.validade < new Date().toISOString().slice(0, 10)) return { ok: false as const, mensagem: "Esse cupom venceu. 😕" };
  if (c.max_usos != null && c.usos >= c.max_usos) return { ok: false as const, mensagem: "Esse cupom esgotou." };
  return { ok: true as const, cupom: c };
}

export async function validarCupomPublico(codigo: string) {
  const admin = createAdminClient();
  const r = await buscarCupomValido(admin, codigo);
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
}) {
  const admin = createAdminClient();

  // Validações básicas.
  const nome = (d.nome || "").trim();
  const fone = (d.telefone || "").replace(/\D/g, "");
  if (nome.length < 2) return { ok: false as const, mensagem: "Informe seu nome." };
  if (fone.length < 10) return { ok: false as const, mensagem: "Informe um telefone com DDD (ex.: 51 99999-9999)." };
  if (!Array.isArray(d.itens) || d.itens.length === 0) return { ok: false as const, mensagem: "Seu carrinho está vazio." };
  if (d.itens.length > 60) return { ok: false as const, mensagem: "Pedido muito grande — fale com a gente no WhatsApp." };

  // Delivery precisa estar aberto.
  const { data: cfg } = await admin.from("delivery_config").select("aberto").eq("id", 1).maybeSingle();
  if (cfg && cfg.aberto === false) return { ok: false as const, mensagem: "O delivery está fechado agora. Tente mais tarde!" };

  // Confere se todos os itens ainda estão à venda no app (canal, esgotado, horário).
  const idsPedidos = [...new Set(d.itens.flatMap((i) => ("itemId" in i && i.itemId ? [i.itemId] : [])))];
  if (idsPedidos.length) {
    const agora = new Date().getTime();
    const [{ data: its }, { data: cats }] = await Promise.all([
      admin.from("pdv_itens").select("id, nome, ativo, delivery, disponivel, horarios, categoria").in("id", idsPedidos),
      admin.from("pdv_categorias").select("nome, horarios, canal_app"),
    ]);
    const catRows = ((cats ?? []) as { nome: string; horarios: Horarios; canal_app: boolean }[]);
    const catH = new Map(catRows.map((c) => [c.nome, c.horarios]));
    const catBloqueada = new Set(catRows.filter((c) => c.canal_app === false).map((c) => c.nome));
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
  if (d.tipo === "entrega") {
    if (!(d.endereco?.logradouro || "").trim()) return { ok: false as const, mensagem: "Informe o endereço de entrega." };
    const calc = await calcularTaxaEntrega(admin, d.endereco ?? {});
    if (!calc.ok) return { ok: false as const, mensagem: calc.mensagem };
    if (calc.foraDeArea) return { ok: false as const, mensagem: "Esse endereço fica fora da nossa área de entrega. 😕" };
    taxa = calc.taxa; distancia = calc.distanciaKm; lat = calc.lat; lng = calc.lng;
  }

  // Reconhece (ou cadastra) o cliente pelo telefone.
  let clienteId: string | null = null;
  const { data: cli } = await admin
    .from("clientes").select("id").ilike("telefone", `%${fone}%`).limit(1).maybeSingle();
  if (cli?.id) {
    clienteId = cli.id as string;
  } else {
    const { data: novo } = await admin
      .from("clientes")
      .insert({
        nome,
        telefone: fone,
        logradouro: d.endereco?.logradouro ?? null,
        numero: d.endereco?.numero ?? null,
        complemento: d.endereco?.complemento ?? null,
        bairro: d.endereco?.bairro ?? null,
        municipio: d.endereco?.cidade ?? null,
        cep: d.endereco?.cep ?? null,
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
    const rc = await buscarCupomValido(admin, d.cupom!);
    if (!rc.ok) return { ok: false as const, mensagem: rc.mensagem };
    cupom = { codigo: rc.cupom.codigo, tipo: rc.cupom.tipo, valor: Number(rc.cupom.valor), minimo: rc.cupom.minimo != null ? Number(rc.cupom.minimo) : null };
    cupomId = rc.cupom.id;
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
    },
    { status: "pendente", atendenteId: null, criadoPor: null, cupom },
  );
  if (!r.ok) return r;
  if (cupomId) {
    const { data: cAtual } = await admin.from("cupons").select("usos").eq("id", cupomId).single();
    await admin.from("cupons").update({ usos: Number((cAtual as { usos: number } | null)?.usos ?? 0) + 1 }).eq("id", cupomId);
  }

  // Pix online: cria a cobrança e devolve o copia-e-cola pro QR na tela.
  let pix: { copiaECola: string } | null = null;
  if (d.formaPagamento === "Pix online" && pixConfigurado() && (r.total ?? 0) > 0) {
    try {
      const cob = await criarCobrancaPix({
        txid: gerarTxid(),
        valor: r.total!,
        nomeDevedor: nome,
        descricao: `Pedido Brasa #${r.numero ?? ""}`.trim(),
      });
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

  return { ok: true as const, id: r.id, numero: r.numero, taxa, desconto: r.desconto ?? 0, total: r.total ?? 0, pix };
}

// Confere se o Pix do pedido caiu (o app do cliente consulta a cada poucos
// segundos na tela do QR). Quando cai, o pedido vira PAGO sozinho.
export async function verificarPixPedido(pedidoId: string) {
  const admin = createAdminClient();
  const { data: ped } = await admin
    .from("delivery_pedidos")
    .select("id, pix_txid, pix_status, pago")
    .eq("id", (pedidoId || "").trim())
    .maybeSingle();
  const p = ped as { id: string; pix_txid: string | null; pix_status: string | null; pago: boolean } | null;
  if (!p?.pix_txid) return { ok: false as const };
  if (p.pago || p.pix_status === "pago") return { ok: true as const, pago: true };
  try {
    const c = await consultarCobrancaPix(p.pix_txid);
    if (c.pago) {
      await admin.from("delivery_pedidos").update({ pago: true, pix_status: "pago", forma_pagamento: "Pix (app)" }).eq("id", p.id);
      return { ok: true as const, pago: true };
    }
    return { ok: true as const, pago: false };
  } catch {
    return { ok: true as const, pago: false };
  }
}
