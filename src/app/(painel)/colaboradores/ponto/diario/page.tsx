import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { hojeSP, lerConfig } from "@/lib/assiduidade-server";
import { carregarBasePonto } from "@/lib/ponto-dados";
import { duracao, espelho, hhmm, inconsistenciasDia } from "@/lib/ponto-relatorio-core";
import { cicloDoDia, fechamentosDoCiclo } from "@/lib/ponto-espelho";
import { AjustarDia, BatidaMenu, type TipoJustOpcao } from "../client";

export const metadata = { title: "Ponto diário · Brasa" };
export const dynamic = "force-dynamic";

const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const somar = (d: string, n: number) => { const [a, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(a, m - 1, dd + n)).toISOString().slice(0, 10); };
const SIT: Record<string, string> = { falta: "Falta", incompleto: "Batida faltando", folga: "Folga", atestado: "Atestado", abono: "Abonado", feriado: "Feriado", hoje: "Hoje", compensado: "Compensado", neutro: "Neutro" };

// PONTO DIÁRIO (como o do RHiD): todo mundo que bate ponto num dia só, com as
// batidas, horas, faltas, extras e as inconsistências; ajusta direto daqui.
export default async function PontoDiarioPage({ searchParams }: { searchParams: Promise<{ data?: string; dep?: string; inc?: string }> }) {
  await exigirAcesso("/colaboradores");
  const sp = await searchParams;
  const hoje = hojeSP();
  const dia = DATA.test(sp.data ?? "") ? (sp.data as string) : hoje;
  const supabase = await createClient();
  const [cfg, base, { data: deps }, { data: tiposRows }] = await Promise.all([
    lerConfig(supabase),
    carregarBasePonto(supabase, dia, dia),
    supabase.from("departamentos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("justificativa_tipos").select("id, nome, efeito, tira_premio").eq("ativo", true).order("nome"),
  ]);
  const ids = base.pessoas.map((p) => p.id);
  const [{ data: depRows }, fechamentos] = await Promise.all([
    ids.length ? supabase.from("colaboradores").select("id, departamento_id").in("id", ids) : Promise.resolve({ data: [] }),
    fechamentosDoCiclo(supabase, cicloDoDia(dia).de, ids),
  ]);
  const depDe = new Map(((depRows ?? []) as { id: string; departamento_id: string | null }[]).map((c) => [c.id, c.departamento_id]));
  const tipos = (tiposRows ?? []) as TipoJustOpcao[];

  const linhas = base.pessoas
    .filter((p) => !sp.dep || depDe.get(p.id) === sp.dep)
    .map((p) => {
      const { linhas: ls } = espelho({
        dias: [dia], hoje, horarioDoDia: base.horarioDe(p.id), escala: p.escala, entradas: cfg.entradas, saidas: cfg.saidas,
        batidas: base.batidas.get(p.id) ?? new Map(), folgas: base.folgas.get(p.id) ?? new Set(),
        atestados: base.atestados.get(p.id) ?? new Set(), abonos: base.abonos.get(p.id) ?? new Set(), fechados: base.fechados,
        tolerancia: cfg.tolerancia_batida_min, limite: cfg.limite_diario_min, admissao: p.admissao, desligamento: p.desligamento,
        justificativas: base.justificativas.get(p.id), ajustes: base.ajustes.get(p.id),
      });
      const l = ls[0];
      return { p, l, inc: inconsistenciasDia(l, cfg.inconsistencias) };
    })
    .filter((x) => x.l.situacao !== "fora" || x.l.batidas.length > 0)
    .filter((x) => sp.inc !== "1" || x.inc.length > 0);
  const tot = linhas.reduce((t, { l }) => ({ normais: t.normais + Math.max(0, Math.min(l.trabalhadoMin, l.previstoMin)), falta: t.falta + l.faltaMin, extra: t.extra + l.extraMin, noturno: t.noturno + l.noturnoMin }), { normais: 0, falta: 0, extra: 0, noturno: 0 });
  const maxBat = Math.max(4, ...linhas.map(({ l }) => l.colunas.length + (l.colunas.length % 2)));
  const q = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ data: dia, ...(sp.dep ? { dep: sp.dep } : {}), ...(sp.inc === "1" ? { inc: "1" } : {}) });
    for (const [k, v] of Object.entries(o)) { if (v == null) u.delete(k); else u.set(k, v); }
    return `/colaboradores/ponto/diario?${u.toString()}`;
  };
  const CAB = "px-2 py-2 text-left text-xs font-medium text-texto-fraco";
  const [a, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();

  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/colaboradores/ponto" className="hover:text-texto">Relatórios de ponto</Link></p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Ponto diário</h1>

      <div className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <Link href={q({ data: somar(dia, -1) })} aria-label="Dia anterior" className="btn-secundario !min-h-11 !px-4">‹</Link>
        <form className="flex items-end gap-2">
          {sp.dep && <input type="hidden" name="dep" value={sp.dep} />}
          {sp.inc === "1" && <input type="hidden" name="inc" value="1" />}
          <input type="date" name="data" defaultValue={dia} aria-label="Dia" className="min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm text-texto" />
          <button className="btn-secundario !min-h-11">Ver</button>
        </form>
        <Link href={q({ data: somar(dia, 1) })} aria-label="Próximo dia" className="btn-secundario !min-h-11 !px-4">›</Link>
        <span className="ml-1 font-semibold text-texto">{DOW[dow]}{base.fechados.has(dia) ? " · feriado" : ""}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Link href={q({ dep: undefined })} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${!sp.dep ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>Todos</Link>
          {((deps ?? []) as { id: string; nome: string }[]).map((x) => (
            <Link key={x.id} href={q({ dep: x.id })} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${sp.dep === x.id ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>{x.nome}</Link>
          ))}
          <Link href={q({ inc: sp.inc === "1" ? undefined : "1" })} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${sp.inc === "1" ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>Só inconsistências</Link>
        </span>
      </div>

      <div className="cartao mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm tabular-nums">
          <thead><tr>
            <th className={CAB}>Funcionário</th>
            {Array.from({ length: maxBat }, (_, i) => <th key={i} className={CAB}>{i % 2 === 0 ? `Ent. ${i / 2 + 1}` : `Saí. ${(i + 1) / 2}`}</th>)}
            <th className={`${CAB} text-right`}>Normais</th><th className={`${CAB} text-right`}>Falta e atraso</th><th className={`${CAB} text-right`}>Extra</th><th className={`${CAB} text-right`}>Noturno</th><th className={CAB}></th><th className={CAB}></th>
          </tr></thead>
          <tbody className="divide-y divide-borda">
            {linhas.map(({ p, l, inc }) => {
              const fechado = fechamentos.has(p.id);
              return (
                <tr key={p.id} className={inc.length ? "bg-destaque/40" : ""}>
                  <td className="px-2 py-1.5">
                    <Link href={`/colaboradores/ponto?aba=espelho&p=${p.id}`} className="font-semibold text-texto hover:underline">{p.nome}</Link>
                    <span className="block text-xs text-texto-fraco">{l.horario || "sem horário"}</span>
                  </td>
                  {Array.from({ length: maxBat }, (_, i) => {
                    const b = l.colunas[i];
                    return <td key={i} className="px-1 py-1.5">{b ? <BatidaMenu id={b.id} hora={hhmm(b.min)} manual={b.origem === "manual"} destaque={i === 0 && l.atrasoMin > 0} /> : ""}</td>;
                  })}
                  <td className="px-2 py-1.5 text-right">{l.previstoMin ? duracao(Math.min(l.trabalhadoMin, l.previstoMin)) : ""}</td>
                  <td className={`px-2 py-1.5 text-right ${l.faltaMin ? "text-red-600" : ""}`}>{l.faltaMin ? duracao(l.faltaMin) : ""}</td>
                  <td className={`px-2 py-1.5 text-right ${l.extraMin ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{l.extraMin ? duracao(l.extraMin) : ""}</td>
                  <td className="px-2 py-1.5 text-right">{l.noturnoMin ? duracao(l.noturnoMin) : ""}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <span className={l.justificativa ? "text-sky-700 dark:text-sky-400" : "text-texto-suave"}>{l.justificativa ?? SIT[l.situacao] ?? ""}</span>
                    {inc.map((r) => <span key={r.nome} className="pilula pilula-urgente ml-1">{r.nome}</span>)}
                  </td>
                  <td className="px-2 py-1.5">{fechado ? <span className="text-xs text-texto-fraco">mês fechado</span> : <AjustarDia colaboradorId={p.id} nome={p.nome} dia={dia} tipos={tipos} />}</td>
                </tr>
              );
            })}
            {linhas.length === 0 && <tr><td colSpan={maxBat + 7} className="px-4 py-8 text-center text-texto-suave">{sp.inc === "1" ? "Nenhuma inconsistência nesse dia." : "Ninguém com horário ou batida nesse dia."}</td></tr>}
          </tbody>
          {linhas.length > 0 && (
            <tfoot><tr className="border-t-2 border-borda-forte font-semibold">
              <td className="px-2 py-2" colSpan={1 + maxBat}>Total</td>
              <td className="px-2 py-2 text-right">{duracao(tot.normais)}</td>
              <td className="px-2 py-2 text-right text-red-600">{duracao(tot.falta)}</td>
              <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-400">{duracao(tot.extra)}</td>
              <td className="px-2 py-2 text-right">{tot.noturno ? duracao(tot.noturno) : ""}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
