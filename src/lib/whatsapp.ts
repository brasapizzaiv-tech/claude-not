import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp oficial (Meta Cloud API). Fica "dormindo" até as variáveis existirem
// na Vercel: WHATSAPP_TOKEN (token permanente do usuário do sistema),
// WHATSAPP_PHONE_ID (ID do número), WHATSAPP_VERIFY_TOKEN (senha do webhook),
// WHATSAPP_APP_SECRET (opcional, valida a assinatura do webhook).
// Nada de segredo é logado nem devolvido pra tela.

const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";
const API = "https://graph.facebook.com/v21.0";
const SITE = "https://www.brasarestaurante.com.br";

export function whatsappConfigurado() {
  return !!(TOKEN && PHONE_ID);
}

// 55 + DDD + número. Celular brasileiro tem 9 dígitos depois do DDD; se vier
// com 8 (cadastro antigo), põe o 9 na frente.
export function telefoneWa(t: string | null | undefined): string | null {
  let d = String(t ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length !== 11) return null;
  return "55" + d;
}

type Resultado = { ok: true; waId: string } | { ok: false; erro: string };

// Envia um modelo aprovado (categoria Utilidade) com as variáveis do corpo.
export async function enviarTemplate(telefone: string, template: string, params: string[], pedidoId?: string | null, idioma = "pt_BR"): Promise<Resultado> {
  const admin = createAdminClient();
  const to = telefoneWa(telefone);
  if (!to) return { ok: false, erro: "telefone inválido" };
  if (!whatsappConfigurado()) return { ok: false, erro: "WhatsApp não configurado" };
  const corpo = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: idioma },
      components: params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p).slice(0, 1000) })) }] : [],
    },
  };
  try {
    const r = await fetch(`${API}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    const waId = j.messages?.[0]?.id ?? null;
    await admin.from("whatsapp_mensagens").insert({
      direcao: "saida", telefone: to, template, texto: params.join(" | "), pedido_id: pedidoId ?? null,
      wa_id: waId, status: r.ok ? "accepted" : "failed", erro: r.ok ? null : (j.error?.message ?? `HTTP ${r.status}`).slice(0, 300),
    });
    if (!r.ok || !waId) return { ok: false, erro: j.error?.message ?? `HTTP ${r.status}` };
    return { ok: true, waId };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falha de rede";
    await admin.from("whatsapp_mensagens").insert({ direcao: "saida", telefone: to, template, texto: params.join(" | "), pedido_id: pedidoId ?? null, status: "failed", erro: erro.slice(0, 300) });
    return { ok: false, erro };
  }
}

// Texto livre — só vale dentro da janela de 24 h depois de o cliente falar com a gente.
export async function enviarTexto(telefone: string, texto: string, pedidoId?: string | null): Promise<Resultado> {
  const admin = createAdminClient();
  const to = telefoneWa(telefone);
  if (!to) return { ok: false, erro: "telefone inválido" };
  if (!whatsappConfigurado()) return { ok: false, erro: "WhatsApp não configurado" };
  try {
    const r = await fetch(`${API}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto.slice(0, 4000) } }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    const waId = j.messages?.[0]?.id ?? null;
    await admin.from("whatsapp_mensagens").insert({ direcao: "saida", telefone: to, texto, pedido_id: pedidoId ?? null, wa_id: waId, status: r.ok ? "accepted" : "failed", erro: r.ok ? null : (j.error?.message ?? `HTTP ${r.status}`).slice(0, 300) });
    if (!r.ok || !waId) return { ok: false, erro: j.error?.message ?? `HTTP ${r.status}` };
    return { ok: true, waId };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" };
  }
}

// ---------- avisos do pedido ----------
// Modelos (nomes exatos cadastrados na Meta, categoria Utilidade, pt_BR):
//   pedido_recebido   {{1}} nome · {{2}} nº · {{3}} link
//   pedido_confirmado {{1}} nº · {{2}} previsão · {{3}} link
//   pedido_saiu       {{1}} nº · {{2}} entregador
//   pedido_entregue   {{1}} nº
export type EventoPedido = "recebido" | "confirmado" | "saiu" | "entregue";

const hhmmSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// Manda o aviso de um evento do pedido, uma vez só (marca em wpp_avisos).
// Nunca derruba a ação que chamou: erro vira registro na tabela e segue.
export async function avisarPedido(pedidoId: string, evento: EventoPedido) {
  if (!whatsappConfigurado()) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("delivery_pedidos")
      .select("id, nome, telefone, tipo, previsao_em, agendado_para, wpp_avisos, entregador_id, pdv_comandas(numero), entregadores(nome)")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!data) return;
    const p = data as {
      id: string; nome: string; telefone: string | null; tipo: string; previsao_em: string | null; agendado_para: string | null;
      wpp_avisos: Record<string, string> | null; pdv_comandas: { numero: number } | { numero: number }[] | null; entregadores: { nome: string } | { nome: string }[] | null;
    };
    const avisos = p.wpp_avisos ?? {};
    if (avisos[evento]) return; // já foi
    if (!p.telefone) return;
    const com = Array.isArray(p.pdv_comandas) ? p.pdv_comandas[0] : p.pdv_comandas;
    const boy = Array.isArray(p.entregadores) ? p.entregadores[0] : p.entregadores;
    const numero = String(com?.numero ?? "");
    const link = `${SITE}/pedir/acompanhar/${p.id}`;
    const primeiroNome = (p.nome || "").trim().split(/\s+/)[0] || "cliente";
    let r: Resultado;
    if (evento === "recebido") r = await enviarTemplate(p.telefone, "pedido_recebido", [primeiroNome, numero, link], p.id);
    else if (evento === "confirmado") {
      const quando = p.agendado_para ? `agendado pras ${hhmmSP(p.agendado_para)}` : p.previsao_em ? `${p.tipo === "retirada" ? "pronto" : "chega"} por volta das ${hhmmSP(p.previsao_em)}` : "em breve";
      r = await enviarTemplate(p.telefone, "pedido_confirmado", [numero, quando, link], p.id);
    } else if (evento === "saiu") r = await enviarTemplate(p.telefone, "pedido_saiu", [numero, boy?.nome ?? "nosso entregador"], p.id);
    else r = await enviarTemplate(p.telefone, "pedido_entregue", [numero], p.id);
    if (r.ok) await admin.from("delivery_pedidos").update({ wpp_avisos: { ...avisos, [evento]: new Date().toISOString() } }).eq("id", p.id);
  } catch { /* nunca derruba o pedido por causa do aviso */ }
}
