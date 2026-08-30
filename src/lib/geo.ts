// Geocodificação e distância para a taxa de entrega.
// Usa Google Maps quando houver GOOGLE_MAPS_API_KEY no ambiente (mais preciso,
// distância por rota). Sem a chave, cai num modo grátis: geocodifica pelo
// OpenStreetMap (Nominatim) e estima a distância em linha reta × fator de rua.
// Roda só no servidor (server actions).

export type Coord = { lat: number; lng: number };

const KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const FATOR_RUA = 1.3; // linha reta → ruas (aproximação)

export function temChaveMapa() {
  return !!KEY;
}

export async function geocodificar(endereco: string): Promise<Coord | null> {
  const q = (endereco || "").trim();
  if (!q) return null;
  try {
    if (KEY) {
      const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=br&key=${KEY}`;
      const j = await fetch(u).then((r) => r.json());
      const loc = j?.results?.[0]?.geometry?.location;
      return loc ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null;
    }
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    const j = await fetch(u, { headers: { "User-Agent": "BrasaRestaurante-Delivery/1.0" } }).then((r) => r.json());
    if (Array.isArray(j) && j[0]) return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
    return null;
  } catch {
    return null;
  }
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
      const j = await fetch(u).then((r) => r.json());
      const m = j?.rows?.[0]?.elements?.[0]?.distance?.value;
      if (typeof m === "number") return Math.round((m / 1000) * 10) / 10;
    }
  } catch {
    // cai no fallback
  }
  return Math.round(haversineKm(origem, destino) * FATOR_RUA * 10) / 10;
}
