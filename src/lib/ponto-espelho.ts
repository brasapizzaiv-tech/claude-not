import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre } from "@/lib/assiduidade-core";
import { hojeSP, lerConfig } from "@/lib/assiduidade-server";
import { carregarBasePonto, type PessoaPonto } from "@/lib/ponto-dados";
import { espelho, hhmm, type LinhaEspelho, type TotaisEspelho } from "@/lib/ponto-relatorio-core";

// Espelho de ponto de UMA pessoa num ciclo da folha (21 a 20) e o resumo que
// ela assina no app da equipe (migration 0254). O painel e o app montam igual,
// então o hash bate nos dois lados: se alguém ajustar o ponto depois da
// assinatura, o hash muda e aparece "mudou depois da assinatura".

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Assinatura no app vale a partir deste ciclo (o de 21/09 a 20/10 foi no papel do RHiD). */
export const ASSINATURA_DESDE = "2026-10-21";

/** Primeiro dia do ciclo da folha (o mesmo do RHiD). */
export const DIA_CICLO = 21;

const somarMeses = (ano: number, mes: number, delta: number) => new Date(Date.UTC(ano, mes - 1 + delta, DIA_CICLO)).toISOString().slice(0, 10);
const diaAntes = (d: string) => { const [a, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(a, m - 1, dd - 1)).toISOString().slice(0, 10); };

/** Ciclo que contém o dia: de 21 a 20 do mês seguinte. */
export function cicloDoDia(dia: string): { de: string; ate: string } {
  const [a, m, d] = dia.split("-").map(Number);
  const de = d >= DIA_CICLO ? somarMeses(a, m, 0) : somarMeses(a, m, -1);
  const [a2, m2] = de.split("-").map(Number);
  return { de, ate: diaAntes(somarMeses(a2, m2, 1)) };
}

/** Os últimos `n` ciclos, do atual pra trás. */
export function ciclosRecentes(hoje: string, n: number) {
  const out: { de: string; ate: string }[] = [];
  let atual = cicloDoDia(hoje);
  for (let i = 0; i < n; i++) {
    out.push(atual);
    atual = cicloDoDia(diaAntes(atual.de));
  }
  return out;
}

export type EspelhoPessoa = { pessoa: PessoaPonto; linhas: LinhaEspelho[]; totais: TotaisEspelho; entradas: Record<string, string>; saidas: Record<string, string> };

/** `empresaId` quando o `db` é o cliente admin (app da equipe). */
export async function espelhoDaPessoa(db: Db, pessoaId: string, de: string, ate: string, empresaId?: string): Promise<EspelhoPessoa | null> {
  const [cfg, base] = await Promise.all([
    lerConfig(db, empresaId),
    carregarBasePonto(db, de, ate, { incluirInativos: true, pessoaId, empresaId }),
  ]);
  const pessoa = base.pessoas[0];
  if (!pessoa) return null;
  const { linhas, totais } = espelho({
    dias: diasEntre(de, ate), hoje: hojeSP(), escala: pessoa.escala, entradas: cfg.entradas, saidas: cfg.saidas,
    batidas: base.batidas.get(pessoa.id) ?? new Map(), folgas: base.folgas.get(pessoa.id) ?? new Set(),
    atestados: base.atestados.get(pessoa.id) ?? new Set(), abonos: base.abonos.get(pessoa.id) ?? new Set(), fechados: base.fechados,
    tolerancia: cfg.tolerancia_batida_min, limite: cfg.limite_diario_min, admissao: pessoa.admissao, desligamento: pessoa.desligamento,
  });
  return { pessoa, linhas, totais, entradas: cfg.entradas, saidas: cfg.saidas };
}

/**
 * O que a pessoa viu e assinou: cada dia com batidas, situação, falta e extra,
 * e os totais. O hash é dessa lista (sem hora de geração), pra comparar depois.
 */
export function resumoParaAssinar(e: Pick<EspelhoPessoa, "linhas" | "totais">) {
  const dias = e.linhas
    .filter((l) => l.batidas.length || l.situacao !== "fora")
    .map((l) => ({ dia: l.dia, batidas: l.batidas.map(hhmm), situacao: l.situacao, falta: l.faltaMin, extra: l.extraMin }));
  const t = e.totais;
  const resumo = { dias, totais: { trabalhado: t.trabalhado, previsto: t.previsto, extra: t.extra, faltante: t.faltante, faltas: t.faltas, incompletos: t.incompletos } };
  const hash = createHash("sha256").update(JSON.stringify(resumo)).digest("hex");
  return { resumo, hash };
}

export type Assinatura = { id: string; resposta: "assinado" | "discorda"; comentario: string | null; hash: string; criado_em: string };

/** Última resposta de cada pessoa no ciclo. */
export async function assinaturasDoCiclo(db: Db, de: string, ate: string, pessoaIds: string[], empresaId?: string) {
  const mapa = new Map<string, Assinatura>();
  if (!pessoaIds.length) return mapa;
  let q = db.from("ponto_assinaturas").select("id, colaborador_id, resposta, comentario, hash, criado_em")
    .eq("de", de).eq("ate", ate).in("colaborador_id", pessoaIds).order("criado_em", { ascending: false });
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q;
  for (const a of (data ?? []) as (Assinatura & { colaborador_id: string })[]) if (!mapa.has(a.colaborador_id)) mapa.set(a.colaborador_id, a);
  return mapa;
}

/**
 * Mês fechado que a pessoa ainda precisa responder no app: sem resposta, ou
 * com resposta mas o ponto mudou depois (hash diferente). Devolve "21/09 a 20/10" ou null.
 */
export async function pontoAResponder(db: Db, colaboradorId: string, empresaId: string): Promise<string | null> {
  const fechou = ciclosRecentes(hojeSP(), 2)[1];
  if (fechou.de < ASSINATURA_DESDE) return null;
  const a = (await assinaturasDoCiclo(db, fechou.de, fechou.ate, [colaboradorId], empresaId)).get(colaboradorId);
  if (a) {
    const e = await espelhoDaPessoa(db, colaboradorId, fechou.de, fechou.ate, empresaId);
    if (!e || resumoParaAssinar(e).hash === a.hash) return null;
  }
  return `${fechou.de.slice(8, 10)}/${fechou.de.slice(5, 7)} a ${fechou.ate.slice(8, 10)}/${fechou.ate.slice(5, 7)}`;
}
