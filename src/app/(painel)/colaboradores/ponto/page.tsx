import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Icone } from "@/components/icone";
import { diasEntre } from "@/lib/assiduidade-core";
import { hojeSP, lerConfig } from "@/lib/assiduidade-server";
import { carregarBasePonto } from "@/lib/ponto-dados";
import { duracao, espelho, hhmm, porSemana, type LinhaEspelho } from "@/lib/ponto-relatorio-core";
import { AjustarDia, ImportarAfd, Imprimir } from "./client";

export const metadata = { title: "Relatórios de ponto · Brasa" };
export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SIT: Record<string, { rot: string; cor: string }> = {
  ok: { rot: "", cor: "" },
  falta: { rot: "Falta", cor: "text-red-600" },
  incompleto: { rot: "Batida faltando", cor: "text-amber-700 dark:text-amber-400" },
  folga: { rot: "Folga", cor: "text-texto-suave" },
  atestado: { rot: "Atestado", cor: "text-sky-700 dark:text-sky-400" },
  abono: { rot: "Abonado", cor: "text-sky-700 dark:text-sky-400" },
  feriado: { rot: "Feriado", cor: "text-texto-suave" },
  fora: { rot: "", cor: "text-texto-fraco" },
  hoje: { rot: "Hoje", cor: "text-texto-fraco" },
};

/** Ciclo da folha do RHiD: de 21 do mês anterior até hoje (ou do dia 21 deste mês). */
function cicloPadrao(hoje: string) {
  const [a, m, d] = hoje.split("-").map(Number);
  const de = d >= 21 ? `${hoje.slice(0, 8)}21` : new Date(Date.UTC(a, m - 2, 21)).toISOString().slice(0, 10);
  return { de, ate: hoje };
}

// RELATÓRIOS DE PONTO (migrations 0221–0223), no jeito dos do RHiD:
// Espelho (dia a dia de uma pessoa, pra imprimir e assinar), Horas e extras
// (extrato do período por pessoa e semana) e Atrasos e faltas (apuração).
// Gerencial: o ponto oficial (assinatura legal) continua sendo o do RHiD.
export default async function PontoPage({ searchParams }: { searchParams: Promise<{ aba?: string; de?: string; ate?: string; p?: string; inc?: string }> }) {
  await exigirAcesso("/colaboradores");
  const sp = await searchParams;
  const hoje = hojeSP();
  const padrao = cicloPadrao(hoje);
  const de = DATA.test(sp.de ?? "") ? (sp.de as string) : padrao.de;
  const ate = DATA.test(sp.ate ?? "") && (sp.ate as string) >= de ? (sp.ate as string) : padrao.ate;
  const aba = sp.aba === "horas" || sp.aba === "atrasos" ? sp.aba : "espelho";
  const soInconsistencias = sp.inc === "1";
  const supabase = await createClient();
  const cfg = await lerConfig(supabase);
  const base = await carregarBasePonto(supabase, de, ate, { incluirInativos: true });
  const ativos = base.pessoas.filter((p) => p.ativo || (base.batidas.get(p.id)?.size ?? 0) > 0);
  const dias = diasEntre(de, ate);

  const espelhoDe = (id: string) => {
    const p = ativos.find((x) => x.id === id)!;
    return espelho({
      dias, hoje, escala: p.escala, entradas: cfg.entradas, saidas: cfg.saidas,
      batidas: base.batidas.get(id) ?? new Map(), folgas: base.folgas.get(id) ?? new Set(),
      atestados: base.atestados.get(id) ?? new Set(), abonos: base.abonos.get(id) ?? new Set(), fechados: base.fechados,
      tolerancia: cfg.tolerancia_batida_min, limite: cfg.limite_diario_min,
    });
  };
  const idxPessoa = Math.max(0, ativos.findIndex((p) => p.id === sp.p));
  const pessoa = ativos[idxPessoa];
  const q = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ aba, de, ate, ...(pessoa ? { p: pessoa.id } : {}), ...(soInconsistencias ? { inc: "1" } : {}) });
    for (const [k, v] of Object.entries(o)) { if (v == null) u.delete(k); else u.set(k, v); }
    return `/colaboradores/ponto?${u.toString()}`;
  };
  const horario = (l: LinhaEspelho) => {
    const e = cfg.entradas[String(l.dow)], s = cfg.saidas[String(l.dow)];
    return l.situacao === "fora" || !e || !pessoa?.escala.includes(l.dow) ? "" : `${e}–${s ?? "?"}`;
  };
  const CAB = "px-2 py-2 text-left text-xs font-medium text-texto-fraco";

  return (
    <div className="w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-texto"><Icone nome="relogio" tamanho={22} /> Relatórios de ponto</h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            Batidas do relógio de quem bate ponto. Horário previsto: o das regras em <Link href="/colaboradores/assiduidade" className="text-orange-600 hover:underline">Assiduidade</Link>. Relatório gerencial; o ponto oficial continua sendo o do RHiD.
          </p>
        </div>
        <ImportarAfd />
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm print:hidden">
        <input type="hidden" name="aba" value={aba} />
        {pessoa && <input type="hidden" name="p" value={pessoa.id} />}
        <label className="flex flex-col text-xs text-texto-fraco">Início<input type="date" name="de" defaultValue={de} className="min-h-10 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto" /></label>
        <label className="flex flex-col text-xs text-texto-fraco">Fim<input type="date" name="ate" defaultValue={ate} className="min-h-10 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto" /></label>
        <button className="min-h-10 rounded-controle bg-texto px-4 font-semibold text-fundo">Buscar</button>
        <Link href={q({ de: padrao.de, ate: padrao.ate })} className="min-h-10 content-center px-2 text-xs text-texto-suave hover:underline">ciclo da folha (21 a 20)</Link>
      </form>

      <div className="mb-4 flex gap-1 border-b border-borda text-sm print:hidden">
        {([["espelho", "Espelho"], ["horas", "Horas e extras"], ["atrasos", "Atrasos e faltas"]] as const).map(([k, r]) => (
          <Link key={k} href={q({ aba: k })} className={`-mb-px border-b-2 px-3 py-2 ${aba === k ? "border-orange-500 font-semibold text-texto" : "border-transparent text-texto-suave"}`}>{r}</Link>
        ))}
      </div>

      {ativos.length === 0 && <p className="rounded-cartao bg-painel-cartao p-8 text-center text-sm text-texto-fraco">Ninguém marcado &quot;Bate ponto no relógio&quot; em Colaboradores.</p>}

      {aba === "espelho" && pessoa && (() => {
        const { linhas, totais } = espelhoDe(pessoa.id);
        const visiveis = soInconsistencias ? linhas.filter((l) => ["falta", "incompleto"].includes(l.situacao) || l.atrasoMin > 0) : linhas;
        const maxBat = Math.max(4, ...linhas.map((l) => l.batidas.length + (l.batidas.length % 2)));
        return (
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
              <Link href={q({ p: ativos[(idxPessoa - 1 + ativos.length) % ativos.length].id })} className="rounded-controle border border-borda-forte px-3 py-2 text-sm">←</Link>
              <span className="text-sm text-texto-suave">{idxPessoa + 1} de {ativos.length}</span>
              <Link href={q({ p: ativos[(idxPessoa + 1) % ativos.length].id })} className="rounded-controle border border-borda-forte px-3 py-2 text-sm">→</Link>
              <form className="ml-2">
                <input type="hidden" name="aba" value="espelho" /><input type="hidden" name="de" value={de} /><input type="hidden" name="ate" value={ate} />
                {soInconsistencias && <input type="hidden" name="inc" value="1" />}
                <select name="p" defaultValue={pessoa.id} className="min-h-10 rounded-controle border border-borda-forte bg-transparent px-2 text-sm">
                  {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativo)"}</option>)}
                </select>
                <button className="ml-1 min-h-10 rounded-controle border border-borda-forte px-3 text-sm">ver</button>
              </form>
              <Link href={q({ inc: soInconsistencias ? undefined : "1" })} className="ml-auto text-sm text-texto-suave hover:underline">
                {soInconsistencias ? "☑" : "☐"} Mostrar apenas inconsistências
              </Link>
              <Imprimir />
            </div>
            <div className="mb-2">
              <h2 className="text-lg font-semibold">Espelho de ponto · {pessoa.nome}</h2>
              <p className="text-sm text-texto-suave">De {dm(de)}/{de.slice(0, 4)} a {dm(ate)}/{ate.slice(0, 4)}{pessoa.cpf ? ` · CPF ${pessoa.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}` : ""}</p>
            </div>
            <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
              <table className="w-full min-w-[760px] text-sm tabular-nums">
                <thead><tr>
                  <th className={CAB}>Dia</th><th className={CAB}>Horário</th>
                  {Array.from({ length: maxBat }, (_, i) => <th key={i} className={CAB}>{i % 2 === 0 ? `Ent. ${i / 2 + 1}` : `Saí. ${(i + 1) / 2}`}</th>)}
                  <th className={`${CAB} text-right`}>Normais</th><th className={`${CAB} text-right`}>Falta e atraso</th><th className={`${CAB} text-right`}>Extra</th><th className={CAB}></th><th className={`${CAB} print:hidden`}></th>
                </tr></thead>
                <tbody className="divide-y divide-borda">
                  {visiveis.map((l) => {
                    const normais = l.previstoMin > 0 ? Math.min(l.trabalhadoMin, l.previstoMin) : 0;
                    const falta = l.faltaMin;
                    const extra = l.extraMin;
                    const s = SIT[l.situacao];
                    return (
                      <tr key={l.dia} className={l.situacao === "fora" && !l.batidas.length ? "text-texto-fraco" : ""}>
                        <td className="px-2 py-1.5 whitespace-nowrap">{dm(l.dia)} <span className="text-xs text-texto-fraco">{DOW[l.dow]}</span></td>
                        <td className="px-2 py-1.5 text-xs text-texto-fraco">{horario(l)}</td>
                        {Array.from({ length: maxBat }, (_, i) => (
                          <td key={i} className={`px-2 py-1.5 ${i === 0 && l.atrasoMin > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}>
                            {l.batidas[i] != null ? hhmm(l.batidas[i]) : i === l.batidas.length && l.situacao === "incompleto" ? <span className="text-red-600">—</span> : ""}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right">{normais ? duracao(normais) : ""}</td>
                        <td className={`px-2 py-1.5 text-right ${falta ? "text-red-600" : ""}`}>{falta ? duracao(falta) : ""}</td>
                        <td className={`px-2 py-1.5 text-right ${extra ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{extra ? duracao(extra) : ""}</td>
                        <td className={`px-2 py-1.5 text-xs ${s.cor}`}>{s.rot}{l.atrasoMin > 0 ? `${s.rot ? " · " : ""}atraso ${l.atrasoMin} min` : ""}</td>
                        <td className="px-2 py-1.5 print:hidden"><AjustarDia colaboradorId={pessoa.id} nome={pessoa.nome} dia={l.dia} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="border-t-2 border-borda-forte font-semibold">
                  <td className="px-2 py-2" colSpan={2 + maxBat}>Total · {totais.diasTrabalhados} dias trabalhados{totais.faltas ? ` · ${totais.faltas} falta(s)` : ""}{totais.incompletos ? ` · ${totais.incompletos} com batida faltando` : ""}</td>
                  <td className="px-2 py-2 text-right">{duracao(Math.max(0, totais.previsto - totais.faltante))}</td>
                  <td className="px-2 py-2 text-right text-red-600">{duracao(totais.faltante)}</td>
                  <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-400">{duracao(totais.extra)}</td>
                  <td colSpan={2}></td>
                </tr></tfoot>
              </table>
            </div>
            <div className="mt-12 hidden grid-cols-2 gap-16 text-center text-sm print:grid">
              <div className="border-t border-black pt-1">{pessoa.nome}</div>
              <div className="border-t border-black pt-1">Brasa Pizza Ivoti</div>
            </div>
          </section>
        );
      })()}

      {aba === "horas" && ativos.length > 0 && (
        <section className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead><tr>
              <th className={CAB}>Pessoa · semana</th><th className={`${CAB} text-right`}>Dias</th><th className={`${CAB} text-right`}>Previstas</th><th className={`${CAB} text-right`}>Trabalhadas</th><th className={`${CAB} text-right`}>Extras</th><th className={`${CAB} text-right`}>Faltaram</th><th className={`${CAB} text-right`}>Saldo</th>
            </tr></thead>
            <tbody>
              {ativos.map((p) => {
                const { linhas, totais } = espelhoDe(p.id);
                const saldo = totais.extra - totais.faltante;
                return [
                  <tr key={p.id} className="border-t border-borda font-semibold">
                    <td className="px-2 py-2"><Link href={q({ aba: "espelho", p: p.id })} className="hover:underline">{p.nome}</Link></td>
                    <td className="px-2 py-2 text-right">{totais.diasTrabalhados}</td>
                    <td className="px-2 py-2 text-right">{duracao(totais.previsto)}</td>
                    <td className="px-2 py-2 text-right">{duracao(totais.trabalhado)}</td>
                    <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-400">{duracao(totais.extra)}</td>
                    <td className="px-2 py-2 text-right text-red-600">{duracao(totais.faltante)}</td>
                    <td className={`px-2 py-2 text-right ${saldo < 0 ? "text-red-600" : ""}`}>{duracao(saldo)}</td>
                  </tr>,
                  ...porSemana(linhas).map((s) => (
                    <tr key={`${p.id}|${s.segunda}`} className="text-xs text-texto-suave">
                      <td className="px-2 py-1 pl-6">semana de {dm(s.segunda)}</td><td></td>
                      <td className="px-2 py-1 text-right">{duracao(s.previsto)}</td>
                      <td className="px-2 py-1 text-right">{duracao(s.trabalhado)}</td>
                      <td className="px-2 py-1 text-right">{duracao(s.extra)}</td>
                      <td className="px-2 py-1 text-right">{duracao(s.faltante)}</td>
                      <td className="px-2 py-1 text-right">{duracao(s.extra - s.faltante)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
          <p className="px-2 py-2 text-xs text-texto-fraco">Extra = tempo além do horário previsto; dia fora da escala conta todo como extra. Tolerância como a do RHiD: até {cfg.tolerancia_batida_min} min antes ou depois não conta; se o dia somar mais de {cfg.limite_diario_min} min, conta tudo.</p>
        </section>
      )}

      {aba === "atrasos" && ativos.length > 0 && (() => {
        type Ocorr = { dia: string; nome: string; id: string; tipo: string; det: string; cor: string };
        const lista: Ocorr[] = [];
        const resumo = ativos.map((p) => {
          const { linhas, totais } = espelhoDe(p.id);
          for (const l of linhas) {
            if (l.atrasoMin > 0) lista.push({ dia: l.dia, nome: p.nome, id: p.id, tipo: "Atraso", det: `${l.atrasoMin} min · chegou ${hhmm(l.batidas[0])} (entrada ${cfg.entradas[String(l.dow)]})`, cor: "text-amber-700 dark:text-amber-400" });
            if (l.situacao === "falta") lista.push({ dia: l.dia, nome: p.nome, id: p.id, tipo: "Falta", det: "não bateu ponto", cor: "text-red-600" });
            if (l.situacao === "incompleto") lista.push({ dia: l.dia, nome: p.nome, id: p.id, tipo: "Batida faltando", det: `bateu ${l.batidas.map(hhmm).join(", ")}`, cor: "text-amber-700 dark:text-amber-400" });
          }
          return { p, totais };
        });
        lista.sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
        return (
          <section className="space-y-4">
            <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
              <table className="w-full min-w-[560px] text-sm tabular-nums">
                <thead><tr><th className={CAB}>Pessoa</th><th className={`${CAB} text-right`}>Atraso somado</th><th className={`${CAB} text-right`}>Faltas</th><th className={`${CAB} text-right`}>Batida faltando</th></tr></thead>
                <tbody className="divide-y divide-borda">
                  {resumo.map(({ p, totais }) => (
                    <tr key={p.id}>
                      <td className="px-2 py-1.5"><Link href={q({ aba: "espelho", p: p.id })} className="hover:underline">{p.nome}</Link></td>
                      <td className={`px-2 py-1.5 text-right ${totais.atraso > cfg.tolerancia_min ? "font-semibold text-red-600" : ""}`}>{totais.atraso} min</td>
                      <td className={`px-2 py-1.5 text-right ${totais.faltas ? "font-semibold text-red-600" : ""}`}>{totais.faltas}</td>
                      <td className="px-2 py-1.5 text-right">{totais.incompletos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr><th className={CAB}>Dia</th><th className={CAB}>Pessoa</th><th className={CAB}>O quê</th><th className={CAB}>Detalhe</th></tr></thead>
                <tbody className="divide-y divide-borda">
                  {lista.map((o, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{dm(o.dia)} <span className="text-xs text-texto-fraco">{DOW[new Date(`${o.dia}T12:00:00Z`).getUTCDay()]}</span></td>
                      <td className="px-2 py-1.5">{o.nome}</td>
                      <td className={`px-2 py-1.5 font-medium ${o.cor}`}>{o.tipo}</td>
                      <td className="px-2 py-1.5 text-texto-suave">{o.det}</td>
                    </tr>
                  ))}
                  {lista.length === 0 && <tr><td colSpan={4} className="px-2 py-8 text-center text-texto-fraco">Nenhum atraso, falta ou batida faltando no período.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
