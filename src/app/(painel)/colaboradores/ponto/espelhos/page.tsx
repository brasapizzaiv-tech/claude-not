import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { hojeSP } from "@/lib/assiduidade-server";
import { duracao, hhmm } from "@/lib/ponto-relatorio-core";
import { ciclosRecentes, espelhosDoPeriodo } from "@/lib/ponto-espelho";
import { ImprimirRelatorio } from "../relatorios/baixar";

export const metadata = { title: "Espelhos de ponto · Brasa" };
export const dynamic = "force-dynamic";

// Os espelhos de todo mundo, um por folha, pra imprimir ou salvar em PDF e
// mandar pro contador (etapa 4 da saída do RHiD). Só leitura: ajustar é no espelho.
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dma = (d: string) => `${dm(d)}/${d.slice(0, 4)}`;
const SIT: Record<string, string> = { falta: "Falta", incompleto: "Batida faltando", folga: "Folga", atestado: "Atestado", abono: "Abonado", feriado: "Feriado", compensado: "Compensado", neutro: "Neutro" };
const CAB = "border-b border-borda-forte px-1.5 py-1 text-left font-medium";

export default async function EspelhosPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  await exigirAcesso("/colaboradores");
  const sp = await searchParams;
  const padrao = ciclosRecentes(hojeSP(), 2)[1];
  const de = DATA.test(sp.de ?? "") ? (sp.de as string) : padrao.de;
  const ate = DATA.test(sp.ate ?? "") && (sp.ate as string) >= de ? (sp.ate as string) : padrao.ate;
  const supabase = await createClient();
  const espelhos = await espelhosDoPeriodo(supabase, de, ate);
  const ids = espelhos.map((e) => e.pessoa.id);
  const { data: fichas } = ids.length
    ? await supabase.from("colaboradores").select("id, matricula, pis, funcao").in("id", ids)
    : { data: [] };
  const fichaDe = new Map(((fichas ?? []) as { id: string; matricula: string | null; pis: string | null; funcao: string | null }[]).map((f) => [f.id, f]));

  return (
    <div className="w-full max-w-5xl p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/colaboradores/ponto/relatorios?de=${de}&ate=${ate}`} className="text-sm font-semibold text-texto-marca hover:underline">← Relatórios do ponto</Link>
        <span className="text-sm text-texto-suave">{espelhos.length} espelhos · {dma(de)} a {dma(ate)} · um por folha</span>
        <span className="ml-auto"><ImprimirRelatorio /></span>
      </div>
      <p className="mb-4 text-xs text-texto-suave print:hidden">Na janela de impressão, escolha “Salvar como PDF” pra mandar por e-mail ao contador.</p>

      {espelhos.map(({ pessoa, linhas, totais }) => {
        const f = fichaDe.get(pessoa.id);
        const maxBat = Math.max(4, ...linhas.map((l) => l.colunas.length + (l.colunas.length % 2)));
        return (
          <section key={pessoa.id} className="cartao mb-6 p-4 text-xs tabular-nums print:mb-0 print:break-after-page print:rounded-none print:p-0 print:shadow-none">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-texto">Espelho de ponto · {pessoa.nome}</h2>
              <span className="text-texto-suave">{dma(de)} a {dma(ate)}</span>
            </div>
            <p className="mb-2 text-texto-suave">
              {[f?.matricula ? `Matrícula ${f.matricula}` : null, pessoa.cpf ? `CPF ${pessoa.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}` : null, f?.pis ? `PIS ${f.pis}` : null, f?.funcao,
                pessoa.admissao ? `Admissão ${dma(pessoa.admissao)}` : null].filter(Boolean).join(" · ")}
            </p>
            <table className="w-full">
              <thead><tr>
                <th className={CAB}>Dia</th><th className={CAB}>Horário</th>
                {Array.from({ length: maxBat }, (_, i) => <th key={i} className={CAB}>{i % 2 === 0 ? `Ent.${i / 2 + 1}` : `Saí.${(i + 1) / 2}`}</th>)}
                <th className={`${CAB} text-right`}>Normais</th><th className={`${CAB} text-right`}>Falta</th><th className={`${CAB} text-right`}>Extra</th><th className={CAB}>Obs.</th>
              </tr></thead>
              <tbody>
                {linhas.map((l) => {
                  const normais = l.previstoMin > 0 ? Math.min(l.trabalhadoMin, l.previstoMin) : 0;
                  return (
                    <tr key={l.dia} className="border-b border-borda">
                      <td className="whitespace-nowrap px-1.5 py-0.5">{dm(l.dia)} {DOW[l.dow]}</td>
                      <td className="px-1.5 py-0.5 text-texto-suave">{l.horario}</td>
                      {Array.from({ length: maxBat }, (_, i) => <td key={i} className="px-1.5 py-0.5">{l.colunas[i] ? hhmm(l.colunas[i]!.min) : ""}</td>)}
                      <td className="px-1.5 py-0.5 text-right">{normais ? duracao(normais) : ""}</td>
                      <td className="px-1.5 py-0.5 text-right">{l.faltaMin ? duracao(l.faltaMin) : ""}</td>
                      <td className="px-1.5 py-0.5 text-right">{l.extraMin ? duracao(l.extraMin) : ""}</td>
                      <td className="px-1.5 py-0.5">{[l.justificativa ?? SIT[l.situacao], l.atrasoMin ? `atraso ${l.atrasoMin} min` : null].filter(Boolean).join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="font-semibold">
                <td className="px-1.5 py-1" colSpan={2 + maxBat}>Total · {totais.diasTrabalhados} dias trabalhados{totais.faltas ? ` · ${totais.faltas} falta(s)` : ""}{totais.noturno ? ` · noturno ${duracao(totais.noturno)}` : ""}</td>
                <td className="px-1.5 py-1 text-right">{duracao(Math.max(0, totais.previsto - totais.faltante))}</td>
                <td className="px-1.5 py-1 text-right">{duracao(totais.faltante)}</td>
                <td className="px-1.5 py-1 text-right">{duracao(totais.extra)}</td>
                <td></td>
              </tr></tfoot>
            </table>
            <div className="mt-10 grid grid-cols-2 gap-16 text-center">
              <div className="border-t border-texto pt-1">{pessoa.nome}</div>
              <div className="border-t border-texto pt-1">Brasa Pizza Ivoti</div>
            </div>
          </section>
        );
      })}
      {!espelhos.length && <p className="cartao p-8 text-center text-sm text-texto-fraco">Ninguém bateu ponto no período.</p>}
    </div>
  );
}
