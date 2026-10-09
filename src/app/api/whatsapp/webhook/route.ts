import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "@/lib/whatsapp";

// Status da Meta → status do envio de campanha/gatilho (nunca volta pra trás:
// "lida" pode chegar antes de "entregue").
const PASSO: Record<string, { status: string; nivel: number; campo?: string }> = {
  sent: { status: "enviada", nivel: 1 },
  delivered: { status: "entregue", nivel: 2, campo: "entregue_em" },
  read: { status: "lida", nivel: 3, campo: "lido_em" },
  failed: { status: "falha", nivel: 9 },
};
const NIVEL: Record<string, number> = { fila: 0, enviada: 1, entregue: 2, lida: 3, falha: 9, pulada: 9 };
// Pedidos pra sair da lista (texto ou botão "Parar promoções" da Meta).
const SAIR = /^(sair|parar|pare|stop|cancelar|descadastrar|nao quero|não quero|parar promo(c|ç)(o|õ)es|stop promotions)[.!]*$/i;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook do WhatsApp (Meta Cloud API).
// GET: a Meta confere a URL — responde o hub.challenge se o token bater com
//      WHATSAPP_VERIFY_TOKEN (a senha que o Rafael inventou na Vercel).
// POST: status das mensagens enviadas (sent/delivered/read/failed) e
//       mensagens que o cliente manda pra gente. Tudo gravado em
//       whatsapp_mensagens; assinatura conferida se WHATSAPP_APP_SECRET existir.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const esperado = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  if (!esperado) return new Response("WHATSAPP_VERIFY_TOKEN não configurado", { status: 503 });
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === esperado) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("token inválido", { status: 403 });
}

export async function POST(req: Request) {
  const bruto = await req.text();
  const segredo = (process.env.WHATSAPP_APP_SECRET || "").trim();
  if (segredo) {
    const assin = req.headers.get("x-hub-signature-256") || "";
    const esperado = "sha256=" + createHmac("sha256", segredo).update(bruto).digest("hex");
    const a = Buffer.from(assin), b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("assinatura inválida", { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(bruto); } catch { return new Response("json inválido", { status: 400 }); }

  const admin = createAdminClient();
  type Status = { id: string; status: string; errors?: { title?: string; message?: string }[] };
  type Msg = { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } };
  type Entry = { changes?: { value?: { statuses?: Status[]; messages?: Msg[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } }[] };
  const entries = ((body as { entry?: Entry[] })?.entry ?? []);
  const agora = new Date().toISOString();

  for (const e of entries) {
    for (const ch of e.changes ?? []) {
      const v = ch.value ?? {};
      // Status dos avisos que mandamos.
      for (const s of v.statuses ?? []) {
        await admin.from("whatsapp_mensagens")
          .update({ status: s.status, erro: s.errors?.[0] ? String(s.errors[0].message ?? s.errors[0].title ?? "").slice(0, 300) : null, atualizado_em: agora })
          .eq("wa_id", s.id);
        const passo = PASSO[s.status];
        if (passo) {
          const { data: env } = await admin.from("wpp_envios").select("id, status").eq("wa_id", s.id).maybeSingle();
          const atual = (env as { id: string; status: string } | null);
          if (atual && passo.nivel > (NIVEL[atual.status] ?? 0) && atual.status !== "falha") {
            await admin.from("wpp_envios").update({
              status: passo.status,
              ...(passo.campo ? { [passo.campo]: agora } : {}),
              ...(passo.status === "lida" ? { entregue_em: agora } : {}),
              ...(passo.status === "falha" ? { erro: String(s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "falhou").slice(0, 300) } : {}),
            }).eq("id", atual.id);
          }
        }
      }
      // Mensagens do cliente (resposta ao aviso, dúvida…): ficam registradas;
      // a tela de atendimento vem depois.
      const nomes = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`;
        // Liga à última conversa: o pedido mais recente desse telefone (7 dias).
        const fone = m.from.replace(/\D/g, "");
        const desde = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: ped } = await admin.from("delivery_pedidos").select("id").eq("telefone", fone.startsWith("55") ? fone.slice(2) : fone).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(1).maybeSingle();
        // "SAIR": tira das campanhas e dos automáticos de marketing, e confirma.
        if (SAIR.test(texto.trim().normalize("NFC"))) {
          const { data: n } = await admin.rpc("wpp_marcar_sair", { p_fone: m.from });
          if (Number(n ?? 0) > 0) await enviarTexto(m.from, "Pronto, você não vai mais receber promoções da Brasa por aqui. Os avisos dos seus pedidos continuam chegando normalmente.");
        }
        await admin.from("whatsapp_mensagens").insert({
          direcao: "entrada", telefone: m.from, texto: texto.slice(0, 4000), wa_id: m.id, status: "received",
          pedido_id: (ped as { id: string } | null)?.id ?? null,
          payload: { nome: nomes.get(m.from) ?? null, tipo: m.type },
        });
      }
    }
  }
  return new Response("ok", { status: 200 });
}
