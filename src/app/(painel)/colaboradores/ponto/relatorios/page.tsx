import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Icone } from "@/components/icone";
import { diasEntre } from "@/lib/assiduidade-core";
import { hojeSP } from "@/lib/assiduidade-server";
import { duracao } from "@/lib/ponto-relatorio-core";
import { ciclosRecentes, espelhosDoPeriodo, fechamentosDoCiclo, cicloDoDia } from "@/lib/ponto-espelho";
import { absenteismo, resumoMes, turnover, type PessoaTurnover } from "@/lib/ponto-relatorios-core";
import { BaixarCsv, ImprimirRelatorio } from "./baixar";

export const metadata = { title: "Relatórios do ponto · Brasa" };
export const dynamic = "force-dynamic";

// Etapa 4 da saída do RHiD (27/10/2026): os relatórios do menu "Relatórios"
// dele — fechamento pro contador, alterações de ponto, absenteísmo,
// afastamentos e turnover. Período padrão = último mês da folha (21 a 20).
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const RELS = [
  { k: "contador", r: "Fechamento pro contador" },
  { k: "alteracoes", r: "Alterações de ponto" },
  { k: "absenteismo", r: "Absenteísmo" },
  { k: "afastamentos", r: "Afastamentos" },
  { k: "turnover", r: "Admissões e desligamentos" },
] as const;
type Rel = (typeof RELS)[number]["k"];

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dma = (d: string) => `${dm(d)}/${d.slice(0, 4)}`;
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const horaLocal = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const um = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
const CAB = "px-2 py-2 text-left text-xs font-medium text-texto-fraco whitespace-nowrap";
const CABN = `${CAB} text-right`;
const CEL = "px-2 py-1.5 text-right whitespace-nowrap";

export default async function RelatoriosPontoPage({ searchParams }: { searchParams: Promise<{ rel?: string; de?: string; ate?: string }> }) {
  await exigirAcesso("/colaboradores");
  const sp = await searchParams;
  const hoje = hojeSP();
  const ciclos = ciclosRecentes(hoje, 4);
  const padrao = ciclos[1]; // o mês que acabou de fechar
  const de = DATA.test(sp.de ?? "") ? (sp.de as string) : padrao.de;
  const ate = DATA.test(sp.ate ?? "") && (sp.ate as string) >= de ? (sp.ate as string) : padrao.ate;
  const rel: Rel = RELS.some((r) => r.k === sp.rel) ? (sp.rel as Rel) : "contador";
  const q = (o: Record<string, string>) => `/colaboradores/ponto/relatorios?${new URLSearchParams({ rel, de, ate, ...o }).toString()}`;
  const supabase = await createClient();
  const titulo = RELS.find((r) => r.k === rel)!.r;
  const nomeArquivo = `${rel}-${de}-a-${ate}`;

  return (
    <div className="w-full max-w-6xl p-4 sm:p-6">
      <Link href="/colaboradores/ponto" className="text-sm font-semibold text-texto-marca hover:underline print:hidden">← Relatórios de ponto</Link>
      <h1 className="mt-2 flex items-center gap-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto print:text-xl">
        <Icone nome="documento" tamanho={22} /> <span className="print:hidden">Relatórios do ponto</span><span className="hidden print:inline">{titulo}</span>
      </h1>
      <p className="mb-4 mt-1 text-sm text-texto-suave">De {dma(de)} a {dma(ate)} · quem bate ponto no relógio.</p>

      <nav className="mb-3 flex flex-wrap gap-2 print:hidden" aria-label="Relatório">
        {RELS.map((r) => (
          <Link key={r.k} href={q({ rel: r.k })} aria-current={r.k === rel ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${r.k === rel ? "bg-texto text-painel-cartao" : "cartao text-texto"}`}>
            {r.r}
          </Link>
        ))}
      </nav>

      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm print:hidden">
        <input type="hidden" name="rel" value={rel} />
        <label className="flex flex-col text-xs text-texto-fraco">Início<input type="date" name="de" defaultValue={de} className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto" /></label>
        <label className="flex flex-col text-xs text-texto-fraco">Fim<input type="date" name="ate" defaultValue={ate} className="min-h-11 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto" /></label>
        <button className="btn-principal">Buscar</button>
        {ciclos.slice(1).map((c) => (
          <Link key={c.de} href={q({ de: c.de, ate: c.ate })} className="inline-flex min-h-11 items-center px-2 text-xs text-texto-suave hover:underline">{dm(c.de)} a {dm(c.ate)}</Link>
        ))}
      </form>

      {rel === "contador" && <Contador de={de} ate={ate} hoje={hoje} nomeArquivo={nomeArquivo} supabase={supabase} />}
      {rel === "alteracoes" && <Alteracoes de={de} ate={ate} nomeArquivo={nomeArquivo} supabase={supabase} />}
      {rel === "absenteismo" && <AbsenteismoRel de={de} ate={ate} nomeArquivo={nomeArquivo} supabase={supabase} />}
      {rel === "afastamentos" && <Afastamentos de={de} ate={ate} nomeArquivo={nomeArquivo} supabase={supabase} />}
      {rel === "turnover" && <TurnoverRel de={de} ate={ate} nomeArquivo={nomeArquivo} supabase={supabase} />}
    </div>
  );
}

type Sb = Awaited<ReturnType<typeof createClient>>;
type P = { de: string; ate: string; nomeArquivo: string; supabase: Sb };

function Acoes({ csv }: { csv: { nome: string; cabecalho: string[]; linhas: (string | number)[][] } }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2 print:hidden">
      <ImprimirRelatorio />
      <BaixarCsv {...csv} />
    </div>
  );
}

// ---------- Fechamento pro contador ----------
async function Contador({ de, ate, hoje, nomeArquivo, supabase }: P & { hoje: string }) {
  const espelhos = await espelhosDoPeriodo(supabase, de, ate);
  const ids = espelhos.map((e) => e.pessoa.id);
  const ciclo = cicloDoDia(de);
  const cicloInteiro = ciclo.de === de && ciclo.ate === ate;
  const [{ data: fichas }, fechamentos] = await Promise.all([
    ids.length ? supabase.from("colaboradores").select("id, matricula, numero_folha, funcao, pis").in("id", ids) : Promise.resolve({ data: [] }),
    cicloInteiro ? fechamentosDoCiclo(supabase, de, ids) : Promise.resolve(null),
  ]);
  const fichaDe = new Map(((fichas ?? []) as { id: string; matricula: string | null; numero_folha: string | null; funcao: string | null; pis: string | null }[]).map((f) => [f.id, f]));
  const linhas = espelhos.map((e) => ({ e, r: resumoMes(e.linhas, e.totais), f: fichaDe.get(e.pessoa.id) }));
  const justTxt = (j: Record<string, number>) => Object.entries(j).map(([k, v]) => `${k} ${v} ${v === 1 ? "dia" : "dias"}`).join(" · ");
  const abertos = fechamentos ? espelhos.filter((e) => !fechamentos.has(e.pessoa.id)) : [];
  const csv = {
    nome: nomeArquivo,
    cabecalho: ["Nome", "Matrícula", "Nº folha", "Cargo", "PIS", "Dias trabalhados", "Horas normais", "Faltas (dias)", "Falta e atraso (h)", "Extra dia útil (h)", "Extra sábado (h)", "Extra domingo (h)", "Extra feriado (h)", "Noturno (h)", "DSR perdidos", "Justificativas", "Folgas"],
    linhas: linhas.map(({ e, r, f }) => [e.pessoa.nome, f?.matricula ?? "", f?.numero_folha ?? "", f?.funcao ?? "", f?.pis ?? "", r.diasTrabalhados, duracao(r.horasNormais), r.faltas, duracao(r.faltaMin),
      duracao(r.extraPor.normal), duracao(r.extraPor.sabado), duracao(r.extraPor.domingo), duracao(r.extraPor.feriado), duracao(r.noturno), r.dsrPerdidos, justTxt(r.justificados), r.folgas]),
  };
  return (
    <section>
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        <ImprimirRelatorio />
        <BaixarCsv {...csv} />
        <Link href={`/colaboradores/ponto/espelhos?de=${de}&ate=${ate}`} className="btn-secundario"><Icone nome="imprimir" tamanho={16} /> Imprimir os espelhos de todos</Link>
      </div>
      {ate >= hoje && <p className="pilula pilula-urgente mb-3 print:hidden">O período ainda não acabou: os números vão mudar.</p>}
      {abertos.length > 0 && ate < hoje && (
        <p className="mb-3 text-sm text-urgente-texto print:hidden">
          Mês ainda não fechado de {abertos.map((e) => e.pessoa.nome.split(" ")[0]).join(", ")}. <Link href={`/colaboradores/ponto?de=${de}&ate=${ate}`} className="font-semibold underline">Conferir e fechar</Link> antes de mandar pro contador.
        </p>
      )}
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao print:overflow-visible">
        <table className="w-full min-w-[980px] text-sm tabular-nums print:min-w-0 print:text-xs">
          <thead><tr>
            <th className={CAB}>Pessoa</th><th className={CABN}>Dias</th><th className={CABN}>Normais</th><th className={CABN}>Faltas</th><th className={CABN}>Falta e atraso</th>
            <th className={CABN}>Extra dia útil</th><th className={CABN}>Extra sábado</th><th className={CABN}>Extra dom.</th><th className={CABN}>Extra feriado</th><th className={CABN}>Noturno</th><th className={CABN}>DSR perdido</th>
          </tr></thead>
          <tbody className="divide-y divide-borda">
            {linhas.map(({ e, r, f }) => (
              <tr key={e.pessoa.id}>
                <td className="px-2 py-1.5">
                  <Link href={`/colaboradores/ponto?aba=espelho&de=${de}&ate=${ate}&p=${e.pessoa.id}`} className="font-semibold text-texto hover:underline print:no-underline">{e.pessoa.nome}</Link>
                  <span className="block text-xs text-texto-suave">
                    {[f?.matricula ? `mat. ${f.matricula}` : null, f?.funcao, Object.keys(r.justificados).length ? justTxt(r.justificados) : null, r.folgas ? `${r.folgas} folga${r.folgas > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className={CEL}>{r.diasTrabalhados}</td>
                <td className={CEL}>{duracao(r.horasNormais)}</td>
                <td className={`${CEL} ${r.faltas ? "font-semibold text-urgente-texto" : ""}`}>{r.faltas}</td>
                <td className={CEL}>{r.faltaMin ? duracao(r.faltaMin) : "—"}</td>
                <td className={CEL}>{r.extraPor.normal ? duracao(r.extraPor.normal) : "—"}</td>
                <td className={CEL}>{r.extraPor.sabado ? duracao(r.extraPor.sabado) : "—"}</td>
                <td className={CEL}>{r.extraPor.domingo ? duracao(r.extraPor.domingo) : "—"}</td>
                <td className={CEL}>{r.extraPor.feriado ? duracao(r.extraPor.feriado) : "—"}</td>
                <td className={CEL}>{r.noturno ? duracao(r.noturno) : "—"}</td>
                <td className={`${CEL} ${r.dsrPerdidos ? "font-semibold text-urgente-texto" : ""}`}>{r.dsrPerdidos || "—"}</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={11} className="px-2 py-8 text-center text-texto-fraco">Ninguém bateu ponto no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-texto-suave">
        Horas em horas:minutos. Normais = horas do horário menos o que faltou. Extra separada pelo tipo do dia, pra pagar com o percentual de cada um.
        Noturno = horas trabalhadas das 22h às 5h (de relógio). DSR perdido = semanas com falta sem justificativa.
      </p>
    </section>
  );
}

// ---------- Alterações de ponto ----------
async function Alteracoes({ de, ate, nomeArquivo, supabase }: P) {
  const [{ data: bats }, { data: ats }, { data: fechs }] = await Promise.all([
    supabase.from("ponto_batidas").select("id, data, data_hora, origem, obs, criado_por, criado_em, desconsiderada, ajustada_por, ajustada_em, colaboradores(nome)")
      .gte("data", de).lte("data", ate).or("origem.eq.manual,desconsiderada.eq.true,ajustada_em.not.is.null").order("data").limit(1000),
    supabase.from("atestados").select("id, inicio, fim, motivo, tipo, minutos, criado_por, criado_em, colaboradores(nome), justificativa_tipos(nome)")
      .lte("inicio", ate).gte("fim", de).order("inicio").limit(1000),
    supabase.from("ponto_fechamentos").select("id, de, ate, fechado_em, fechado_por, reaberto_em, reaberto_por, colaboradores(nome)")
      .lte("de", ate).gte("ate", de).limit(1000),
  ]);
  type Alt = { quando: string | null; quem: string | null; pessoa: string; dia: string; oque: string; det: string };
  const lista: Alt[] = [];
  type Bat = { data: string; data_hora: string; origem: string; obs: string | null; criado_por: string | null; criado_em: string; desconsiderada: boolean; ajustada_por: string | null; ajustada_em: string | null; colaboradores: { nome: string } | { nome: string }[] | null };
  for (const b of (bats ?? []) as Bat[]) {
    const pessoa = um(b.colaboradores)?.nome ?? "—";
    const dia = String(b.data).slice(0, 10);
    if (b.origem === "manual") lista.push({ quando: b.criado_em, quem: b.criado_por, pessoa, dia, oque: "Incluiu batida", det: `${horaLocal(b.data_hora)}${b.obs ? ` · ${b.obs}` : ""}` });
    if (b.desconsiderada) lista.push({ quando: b.ajustada_em, quem: b.ajustada_por, pessoa, dia, oque: "Desconsiderou batida", det: horaLocal(b.data_hora) });
    else if (b.ajustada_em && b.origem !== "manual") lista.push({ quando: b.ajustada_em, quem: b.ajustada_por, pessoa, dia, oque: "Mudou batida de coluna ou de dia", det: horaLocal(b.data_hora) });
  }
  type At = { inicio: string; fim: string; motivo: string | null; tipo: string | null; minutos: number | null; criado_por: string | null; criado_em: string; colaboradores: { nome: string } | { nome: string }[] | null; justificativa_tipos: { nome: string } | { nome: string }[] | null };
  for (const a of (ats ?? []) as At[]) {
    const ini = String(a.inicio).slice(0, 10), fim = String(a.fim).slice(0, 10);
    const tipo = um(a.justificativa_tipos)?.nome ?? (a.tipo === "abono" ? "Abono" : "Atestado");
    lista.push({ quando: a.criado_em, quem: a.criado_por, pessoa: um(a.colaboradores)?.nome ?? "—", dia: ini, oque: `Justificou: ${tipo}`,
      det: [fim !== ini ? `até ${dm(fim)}` : null, a.minutos ? duracao(Math.abs(a.minutos)) : null, a.motivo].filter(Boolean).join(" · ") });
  }
  type Fe = { de: string; ate: string; fechado_em: string; fechado_por: string | null; reaberto_em: string | null; reaberto_por: string | null; colaboradores: { nome: string } | { nome: string }[] | null };
  for (const f of (fechs ?? []) as Fe[]) {
    const pessoa = um(f.colaboradores)?.nome ?? "—";
    const per = `${dm(String(f.de))} a ${dm(String(f.ate))}`;
    lista.push({ quando: f.fechado_em, quem: f.fechado_por, pessoa, dia: String(f.de).slice(0, 10), oque: "Fechou o mês", det: per });
    if (f.reaberto_em) lista.push({ quando: f.reaberto_em, quem: f.reaberto_por, pessoa, dia: String(f.de).slice(0, 10), oque: "Reabriu o mês", det: per });
  }
  lista.sort((a, b) => a.dia.localeCompare(b.dia) || a.pessoa.localeCompare(b.pessoa) || String(a.quando).localeCompare(String(b.quando)));
  const uids = [...new Set(lista.map((l) => l.quem).filter(Boolean))] as string[];
  const { data: profs } = uids.length ? await supabase.from("profiles").select("id, nome").in("id", uids) : { data: [] };
  const nomeDe = new Map(((profs ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
  const quemTxt = (id: string | null) => (id ? nomeDe.get(id) ?? "—" : "—");
  const csv = {
    nome: nomeArquivo,
    cabecalho: ["Dia", "Pessoa", "O quê", "Detalhe", "Feito por", "Quando"],
    linhas: lista.map((l) => [dma(l.dia), l.pessoa, l.oque, l.det, quemTxt(l.quem), l.quando ? quando(l.quando) : ""]),
  };
  return (
    <section>
      <Acoes csv={csv} />
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao print:overflow-visible">
        <table className="w-full min-w-[760px] text-sm print:min-w-0 print:text-xs">
          <thead><tr><th className={CAB}>Dia</th><th className={CAB}>Pessoa</th><th className={CAB}>O quê</th><th className={CAB}>Detalhe</th><th className={CAB}>Feito por</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {lista.map((l, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5 whitespace-nowrap">{dm(l.dia)}</td>
                <td className="px-2 py-1.5">{l.pessoa}</td>
                <td className="px-2 py-1.5 font-semibold text-texto">{l.oque}</td>
                <td className="px-2 py-1.5 text-texto-suave">{l.det}</td>
                <td className="px-2 py-1.5 text-texto-suave">{quemTxt(l.quem)}<span className="block text-xs">{l.quando ? quando(l.quando) : ""}</span></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="px-2 py-8 text-center text-texto-fraco">Nenhuma alteração no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-texto-suave">Tudo que foi mexido à mão no ponto: batidas incluídas, desconsideradas ou mudadas de lugar, justificativas e fechamentos do mês.</p>
    </section>
  );
}

// ---------- Absenteísmo ----------
async function AbsenteismoRel({ de, ate, nomeArquivo, supabase }: P) {
  const espelhos = await espelhosDoPeriodo(supabase, de, ate);
  const linhas = espelhos.map((e) => ({ e, a: absenteismo(e.linhas) }));
  const tot = linhas.reduce((s, { a }) => ({ previsto: s.previsto + a.previstoMin, faltas: s.faltas + a.faltasMin, atrasos: s.atrasos + a.atrasosMin, just: s.just + a.justificadoMin }), { previsto: 0, faltas: 0, atrasos: 0, just: 0 });
  const totAus = tot.faltas + tot.atrasos + tot.just;
  const csv = {
    nome: nomeArquivo,
    cabecalho: ["Nome", "Horas previstas", "Faltas (h)", "Atrasos e saídas (h)", "Atestados e afastamentos (h)", "Total ausente (h)", "Absenteísmo"],
    linhas: linhas.map(({ e, a }) => [e.pessoa.nome, duracao(a.previstoMin), duracao(a.faltasMin), duracao(a.atrasosMin), duracao(a.justificadoMin), duracao(a.ausenteMin), pct(a.indice)]),
  };
  return (
    <section>
      <Acoes csv={csv} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-cartao bg-destaque p-4"><p className="rotulo">Absenteísmo da equipe</p><p className="numero-grande mt-1 text-[26px] text-texto">{pct(tot.previsto ? totAus / tot.previsto : 0)}</p><p className="text-xs text-texto-suave">{duracao(totAus)} de {duracao(tot.previsto)}</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Faltas</p><p className="numero-grande mt-1 text-[26px] text-texto">{duracao(tot.faltas)}</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Atrasos e saídas</p><p className="numero-grande mt-1 text-[26px] text-texto">{duracao(tot.atrasos)}</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Atestados e afastamentos</p><p className="numero-grande mt-1 text-[26px] text-texto">{duracao(tot.just)}</p></div>
      </div>
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao print:overflow-visible">
        <table className="w-full min-w-[720px] text-sm tabular-nums print:min-w-0 print:text-xs">
          <thead><tr><th className={CAB}>Pessoa</th><th className={CABN}>Previstas</th><th className={CABN}>Faltas</th><th className={CABN}>Atrasos e saídas</th><th className={CABN}>Atestados</th><th className={CABN}>Total ausente</th><th className={CABN}>Absenteísmo</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {linhas.map(({ e, a }) => (
              <tr key={e.pessoa.id}>
                <td className="px-2 py-1.5 font-semibold text-texto">{e.pessoa.nome}</td>
                <td className={CEL}>{duracao(a.previstoMin)}</td>
                <td className={CEL}>{a.faltasMin ? duracao(a.faltasMin) : "—"}</td>
                <td className={CEL}>{a.atrasosMin ? duracao(a.atrasosMin) : "—"}</td>
                <td className={CEL}>{a.justificadoMin ? duracao(a.justificadoMin) : "—"}</td>
                <td className={CEL}>{duracao(a.ausenteMin)}</td>
                <td className={`${CEL} font-semibold ${a.indice >= 0.05 ? "text-urgente-texto" : "text-texto"}`}>{pct(a.indice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-texto-suave">Absenteísmo = tempo em que a pessoa deveria estar e não estava (falta, atraso, saída antes e atestado) sobre as horas do horário dela. Folga combinada não conta. Acima de 5% aparece em vermelho.</p>
    </section>
  );
}

// ---------- Afastamentos ----------
async function Afastamentos({ de, ate, nomeArquivo, supabase }: P) {
  const { data } = await supabase.from("atestados").select("id, inicio, fim, motivo, tipo, arquivo_url, colaboradores(nome), justificativa_tipos(nome, efeito)")
    .lte("inicio", ate).gte("fim", de).order("inicio").limit(1000);
  type A = { id: string; inicio: string; fim: string; motivo: string | null; tipo: string | null; arquivo_url: string | null; colaboradores: { nome: string } | { nome: string }[] | null; justificativa_tipos: { nome: string; efeito: string } | { nome: string; efeito: string }[] | null };
  const lista = ((data ?? []) as A[])
    .filter((a) => (um(a.justificativa_tipos)?.efeito ?? "dia") === "dia")
    .map((a) => {
      const ini = String(a.inicio).slice(0, 10), fim = String(a.fim).slice(0, 10);
      const noPeriodo = diasEntre(ini < de ? de : ini, fim > ate ? ate : fim).length;
      return { id: a.id, pessoa: um(a.colaboradores)?.nome ?? "—", tipo: um(a.justificativa_tipos)?.nome ?? (a.tipo === "abono" ? "Abono" : "Atestado"), ini, fim, dias: diasEntre(ini, fim).length, noPeriodo, motivo: a.motivo ?? "", arquivo: !!a.arquivo_url };
    });
  const porTipo = new Map<string, number>();
  for (const a of lista) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + a.noPeriodo);
  const csv = {
    nome: nomeArquivo,
    cabecalho: ["Pessoa", "Tipo", "De", "Até", "Dias", "Dias no período", "Motivo", "Tem arquivo"],
    linhas: lista.map((a) => [a.pessoa, a.tipo, dma(a.ini), dma(a.fim), a.dias, a.noPeriodo, a.motivo, a.arquivo ? "sim" : "não"]),
  };
  return (
    <section>
      <Acoes csv={csv} />
      {porTipo.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...porTipo].map(([t, n]) => <span key={t} className="pilula">{t}: {n} {n === 1 ? "dia" : "dias"}</span>)}
        </div>
      )}
      <div className="overflow-x-auto rounded-cartao bg-painel-cartao print:overflow-visible">
        <table className="w-full min-w-[720px] text-sm print:min-w-0 print:text-xs">
          <thead><tr><th className={CAB}>Pessoa</th><th className={CAB}>Tipo</th><th className={CAB}>Período</th><th className={CABN}>Dias</th><th className={CAB}>Motivo</th></tr></thead>
          <tbody className="divide-y divide-borda">
            {lista.map((a) => (
              <tr key={a.id}>
                <td className="px-2 py-1.5 font-semibold text-texto">{a.pessoa}</td>
                <td className="px-2 py-1.5">{a.tipo}{a.arquivo && <span className="pilula pilula-neutra ml-2">com arquivo</span>}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{a.ini === a.fim ? dma(a.ini) : `${dma(a.ini)} a ${dma(a.fim)}`}</td>
                <td className={CEL}>{a.dias}{a.noPeriodo !== a.dias && <span className="block text-xs text-texto-suave">{a.noPeriodo} no período</span>}</td>
                <td className="px-2 py-1.5 text-texto-suave">{a.motivo}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="px-2 py-8 text-center text-texto-fraco">Nenhum atestado, férias ou afastamento no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-texto-suave">Justificativas de dia inteiro (atestado, férias, licenças). As de horas aparecem em Alterações de ponto.</p>
    </section>
  );
}

// ---------- Admissões e desligamentos (turnover) ----------
async function TurnoverRel({ de, ate, nomeArquivo, supabase }: P) {
  // Equipe registrada: carteira assinada ou quem bate ponto (bate ponto = CLT).
  const { data } = await supabase.from("colaboradores").select("id, nome, admissao, desligado_em, desligado_motivo, funcao, vinculo, bate_ponto, motivos_demissao(nome)")
    .or("vinculo.eq.clt,bate_ponto.eq.true").order("nome");
  type C = { id: string; nome: string; admissao: string | null; desligado_em: string | null; desligado_motivo: string | null; funcao: string | null; motivos_demissao: { nome: string } | { nome: string }[] | null };
  const cs = (data ?? []) as C[];
  const pessoas: PessoaTurnover[] = cs.map((c) => ({ id: c.id, nome: c.nome, admissao: c.admissao ? String(c.admissao).slice(0, 10) : null, desligamento: c.desligado_em ? String(c.desligado_em).slice(0, 10) : null }));
  const t = turnover(pessoas, de, ate);
  const extra = new Map(cs.map((c) => [c.id, c]));
  const semAdmissao = cs.filter((c) => !c.admissao && !c.desligado_em);
  const csv = {
    nome: nomeArquivo,
    cabecalho: ["Movimento", "Nome", "Data", "Cargo", "Motivo"],
    linhas: [
      ...t.admitidos.map((p) => ["Admissão", p.nome, dma(p.admissao!), extra.get(p.id)?.funcao ?? "", ""]),
      ...t.desligados.map((p) => ["Desligamento", p.nome, dma(p.desligamento!), extra.get(p.id)?.funcao ?? "", um(extra.get(p.id)?.motivos_demissao)?.nome ?? extra.get(p.id)?.desligado_motivo ?? ""]),
    ],
  };
  const lista = (titulo: string, itens: PessoaTurnover[], data: (p: PessoaTurnover) => string, motivo = false) => (
    <section className="cartao p-4">
      <p className="rotulo mb-2">{titulo} ({itens.length})</p>
      {itens.length ? (
        <ul className="divide-y divide-borda text-sm">
          {itens.map((p) => {
            const c = extra.get(p.id);
            return (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <Link href={`/colaboradores/${p.id}`} className="font-semibold text-texto hover:underline">{p.nome}</Link>
                  <span className="block text-xs text-texto-suave">{[c?.funcao, motivo ? um(c?.motivos_demissao)?.nome ?? c?.desligado_motivo : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="font-numero">{dma(data(p))}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-texto-fraco">Ninguém no período.</p>}
    </section>
  );
  return (
    <section>
      <Acoes csv={csv} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-cartao bg-destaque p-4"><p className="rotulo">Turnover</p><p className="numero-grande mt-1 text-[26px] text-texto">{pct(t.indice)}</p><p className="text-xs text-texto-suave">no período</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Equipe no início</p><p className="numero-grande mt-1 text-[26px] text-texto">{t.inicio}</p><p className="text-xs text-texto-suave">em {dma(de)}</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Equipe no fim</p><p className="numero-grande mt-1 text-[26px] text-texto">{t.fim}</p><p className="text-xs text-texto-suave">em {dma(ate)}</p></div>
        <div className="rounded-cartao bg-superficie-suave p-4"><p className="rotulo">Entraram / saíram</p><p className="numero-grande mt-1 text-[26px] text-texto">{t.admitidos.length} / {t.desligados.length}</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {lista("Admissões", t.admitidos, (p) => p.admissao!)}
        {lista("Desligamentos", t.desligados, (p) => p.desligamento!, true)}
      </div>
      <p className="mt-3 text-xs text-texto-suave">
        Conta a equipe registrada (carteira assinada ou quem bate ponto). Turnover = média de entradas e saídas sobre a média da equipe no período.
        {semAdmissao.length > 0 && <> Sem data de admissão na ficha (contam como antigos): {semAdmissao.map((c) => c.nome.split(" ")[0]).join(", ")}.</>}
      </p>
    </section>
  );
}
