import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rastreamento em SEGUNDO PLANO dos entregadores, via app Traccar Client
// (Android/iOS, gratuito). No app: URL do servidor =
//   https://www.brasarestaurante.com.br/api/rastreio
// e "Identificador do dispositivo" = o token do entregador (o mesmo do link).
// O Traccar manda (GET ou POST, protocolo OsmAnd):
//   ?id=TOKEN&lat=-29.59&lon=-51.16&timestamp=1700000000&speed=..&bearing=..&accuracy=..&batt=..
// Grava a última posição no entregador (mapa do board) e o rastro do dia.
async function tratar(req: Request) {
  const u = new URL(req.url);
  let q = u.searchParams;
  if (req.method === "POST") {
    // Traccar pode mandar no corpo (form) em vez da query.
    const ct = req.headers.get("content-type") || "";
    try {
      if (ct.includes("application/x-www-form-urlencoded")) {
        const body = await req.text();
        const p = new URLSearchParams(body);
        if (p.get("id")) q = p;
      } else if (ct.includes("application/json")) {
        const j = (await req.json()) as Record<string, unknown>;
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(j)) if (v != null) p.set(k, String(v));
        if (p.get("id")) q = p;
      }
    } catch { /* fica com a query */ }
  }
  const id = (q.get("id") || q.get("deviceid") || "").trim();
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lon") ?? q.get("lng"));
  if (!/^[0-9a-f]{16,64}$/i.test(id)) return new Response("id inválido", { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return new Response("posição inválida", { status: 400 });

  const admin = createAdminClient();
  const { data: boy } = await admin.from("entregadores").select("id, ativo").eq("token", id).maybeSingle();
  const b = boy as { id: string; ativo: boolean } | null;
  if (!b || !b.ativo) return new Response("entregador não encontrado", { status: 404 });

  const ts = q.get("timestamp");
  // timestamp pode vir em segundos (unix) ou ISO; se for velho demais (fila offline do app), guarda no rastro mas não vira "última posição".
  let em = new Date();
  if (ts) { const n = Number(ts); const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(ts); if (!Number.isNaN(d.getTime())) em = d; }
  const recente = Date.now() - em.getTime() < 5 * 60000;
  const precisao = Number(q.get("accuracy") ?? q.get("hdop"));
  await Promise.all([
    recente ? admin.from("entregadores").update({ ultima_lat: lat, ultima_lng: lng, ultima_pos_em: em.toISOString() }).eq("id", b.id) : Promise.resolve(),
    admin.from("entregador_posicoes").insert({ entregador_id: b.id, lat, lng, precisao: Number.isFinite(precisao) ? Math.round(precisao) : null, em: em.toISOString() }),
  ]);
  return new Response("OK", { status: 200 });
}

export async function GET(req: Request) { return tratar(req); }
export async function POST(req: Request) { return tratar(req); }
