// Geocodificação e distância para a taxa de entrega.
// Usa Google Maps quando houver GOOGLE_MAPS_API_KEY no ambiente (mais preciso,
// distância por rota). Sem a chave, cai num modo grátis: geocodifica pelo
// OpenStreetMap (Nominatim) e estima a distância em linha reta × fator de rua.
// Roda só no servidor (server actions).

export type Coord = { lat: number; lng: number };

const KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const FATOR_RUA = 1.3; // linha reta → ruas (aproximação)
const TEMPO_MS = 5000; // CRN-01: o Google/Nominatim não segura o pedido mais que isso

export function temChaveMapa() {
  return !!KEY;
}

/** "nao_achou" = o mapa respondeu e esse endereço não existe; "falhou" = o mapa não respondeu (cota, chave, rede). */
export type Geocodificado = { ok: true; coord: Coord } | { ok: false; motivo: "nao_achou" | "falhou" };

async function nominatim(q: string): Promise<Geocodificado> {
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { headers: { "User-Agent": "Motelli-Delivery/1.0" }, signal: AbortSignal.timeout(TEMPO_MS) });
    if (!r.ok) return { ok: false, motivo: "falhou" };
    const j = await r.json();
    if (Array.isArray(j) && j[0]) return { ok: true, coord: { lat: Number(j[0].lat), lng: Number(j[0].lon) } };
    return { ok: false, motivo: "nao_achou" };
  } catch {
    return { ok: false, motivo: "falhou" };
  }
}

/**
 * CRN-01: antes qualquer falha do Google (cota, cobrança, chave, rede lenta)
 * virava "não encontrei esse endereço" e o pedido era recusado. Agora só
 * ZERO_RESULTS é "não achou"; o resto tenta o Nominatim e, se ele também não
 * responder, devolve "falhou" pra tela pedir que tente de novo.
 */
export async function geocodificarDetalhado(endereco: string): Promise<Geocodificado> {
  const q = (endereco || "").trim();
  if (!q) return { ok: false, motivo: "nao_achou" };
  if (!KEY) return nominatim(q);
  try {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=br&key=${KEY}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(TEMPO_MS) });
    const j = r.ok ? await r.json() : null;
    const loc = j?.results?.[0]?.geometry?.location;
    if (j?.status === "OK" && loc) return { ok: true, coord: { lat: Number(loc.lat), lng: Number(loc.lng) } };
    if (j?.status === "ZERO_RESULTS") return { ok: false, motivo: "nao_achou" };
    console.error(`[geo] Google geocode respondeu ${r.status} ${j?.status ?? "sem status"}`);
  } catch (e) {
    console.error("[geo] Google geocode não respondeu", (e as Error)?.message);
  }
  // O Google falhou: o Nominatim é a reserva. Se ele não achar, não dá pra
  // dizer que o endereço não existe (o Google nem respondeu) → "falhou".
  const reserva = await nominatim(q);
  return reserva.ok ? reserva : { ok: false, motivo: "falhou" };
}

export async function geocodificar(endereco: string): Promise<Coord | null> {
  const g = await geocodificarDetalhado(endereco);
  return g.ok ? g.coord : null;
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Distância em km entre origem e destino (por rota no Google; linha reta × fator no fallback).
export async function distanciaKm(origem: Coord, destino: Coord): Promise<number | null> {
  try {
    if (KEY) {
      const u = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origem.lat},${origem.lng}&destinations=${destino.lat},${destino.lng}&key=${KEY}`;
      const j = await fetch(u, { signal: AbortSignal.timeout(TEMPO_MS) }).then((r) => r.json());
      const m = j?.rows?.[0]?.elements?.[0]?.distance?.value;
      if (typeof m === "number") return Math.round((m / 1000) * 10) / 10;
    }
  } catch {
    // cai no fallback
  }
  return Math.round(haversineKm(origem, destino) * FATOR_RUA * 10) / 10;
}
