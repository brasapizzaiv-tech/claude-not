// Helpers do quadro de funcionários / semana de trabalho / 10% da noite.
import type { Colaborador } from "./types";

export const TURNOS: Record<NonNullable<Colaborador["turno"]>, { nome: string; icone: string }> = {
  dia: { nome: "Dia", icone: "☀️" },
  noite: { nome: "Noite", icone: "🌙" },
  ambos: { nome: "Dia e noite", icone: "☀️🌙" },
  proprietario: { nome: "Proprietário", icone: "👑" },
};

// Vínculo de cada turno. Quem é "dia e noite" pode ter carteira de dia e free de noite.
export function vinculoDoTurno(
  c: { turno?: string | null; vinculo?: string | null; vinculo_noite?: string | null },
  turno: "dia" | "noite",
): "clt" | "freelance" {
  const base = c.vinculo === "clt" ? "clt" : "freelance";
  if (turno === "noite" && c.turno === "ambos" && c.vinculo_noite) return c.vinculo_noite === "clt" ? "clt" : "freelance";
  return base;
}

export const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function deYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function somarDias(s: string, n: number) {
  const d = deYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
// Segunda-feira da semana que contém a data.
export function segundaDe(s: string) {
  const d = deYmd(s);
  const dow = d.getDay(); // 0=dom
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return ymd(d);
}
export function diasDaSemana(segunda: string) {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}
export function rotuloDia(s: string) {
  const d = deYmd(s);
  return `${DIAS_CURTO[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function rotuloSemana(segunda: string) {
  const a = deYmd(segunda);
  const b = deYmd(somarDias(segunda, 6));
  const f = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${f(a)} a ${f(b)}`;
}

// "1900-05-24" (ano desconhecido) → "24/05"; com ano real → "24/05/1990".
export function aniversarioBR(nasc: string | null | undefined) {
  if (!nasc) return "";
  const [y, m, d] = nasc.split("-");
  return Number(y) <= 1900 ? `${d}/${m}` : `${d}/${m}/${y}`;
}
// "24/05" ou "24/05/1990" → ISO (ano 1900 quando não informado).
export function parseAniversario(txt: string): string | null {
  const m = txt.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : 1900;
  if (m[3] && m[3].length === 2) y += y > 30 ? 1900 : 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function numBR(s: FormDataEntryValue | null | undefined): number | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  // "1.500,50" e "1.500" (ponto de milhar) → 1500.5 / 1500; "1500.5" → 1500.5
  const n = t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t)
    ? Number(t.replace(/\./g, "").replace(",", "."))
    : Number(t);
  return Number.isFinite(n) ? n : null;
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
