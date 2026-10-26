// Item vendido por kg (migration 0259): o peso digitado vira a quantidade.
// Sem import: telas e servidor usam igual.

/** "0,452" / "0.452" / "452g" / "452" (gramas quando passa de 20) → 0.452 kg. Inválido = null. */
export function lerPesoKg(txt: string): number | null {
  const t = String(txt ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  const gramas = t.endsWith("g") && !t.endsWith("kg");
  const n = Number(t.replace(/kg$|g$/, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = gramas || n > 20 ? n / 1000 : n;
  return kg > 0 && kg <= 20 ? Math.round(kg * 1000) / 1000 : null;
}

/** 0.452 → "0,452 kg". */
export const fmtKg = (kg: number) => `${kg.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
