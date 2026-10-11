import type { SupabaseClient } from "@supabase/supabase-js";
import { apurarMes, diasEntre, periodoMes, type ResultadoMes } from "@/lib/assiduidade-core";
import { carregarBasePonto } from "@/lib/ponto-dados";
import { hhmm } from "@/lib/ponto-relatorio-core";

// Apura o prêmio assiduidade de cada pessoa que bate ponto num mês (regra em
// src/lib/assiduidade-core.ts; dados em src/lib/ponto-dados.ts). Migration 0222.

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ConfigAssiduidade = {
  ativo: boolean; valor_mes: number; tolerancia_min: number;
  entradas: Record<string, string>; saidas: Record<string, string>;
  dia_inicio_mes: number; inicio: string | null;
  tolerancia_batida_min: number; limite_diario_min: number;
};
export type PessoaAssiduidade = { id: string; nome: string; escala: number[]; resultado: ResultadoMes };

export function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function lerConfig(db: Db): Promise<ConfigAssiduidade> {
  const { data } = await db.from("assiduidade_config").select("ativo, valor_mes, tolerancia_min, entradas, saidas, dia_inicio_mes, inicio, tolerancia_batida_min, limite_diario_min").maybeSingle();
  const c = data as ConfigAssiduidade | null;
  return {
    ativo: c?.ativo ?? true,
    valor_mes: Number(c?.valor_mes ?? 100),
    tolerancia_min: Number(c?.tolerancia_min ?? 15),
    entradas: (c?.entradas as Record<string, string>) ?? {},
    saidas: (c?.saidas as Record<string, string>) ?? {},
    dia_inicio_mes: Number(c?.dia_inicio_mes ?? 1),
    inicio: c?.inicio ? String(c.inicio).slice(0, 10) : null,
    tolerancia_batida_min: Number(c?.tolerancia_batida_min ?? 5),
    limite_diario_min: Number(c?.limite_diario_min ?? 10),
  };
}

export async function apurarAssiduidade(db: Db, mes: string, cfg?: ConfigAssiduidade): Promise<{ cfg: ConfigAssiduidade; de: string; ate: string; pessoas: PessoaAssiduidade[] }> {
  const config = cfg ?? (await lerConfig(db));
  const { de, ate } = periodoMes(mes, config.dia_inicio_mes);
  const hoje = hojeSP();
  // Só a partir do início (o relógio começar a valer) e até hoje.
  const ini = config.inicio && config.inicio > de ? config.inicio : de;
  const fim = ate < hoje ? ate : hoje;
  const dias = ini <= fim ? diasEntre(ini, fim) : [];
  const base = await carregarBasePonto(db, de, ate);
  const noPeriodo = (s: Set<string> | undefined) => new Set([...(s ?? [])].filter((d) => dias.includes(d)));

  const pessoas = base.pessoas.map((p) => {
    const primeira = new Map<string, string>();
    for (const [dia, mins] of base.batidasDia.get(p.id) ?? []) primeira.set(dia, hhmm(Math.min(...mins)));
    return {
      id: p.id,
      nome: p.nome,
      escala: p.escala,
      resultado: apurarMes({
        dias, hoje, escala: p.escala, entradas: config.entradas, primeiraBatida: primeira,
        folgas: noPeriodo(base.folgas.get(p.id)), atestados: noPeriodo(base.atestados.get(p.id)), abonos: noPeriodo(base.abonos.get(p.id)),
        fechados: base.fechados, tolerancia: config.tolerancia_min, toleranciaBatida: config.tolerancia_batida_min,
      }),
    };
  });
  return { cfg: config, de, ate, pessoas };
}
