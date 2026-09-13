// Áreas de entrega (polígonos no mapa) e promoções da taxa — regras puras,
// sem servidor, usadas pelo core do pedido, pelo /pedir e pelos testes.

export type AreaEntrega = {
  id: string;
  nome: string;
  cor: string;
  valor: number;
  taxa_motoboy: number | null;
  tempo_min: number | null;
  poligono: [number, number][]; // [lat, lng]
  ativo: boolean;
};

export type PromoTele = {
  id: string;
  nome: string;
  tipo: "gratis" | "percent" | "valor";
  valor: number;
  area_ids: string[] | null;   // null = todas
  pedido_minimo: number | null;
  dias: number[] | null;       // null = todos (0 = domingo)
  hora_ini: string | null;     // "18:30"
  hora_fim: string | null;
  validade: string | null;     // "YYYY-MM-DD"
  ativo: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Ponto dentro do polígono (ray casting). Polígono com < 3 pontos nunca contém.
export function dentroDoPoligono(lat: number, lng: number, poligono: [number, number][]): boolean {
  if (!Array.isArray(poligono) || poligono.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i], [yj, xj] = poligono[j];
    const cruza = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

// Primeira área ativa (na ordem cadastrada) que contém o ponto.
export function areaDoPonto(areas: AreaEntrega[], lat: number, lng: number): AreaEntrega | null {
  for (const a of areas) if (a.ativo && dentroDoPoligono(lat, lng, a.poligono)) return a;
  return null;
}

function partesSP(ms: number) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, dow: dow < 0 ? 0 : dow, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// A promoção vale agora, pra esta área e este subtotal?
export function promoVale(p: PromoTele, ctx: { areaId: string | null; subtotal: number; agora: number }): boolean {
  if (!p.ativo) return false;
  const t = partesSP(ctx.agora);
  if (p.validade && p.validade < t.iso) return false;
  if (p.dias && p.dias.length > 0 && !p.dias.includes(t.dow)) return false;
  if (p.hora_ini && p.hora_fim) {
    const a = minutos(p.hora_ini), b = minutos(p.hora_fim);
    const ok = a <= b ? t.min >= a && t.min < b : t.min >= a || t.min < b; // cruza meia-noite
    if (!ok) return false;
  }
  if (p.area_ids && p.area_ids.length > 0 && (!ctx.areaId || !p.area_ids.includes(ctx.areaId))) return false;
  if (p.pedido_minimo != null && ctx.subtotal < Number(p.pedido_minimo)) return false;
  return true;
}

// Aplica a melhor promoção (maior desconto) sobre a taxa. Devolve a taxa
// final e o motivo pra mostrar no pedido/cliente.
export function aplicarPromoTele(taxa: number, promos: PromoTele[], ctx: { areaId: string | null; subtotal: number; agora: number }) {
  let melhor: { taxa: number; promo: PromoTele } | null = null;
  for (const p of promos) {
    if (!promoVale(p, ctx)) continue;
    const nova = p.tipo === "gratis" ? 0 : p.tipo === "percent" ? r2(taxa * (1 - Number(p.valor) / 100)) : Math.max(0, r2(taxa - Number(p.valor)));
    if (!melhor || nova < melhor.taxa) melhor = { taxa: Math.max(0, nova), promo: p };
  }
  if (!melhor || melhor.taxa >= taxa) return { taxa: r2(taxa), motivo: null as string | null, promo: null as PromoTele | null };
  const m = melhor.promo;
  const motivo = m.tipo === "gratis" ? `Entrega grátis — ${m.nome}` : `Desconto na entrega — ${m.nome}`;
  return { taxa: melhor.taxa, motivo, promo: m };
}

// Promoções que PODEM valer hoje nesta área (pra avisar "grátis acima de R$ X").
export function promosPossiveisHoje(promos: PromoTele[], areaId: string | null, agora: number): PromoTele[] {
  return promos.filter((p) => promoVale(p, { areaId, subtotal: Number.MAX_SAFE_INTEGER, agora }));
}
