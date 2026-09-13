import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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
