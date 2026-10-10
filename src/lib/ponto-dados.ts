import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre } from "@/lib/assiduidade-core";

// Tudo o que os relatórios de ponto e o prêmio assiduidade precisam de um
// período: quem bate ponto, as batidas de cada dia, folgas aprovadas,
// atestados e feriados em que a casa fecha. Um lugar só, pros dois
// lerem igual (migrations 0221–0223).

type Db = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PessoaPonto = { id: string; nome: string; escala: number[]; ativo: boolean; cpf: string | null };
export type BasePonto = {
  pessoas: PessoaPonto[];
  /** colaborador → dia → minutos das batidas (depois da meia-noite = 1440+). */
  batidas: Map<string, Map<string, number[]>>;
  /** colaborador → dia → minutos só do turno do dia (pro atraso do prêmio). */
  batidasDia: Map<string, Map<string, number[]>>;
  folgas: Map<string, Set<string>>;
  atestados: Map<string, Set<string>>;
  /** Ausência abonada pela casa: não é falta e não tira o prêmio. */
  abonos: Map<string, Set<string>>;
  fechados: Set<string>;
};

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
  return (d > dia ? 1440 : 0) + hh * 60 + mm;
}

export async function carregarBasePonto(db: Db, de: string, ate: string, opts: { incluirInativos?: boolean; pessoaId?: string } = {}): Promise<BasePonto> {
  let qCols = db.from("colaboradores").select("id, nome, dias_dia, ativo, cpf").eq("bate_ponto", true).order("nome");
  if (!opts.incluirInativos) qCols = qCols.eq("ativo", true);
  if (opts.pessoaId) qCols = qCols.eq("id", opts.pessoaId);
  const [{ data: cols }, bats, { data: fol }, { data: ats }, { data: fer }] = await Promise.all([
    qCols,
    todas<{ colaborador_id: string; data: string; turno: string; data_hora: string }>(() => {
      let q = db.from("ponto_batidas").select("colaborador_id, data, turno, data_hora").not("colaborador_id", "is", null).gte("data", de).lte("data", ate);
      if (opts.pessoaId) q = q.eq("colaborador_id", opts.pessoaId);
      return q.order("data_hora").order("id");
    }),
    db.from("folgas_pedidos").select("data, folgas_funcionarios(colaborador_id)").eq("status", "Aprovado").gte("data", de).lte("data", ate),
    db.from("atestados").select("colaborador_id, inicio, fim, tipo").lte("inicio", ate).gte("fim", de),
    db.from("feriados").select("data, data_fim").eq("situacao", "fecha").lte("data", ate),
  ]);

  const batidas = new Map<string, Map<string, number[]>>();
  const batidasDia = new Map<string, Map<string, number[]>>();
  const add = (alvo: Map<string, Map<string, number[]>>, c: string, dia: string, v: number) => {
    const m = alvo.get(c) ?? new Map<string, number[]>();
    m.set(dia, [...(m.get(dia) ?? []), v]);
    alvo.set(c, m);
  };
  for (const b of bats) {
    const dia = String(b.data).slice(0, 10);
    const v = minutosNoDia(b.data_hora, dia);
    add(batidas, b.colaborador_id, dia, v);
    if (b.turno === "dia") add(batidasDia, b.colaborador_id, dia, v);
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
  const atestados = new Map<string, Set<string>>();
  const abonos = new Map<string, Set<string>>();
  for (const a of (ats ?? []) as { colaborador_id: string; inicio: string; fim: string; tipo: string | null }[]) {
    const alvo = a.tipo === "abono" ? abonos : atestados;
    const s = alvo.get(a.colaborador_id) ?? new Set<string>();
    for (const d of diasEntre(String(a.inicio).slice(0, 10), String(a.fim).slice(0, 10))) s.add(d);
    alvo.set(a.colaborador_id, s);
  }
  const fechados = new Set<string>();
  for (const f of (fer ?? []) as { data: string; data_fim: string | null }[]) {
    for (const d of diasEntre(String(f.data).slice(0, 10), String(f.data_fim ?? f.data).slice(0, 10))) fechados.add(d);
  }
  const pessoas = ((cols ?? []) as { id: string; nome: string; dias_dia: number[] | null; ativo: boolean; cpf: string | null }[])
    .map((c) => ({ id: c.id, nome: c.nome, escala: c.dias_dia ?? [], ativo: c.ativo, cpf: c.cpf }));
  return { pessoas, batidas, batidasDia, folgas, atestados, abonos, fechados };
}
