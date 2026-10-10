import type { SupabaseClient } from "@supabase/supabase-js";
import { apurarMes, diasEntre, periodoMes, type ResultadoMes } from "@/lib/assiduidade-core";

// Busca no banco o que a regra do prêmio precisa (src/lib/assiduidade-core.ts)
// e apura cada pessoa que bate ponto num mês. Migration 0222.

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ConfigAssiduidade = { ativo: boolean; valor_mes: number; tolerancia_min: number; entradas: Record<string, string>; dia_inicio_mes: number; inicio: string | null };
export type PessoaAssiduidade = { id: string; nome: string; escala: number[]; resultado: ResultadoMes };

export function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function lerConfig(db: Db): Promise<ConfigAssiduidade> {
  const { data } = await db.from("assiduidade_config").select("ativo, valor_mes, tolerancia_min, entradas, dia_inicio_mes, inicio").maybeSingle();
  const c = data as ConfigAssiduidade | null;
  return {
    ativo: c?.ativo ?? true,
    valor_mes: Number(c?.valor_mes ?? 100),
    tolerancia_min: Number(c?.tolerancia_min ?? 15),
    entradas: (c?.entradas as Record<string, string>) ?? {},
    dia_inicio_mes: Number(c?.dia_inicio_mes ?? 1),
    inicio: c?.inicio ? String(c.inicio).slice(0, 10) : null,
  };
}

async function todas<T>(montar: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown }> }): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await montar().range(de, de + 999);
    const lote = (data as T[]) ?? [];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

export async function apurarAssiduidade(db: Db, mes: string, cfg?: ConfigAssiduidade): Promise<{ cfg: ConfigAssiduidade; de: string; ate: string; pessoas: PessoaAssiduidade[] }> {
  const config = cfg ?? (await lerConfig(db));
  const { de, ate } = periodoMes(mes, config.dia_inicio_mes);
  const hoje = hojeSP();
  // Só a partir do início (o relógio começar a valer) e até hoje.
  const ini = config.inicio && config.inicio > de ? config.inicio : de;
  const fim = ate < hoje ? ate : hoje;
  const dias = ini <= fim ? diasEntre(ini, fim) : [];

  const [{ data: cols }, batidas, { data: fol }, { data: ats }, { data: fer }] = await Promise.all([
    db.from("colaboradores").select("id, nome, dias_dia").eq("ativo", true).eq("bate_ponto", true).order("nome"),
    todas<{ colaborador_id: string; data: string; data_hora: string }>(() =>
      db.from("ponto_batidas").select("colaborador_id, data, data_hora").eq("turno", "dia").not("colaborador_id", "is", null)
        .gte("data", de).lte("data", ate).order("data_hora").order("id")),
    db.from("folgas_pedidos").select("data, status, folgas_funcionarios(colaborador_id)").eq("status", "Aprovado").gte("data", de).lte("data", ate),
    db.from("atestados").select("colaborador_id, inicio, fim").lte("inicio", ate).gte("fim", de),
    db.from("feriados").select("data, data_fim, situacao").eq("situacao", "fecha").lte("data", ate),
  ]);

  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });
  const primeira = new Map<string, Map<string, string>>();
  for (const b of batidas) {
    const m = primeira.get(b.colaborador_id) ?? new Map<string, string>();
    const dia = String(b.data).slice(0, 10);
    if (!m.has(dia)) m.set(dia, hhmm(b.data_hora)); // vem em ordem: a primeira fica
    primeira.set(b.colaborador_id, m);
  }
  const folgasDe = new Map<string, Set<string>>();
  type Fol = { data: string; folgas_funcionarios: { colaborador_id: string | null } | { colaborador_id: string | null }[] | null };
  for (const f of (fol ?? []) as Fol[]) {
    const ff = Array.isArray(f.folgas_funcionarios) ? f.folgas_funcionarios[0] : f.folgas_funcionarios;
    if (!ff?.colaborador_id) continue;
    const s = folgasDe.get(ff.colaborador_id) ?? new Set<string>();
    s.add(String(f.data).slice(0, 10));
    folgasDe.set(ff.colaborador_id, s);
  }
  const atestadosDe = new Map<string, Set<string>>();
  for (const a of (ats ?? []) as { colaborador_id: string; inicio: string; fim: string }[]) {
    const s = atestadosDe.get(a.colaborador_id) ?? new Set<string>();
    for (const d of diasEntre(String(a.inicio).slice(0, 10), String(a.fim).slice(0, 10))) s.add(d);
    atestadosDe.set(a.colaborador_id, s);
  }
  const fechados = new Set<string>();
  for (const f of (fer ?? []) as { data: string; data_fim: string | null }[]) {
    for (const d of diasEntre(String(f.data).slice(0, 10), String(f.data_fim ?? f.data).slice(0, 10))) fechados.add(d);
  }

  const noPeriodo = (s: Set<string> | undefined) => new Set([...(s ?? [])].filter((d) => dias.includes(d)));
  const pessoas = ((cols ?? []) as { id: string; nome: string; dias_dia: number[] | null }[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    escala: c.dias_dia ?? [],
    resultado: apurarMes({
      dias, hoje, escala: c.dias_dia ?? [], entradas: config.entradas,
      primeiraBatida: primeira.get(c.id) ?? new Map(),
      folgas: noPeriodo(folgasDe.get(c.id)), atestados: noPeriodo(atestadosDe.get(c.id)),
      fechados, tolerancia: config.tolerancia_min,
    }),
  }));
  return { cfg: config, de, ate, pessoas };
}
