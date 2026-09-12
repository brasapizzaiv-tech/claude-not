import { createAdminClient } from "@/lib/supabase/admin";
import { addDiasIso, diaSemanaIso } from "@/lib/dia-cardapio";

// Cardápio das marmitas Kern numa data — lê o MESMO cadastro do app das
// marmitas (mkt_config.cardapios: 4 semanas em rotação + programação por
// segunda-feira). A regra de "qual semana vale" é a mesma de
// src/app/api/marmitas/[[...rota]]/route.ts (semanaPara), copiada aqui porque
// rota não se importa de fora.

export type KernDia = {
  data: string;
  pratos: string[];
  proteinas: string[];
  salada: string;
  quantidade: number;     // pedidos já feitos pra esse dia
  horaEntrega: string;    // "11:00"
  nomeConvenio: string;
  bloqueado: string | null; // motivo (feriado) quando não tem marmita
};

type Semana = { id: string; nome: string; dias: Record<string, { pratos?: string[]; proteinas?: string[]; salada?: string }> };
type Cardapios = { semanas: Semana[]; ativo: string | null; programacao?: Record<string, string> };

const CHAVE_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function segundaDe(iso: string) {
  const dow = diaSemanaIso(iso);
  return addDiasIso(iso, dow === 0 ? -6 : 1 - dow);
}
function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function semanaPara(c: Cardapios, iso: string): Semana | null {
  const semanas = Array.isArray(c.semanas) ? c.semanas : [];
  if (!semanas.length) return null;
  const seg = segundaDe(iso);
  let ancDesde: string | null = null, ancId: string | null = null;
  for (const [desde, id] of Object.entries(c.programacao || {})) {
    if (desde <= seg && (!ancDesde || desde > ancDesde)) { ancDesde = desde; ancId = id; }
  }
  if (!ancDesde) { ancDesde = segundaDe(hojeSP()); ancId = c.ativo; }
  const idx = semanas.findIndex((s) => s.id === ancId);
  if (idx < 0) return null;
  const dif = Math.round((Date.parse(seg + "T00:00:00Z") - Date.parse(ancDesde + "T00:00:00Z")) / (7 * 86400000));
  const n = semanas.length;
  return semanas[(((idx + dif) % n) + n) % n];
}

export async function kernDoDia(iso: string): Promise<KernDia> {
  const admin = createAdminClient();
  const [{ data: cfgRows }, { count }] = await Promise.all([
    admin.from("mkt_config").select("chave, valor").in("chave", ["cardapios", "horaEntrega", "nomeConvenio", "bloqueios"]),
    admin.from("mkt_pedidos").select("id", { count: "exact", head: true }).eq("data", iso),
  ]);
  const m: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) m[r.chave] = r.valor;
  let cardapios: Cardapios = { semanas: [], ativo: null };
  try { cardapios = JSON.parse(m.cardapios || "{}") as Cardapios; } catch { /* sem cadastro */ }
  let bloqueado: string | null = null;
  try {
    const b = JSON.parse(m.bloqueios || "[]") as { data?: string; motivo?: string }[];
    const hit = Array.isArray(b) ? b.find((x) => x?.data === iso) : null;
    if (hit) bloqueado = String(hit.motivo || "sem marmita");
  } catch { /* sem bloqueios */ }
  const sem = semanaPara(cardapios, iso);
  const dia = sem?.dias?.[CHAVE_DIA[diaSemanaIso(iso)]];
  return {
    data: iso,
    pratos: (dia?.pratos ?? []).map(String).filter(Boolean),
    proteinas: (dia?.proteinas ?? []).map(String).filter(Boolean),
    salada: String(dia?.salada ?? "").trim(),
    quantidade: count ?? 0,
    horaEntrega: m.horaEntrega || "11:00",
    nomeConvenio: m.nomeConvenio || "Kern",
    bloqueado,
  };
}
