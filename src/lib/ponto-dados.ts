import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre } from "@/lib/assiduidade-core";
import type { AjusteDia, BatidaDia, DiaHorario } from "@/lib/ponto-relatorio-core";
import { diaDoHorario, horarioIdNoDia, type HorarioPonto, type VinculoHorario } from "@/lib/ponto-horarios-core";

// Tudo o que os relatórios de ponto e o prêmio assiduidade precisam de um
// período: quem bate ponto, as batidas de cada dia, folgas aprovadas,
// atestados e feriados em que a casa fecha. Um lugar só, pros dois
// lerem igual (migrations 0221–0223).

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PessoaPonto = { id: string; nome: string; escala: number[]; ativo: boolean; cpf: string | null; admissao: string | null; desligamento: string | null };
export type BasePonto = {
  pessoas: PessoaPonto[];
  /** colaborador → dia → batidas (minutos desde 00:00 do dia; madrugada = 1440+), com os ajustes. */
  batidas: Map<string, Map<string, BatidaDia[]>>;
  /** colaborador → dia → minutos só do turno do dia, sem as desconsideradas (pro prêmio). */
  batidasDia: Map<string, Map<string, number[]>>;
  folgas: Map<string, Set<string>>;
  atestados: Map<string, Set<string>>;
  /** Ausência abonada pela casa: não é falta e não tira o prêmio. */
  abonos: Map<string, Set<string>>;
  /** Feriados (abre, fecha ou a definir): fora da escala no ponto. */
  fechados: Set<string>;
  /** Horário de cada dia da pessoa (migration 0255); undefined = sem horário, vale o jeito antigo. */
  horarioDe: (pessoaId: string) => ((dia: string, dow: number) => DiaHorario | null) | undefined;
  horarios: Map<string, HorarioPonto>;
  /** colaborador → dia → nome da justificativa de dia inteiro (Férias, Atestado médico...). */
  justificativas: Map<string, Map<string, string>>;
  /** colaborador → dia → minutos abonados / ajustados. */
  ajustes: Map<string, Map<string, AjusteDia>>;
};
/** Tipo de justificativa (migration 0258). */
export type TipoJustificativa = { id: string; nome: string; efeito: "dia" | "horas" | "ajuste"; tira_premio: boolean; ativo: boolean };

async function todas<T>(montar: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown }> }): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < 50000; de += 1000) {
    const { data } = await montar().range(de, de + 999);
    const lote = (data as T[]) ?? [];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

function minutosNoDia(iso: string, dia: string) {
  const local = new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }); // "2026-10-12 08:03:00"
  const [d, h] = local.split(" ");
  const [hh, mm] = h.split(":").map(Number);
  // Batida de outro dia civil (madrugada, ou deslocada pro dia anterior/seguinte).
  const difDias = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86400000);
  return difDias * 1440 + hh * 60 + mm;
}

export async function carregarBasePonto(db: Db, de: string, ate: string, opts: { incluirInativos?: boolean; pessoaId?: string; empresaId?: string } = {}): Promise<BasePonto> {
  // Com o cliente admin (app da equipe) não há RLS: filtra a empresa à mão.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const daEmpresa = <Q,>(q: Q): Q => (opts.empresaId ? (q as any).eq("empresa_id", opts.empresaId) : q);
  let qCols = daEmpresa(db.from("colaboradores").select("id, nome, dias_dia, ativo, cpf, admissao, desligado_em").eq("bate_ponto", true).order("nome"));
  if (!opts.incluirInativos) qCols = qCols.eq("ativo", true);
  if (opts.pessoaId) qCols = qCols.eq("id", opts.pessoaId);
  const [{ data: cols }, bats, { data: fol }, { data: ats }, { data: tjs }, { data: fer }] = await Promise.all([
    qCols,
    todas<{ id: string; colaborador_id: string; data: string; turno: string; data_hora: string; origem: string; desconsiderada: boolean; deslocamento: number }>(() => {
      let q = db.from("ponto_batidas").select("id, colaborador_id, data, turno, data_hora, origem, desconsiderada, deslocamento").not("colaborador_id", "is", null).gte("data", de).lte("data", ate);
      if (opts.pessoaId) q = q.eq("colaborador_id", opts.pessoaId);
      return daEmpresa(q).order("data_hora").order("id");
    }),
    daEmpresa(db.from("folgas_pedidos").select("data, folgas_funcionarios(colaborador_id)").eq("status", "Aprovado").gte("data", de).lte("data", ate)),
    daEmpresa(db.from("atestados").select("colaborador_id, inicio, fim, tipo, tipo_id, minutos").lte("inicio", ate).gte("fim", de)),
    daEmpresa(db.from("justificativa_tipos").select("id, nome, efeito, tira_premio, ativo")),
    // Feriado é feriado no ponto mesmo com a casa aberta (Rafael, 24/10/2026, igual ao RHiD):
    // ninguém leva falta e quem trabalha fica com as horas do dia como extra.
    daEmpresa(db.from("feriados").select("data, data_fim").lte("data", ate)),
  ]);

  const batidas = new Map<string, Map<string, BatidaDia[]>>();
  const batidasDia = new Map<string, Map<string, number[]>>();
  const add = <T,>(alvo: Map<string, Map<string, T[]>>, c: string, dia: string, v: T) => {
    const m = alvo.get(c) ?? new Map<string, T[]>();
    m.set(dia, [...(m.get(dia) ?? []), v]);
    alvo.set(c, m);
  };
  for (const b of bats) {
    const dia = String(b.data).slice(0, 10);
    const v = minutosNoDia(b.data_hora, dia);
    add(batidas, b.colaborador_id, dia, { id: b.id, min: v, desloc: b.deslocamento || 0, ignorada: !!b.desconsiderada, origem: b.origem });
    if (b.turno === "dia" && !b.desconsiderada) add(batidasDia, b.colaborador_id, dia, v);
  }

  const folgas = new Map<string, Set<string>>();
  type Fol = { data: string; folgas_funcionarios: { colaborador_id: string | null } | { colaborador_id: string | null }[] | null };
  for (const f of (fol ?? []) as Fol[]) {
    const ff = Array.isArray(f.folgas_funcionarios) ? f.folgas_funcionarios[0] : f.folgas_funcionarios;
    if (!ff?.colaborador_id) continue;
    const s = folgas.get(ff.colaborador_id) ?? new Set<string>();
    s.add(String(f.data).slice(0, 10));
    folgas.set(ff.colaborador_id, s);
  }
  // Justificativas (migration 0258): pelo tipo — dia inteiro (tira ou não o
  // prêmio), minutos abonados ou ajuste de minutos. Sem tipo = jeito antigo.
  const tiposJust = new Map(((tjs ?? []) as TipoJustificativa[]).map((t) => [t.id, t]));
  const atestados = new Map<string, Set<string>>();
  const abonos = new Map<string, Set<string>>();
  const justificativas = new Map<string, Map<string, string>>();
  const ajustes = new Map<string, Map<string, AjusteDia>>();
  const fmtMin = (n: number) => `${n < 0 ? "-" : ""}${Math.floor(Math.abs(n) / 60)}h${String(Math.abs(n) % 60).padStart(2, "0")}`;
  for (const a of (ats ?? []) as { colaborador_id: string; inicio: string; fim: string; tipo: string | null; tipo_id: string | null; minutos: number | null }[]) {
    const t = a.tipo_id ? tiposJust.get(a.tipo_id) : undefined;
    const dias = diasEntre(String(a.inicio).slice(0, 10), String(a.fim).slice(0, 10));
    if (t && t.efeito !== "dia") {
      const m = ajustes.get(a.colaborador_id) ?? new Map<string, AjusteDia>();
      for (const d of dias) {
        const x = m.get(d) ?? { abono: 0, ajuste: 0, rotulo: "" };
        const min = Number(a.minutos) || 0;
        if (t.efeito === "horas") x.abono += Math.abs(min); else x.ajuste += min;
        x.rotulo = [x.rotulo, `${t.nome} ${fmtMin(min)}`].filter(Boolean).join(" · ");
        m.set(d, x);
      }
      ajustes.set(a.colaborador_id, m);
      continue;
    }
    const tira = t ? t.tira_premio : a.tipo !== "abono";
    const alvo = tira ? atestados : abonos;
    const s = alvo.get(a.colaborador_id) ?? new Set<string>();
    const nomes = justificativas.get(a.colaborador_id) ?? new Map<string, string>();
    for (const d of dias) { s.add(d); nomes.set(d, t?.nome ?? (tira ? "Atestado" : "Abonado")); }
    alvo.set(a.colaborador_id, s);
    justificativas.set(a.colaborador_id, nomes);
  }
  const fechados = new Set<string>();
  for (const f of (fer ?? []) as { data: string; data_fim: string | null }[]) {
    for (const d of diasEntre(String(f.data).slice(0, 10), String(f.data_fim ?? f.data).slice(0, 10))) fechados.add(d);
  }
  const pessoas = ((cols ?? []) as { id: string; nome: string; dias_dia: number[] | null; ativo: boolean; cpf: string | null; admissao: string | null; desligado_em: string | null }[])
    .map((c) => ({ id: c.id, nome: c.nome, escala: c.dias_dia ?? [], ativo: c.ativo, cpf: c.cpf, admissao: c.admissao ? String(c.admissao).slice(0, 10) : null, desligamento: c.desligado_em ? String(c.desligado_em).slice(0, 10) : null }));

  // Horários (migration 0255): em qual horário cada um está em cada dia, e as exceções do período.
  const ids = pessoas.map((p) => p.id);
  const [{ data: vincs }, { data: hors }, { data: excs }] = ids.length
    ? await Promise.all([
        db.from("colaborador_horarios").select("colaborador_id, horario_id, de, ate").in("colaborador_id", ids).lte("de", ate),
        daEmpresa(db.from("ponto_horarios").select("id, nome, ativo, dias, tolerancia_extra, tolerancia_falta, limite_extra, limite_falta, noturno_inicio, noturno_fim")),
        db.from("ponto_horario_excecoes").select("colaborador_id, data, horario_id").in("colaborador_id", ids).gte("data", de).lte("data", ate),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const horarios = new Map(((hors ?? []) as HorarioPonto[]).map((h) => [h.id, h]));
  const vinculos = new Map<string, VinculoHorario[]>();
  for (const v of (vincs ?? []) as { colaborador_id: string; horario_id: string; de: string; ate: string | null }[]) {
    vinculos.set(v.colaborador_id, [...(vinculos.get(v.colaborador_id) ?? []), { horario_id: v.horario_id, de: String(v.de).slice(0, 10), ate: v.ate ? String(v.ate).slice(0, 10) : null }]);
  }
  const excecoes = new Map<string, Map<string, string | null>>();
  for (const x of (excs ?? []) as { colaborador_id: string; data: string; horario_id: string | null }[]) {
    const m = excecoes.get(x.colaborador_id) ?? new Map<string, string | null>();
    m.set(String(x.data).slice(0, 10), x.horario_id);
    excecoes.set(x.colaborador_id, m);
  }
  const horarioDe = (pessoaId: string) => {
    const vs = vinculos.get(pessoaId);
    if (!vs?.length) return undefined; // sem horário: segue as regras antigas
    const ex = excecoes.get(pessoaId);
    return (dia: string, dow: number): DiaHorario | null => {
      const id = horarioIdNoDia(dia, vs, ex);
      const h = id ? horarios.get(id) : undefined;
      return h ? diaDoHorario(h, dow) : null;
    };
  };
  return { pessoas, batidas, batidasDia, folgas, atestados, abonos, fechados, horarioDe, horarios, justificativas, ajustes };
}
