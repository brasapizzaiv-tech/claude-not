// Uma contagem de estoque pode vir em PARCELAS por item: "2 kg no congelado,
// 1,5 kg no resfriado", cada uma opcionalmente ligada a uma ETIQUETA lida pelo
// QR. O total (qtd_estoque) continua sendo o que a cotação e o CMV usam; as
// parcelas são o detalhe, guardado em contagem_itens.parcelas (jsonb).

export type Onde = "congelado" | "resfriado" | "ambiente";

export type Parcela = {
  qtd: number;
  onde: Onde | null;
  etiqueta_id?: string | null;
  etiqueta_numero?: number | null;
};

export const ONDE_ROTULO: Record<Onde, string> = {
  congelado: "Congelado",
  resfriado: "Resfriado",
  ambiente: "Ambiente",
};
export const ONDE_CURTO: Record<Onde, string> = { congelado: "cong.", resfriado: "resfr.", ambiente: "amb." };
export const ONDES: Onde[] = ["congelado", "resfriado", "ambiente"];

export function ehOnde(v: unknown): v is Onde {
  return v === "congelado" || v === "resfriado" || v === "ambiente";
}

// Lê o jsonb do banco com tolerância (nunca derruba a tela por um dado torto).
export function lerParcelas(raw: unknown): Parcela[] {
  if (!Array.isArray(raw)) return [];
  const out: Parcela[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const qtd = Number(o.qtd);
    if (!Number.isFinite(qtd)) continue;
    out.push({
      qtd,
      onde: ehOnde(o.onde) ? o.onde : null,
      etiqueta_id: typeof o.etiqueta_id === "string" ? o.etiqueta_id : null,
      etiqueta_numero: Number.isFinite(Number(o.etiqueta_numero)) && o.etiqueta_numero != null ? Number(o.etiqueta_numero) : null,
    });
  }
  return out;
}

export const somaParcelas = (ps: Parcela[]) => Math.round(ps.reduce((s, p) => s + p.qtd, 0) * 1000) / 1000;

// "2 cong. · 1,5 resfr. (etiq. 128, 131)" — o resumo que o painel mostra.
export function resumoParcelas(ps: Parcela[]): string {
  if (ps.length === 0) return "";
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const porOnde = new Map<string, number>();
  for (const p of ps) {
    const k = p.onde ? ONDE_CURTO[p.onde] : "sem local";
    porOnde.set(k, (porOnde.get(k) ?? 0) + p.qtd);
  }
  const partes = [...porOnde.entries()].map(([k, v]) => `${f(v)} ${k}`);
  const etiq = ps.filter((p) => p.etiqueta_numero != null).map((p) => p.etiqueta_numero);
  return partes.join(" · ") + (etiq.length ? ` (etiq. ${etiq.join(", ")})` : "");
}
