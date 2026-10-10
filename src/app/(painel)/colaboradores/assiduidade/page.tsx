import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { mesesDoTrimestre, periodoMes, rotuloMes, trimestreDe } from "@/lib/assiduidade-core";
import { apurarAssiduidade, hojeSP, lerConfig } from "@/lib/assiduidade-server";
import { salvarConfigAssiduidade } from "./actions";
import { ApagarAtestado, LancarTrimestre, NovoAtestado } from "./client";

export const metadata = { title: "Assiduidade · Brasa" };
export const dynamic = "force-dynamic";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const CAMPO = "min-h-10 rounded-controle border border-borda-forte bg-transparent px-2 text-sm";

function mesAnterior(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// PRÊMIO ASSIDUIDADE (migration 0222) — pra quem bate ponto no relógio.
// R$ 100 por mês sem falta, sem folga pedida, sem atestado e com até 15 min
// de atraso somados; paga a cada 3 meses no acerto da semana.
export default async function AssiduidadePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirAcesso("/colaboradores");
  const { mes: mesParam } = await searchParams;
  const hoje = hojeSP();
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? (mesParam as string) : hoje.slice(0, 7);
  const supabase = await createClient();
  const cfg = await lerConfig(supabase);
  const tri = trimestreDe(mes);
  const mesesTri = mesesDoTrimestre(tri);

  const [doMes, ...doTri] = await Promise.all([apurarAssiduidade(supabase, mes, cfg), ...mesesTri.map((m) => apurarAssiduidade(supabase, m, cfg))]);
  const [{ data: ats }, { data: pagos }, { data: todosCols }] = await Promise.all([
    supabase.from("atestados").select("id, inicio, fim, motivo, colaboradores(nome)").order("inicio", { ascending: false }).limit(30),
    supabase.from("assiduidade_pagamentos").select("colaborador_id, meses, valor, segunda").eq("trimestre", tri),
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const pagoDe = new Map(((pagos ?? []) as { colaborador_id: string; meses: number; valor: number; segunda: string }[]).map((p) => [p.colaborador_id, p]));
  const fimTri = periodoMes(mesesTri[2], cfg.dia_inicio_mes).ate;
  const triAcabou = hoje > fimTri;
  const fimDoMes = (m: string) => periodoMes(m, cfg.dia_inicio_mes).ate;

  const selo = (g: boolean | null, emAndamento: boolean) =>
    g === null ? <span className="text-texto-fraco">—</span>
      : !g ? <span className="font-semibold text-red-600">perdeu</span>
        : emAndamento ? <span className="text-amber-700 dark:text-amber-400">até agora ok</span>
          : <span className="font-semibold text-emerald-600">ganhou</span>;

  return (
    <div className="w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-texto"><Icone nome="relogio" tamanho={22} /> Prêmio assiduidade</h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            {brl(cfg.valor_mes)} por mês pra quem bate ponto e fecha o mês sem falta, sem folga pedida, sem atestado e com até {cfg.tolerancia_min} min de atraso somados. Paga a cada 3 meses no acerto da semana.
            {" "}<Link href="/colaboradores/semana" className="text-orange-600 hover:underline">Semana e 10%</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/colaboradores/assiduidade?mes=${mesAnterior(mes, -1)}`} className="rounded-controle border border-borda-forte px-3 py-2">←</Link>
          <span className="rounded-controle bg-orange-500 px-3 py-2 font-semibold text-white">{rotuloMes(mes)}</span>
          <Link href={`/colaboradores/assiduidade?mes=${mesAnterior(mes, 1)}`} className="rounded-controle border border-borda-forte px-3 py-2">→</Link>
        </div>
      </div>

      {!cfg.ativo && <p className="mb-4 rounded-controle bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">O prêmio está desligado nas regras abaixo.</p>}

      <section className="mb-6 overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-texto-fraco">
            <tr><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2 text-right">Dias na escala</th><th className="px-3 py-2 text-right">Atraso somado</th><th className="px-3 py-2">Faltas · folgas · atestados</th><th className="px-3 py-2">Mês</th></tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {doMes.pessoas.map((p) => {
              const r = p.resultado;
              const estourou = r.atrasoTotal > cfg.tolerancia_min;
              return (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-texto">{p.nome}</div>
                    <div className="text-xs text-texto-fraco">escala: {p.escala.length ? [...p.escala].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DOW[d]).join(", ") : "sem dias de dia no cadastro"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{r.esperados}</td>
                  <td className={`px-3 py-2 text-right ${estourou ? "font-semibold text-red-600" : ""}`}>
                    {r.atrasoTotal} min
                    {r.atrasos.length > 0 && <div className="text-xs font-normal text-texto-fraco">{r.atrasos.map((a) => `${dm(a.dia)} ${a.chegou} (+${a.min})`).join(" · ")}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.faltas.length > 0 && <div className="text-red-600">faltas: {r.faltas.map(dm).join(", ")}</div>}
                    {r.folgas.length > 0 && <div className="text-amber-700 dark:text-amber-400">folgas: {r.folgas.map(dm).join(", ")}</div>}
                    {r.atestados.length > 0 && <div className="text-amber-700 dark:text-amber-400">atestado: {r.atestados.map(dm).join(", ")}</div>}
                    {!r.faltas.length && !r.folgas.length && !r.atestados.length && <span className="text-texto-fraco">nenhuma</span>}
                  </td>
                  <td className="px-3 py-2">
                    {selo(r.ganhou, hoje <= fimDoMes(mes))}
                    {r.motivos.length > 0 && <div className="text-xs text-texto-fraco">{r.motivos.join(" · ")}</div>}
                  </td>
                </tr>
              );
            })}
            {doMes.pessoas.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-texto-fraco">Ninguém marcado &quot;Bate ponto no relógio&quot; em Colaboradores.</td></tr>}
          </tbody>
        </table>
        <p className="px-3 pb-2 text-xs text-texto-fraco">Período {dm(doMes.de)} a {dm(doMes.ate)}{cfg.inicio ? ` · conta desde ${dm(cfg.inicio)}` : ""}. Falta só conta em dia que já passou.</p>
      </section>

      <section className="mb-6 rounded-cartao border border-borda p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Trimestre {tri.replace("-T", " · T")} ({mesesTri.map(rotuloMes).join(", ")})</h2>
          {triAcabou ? <LancarTrimestre trimestre={tri} /> : <span className="text-xs text-texto-fraco">paga depois de {dm(fimTri)}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-texto-fraco"><tr><th className="py-1">Pessoa</th>{mesesTri.map((m) => <th key={m} className="py-1">{rotuloMes(m)}</th>)}<th className="py-1 text-right">A receber</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {doMes.pessoas.map((p) => {
                const res = doTri.map((a) => a.pessoas.find((x) => x.id === p.id)?.resultado.ganhou ?? null);
                const meses = res.filter((g) => g === true).length;
                const pago = pagoDe.get(p.id);
                return (
                  <tr key={p.id}>
                    <td className="py-1.5">{p.nome}</td>
                    {res.map((g, i) => <td key={i} className="py-1.5">{selo(g, hoje <= fimDoMes(mesesTri[i]))}</td>)}
                    <td className="py-1.5 text-right">{pago ? <span className="text-emerald-600">{brl(Number(pago.valor))} pago na semana de {dm(pago.segunda)}</span> : brl(meses * cfg.valor_mes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-cartao border border-borda p-4">
          <h2 className="mb-2 font-semibold">Atestados</h2>
          <NovoAtestado pessoas={((todosCols ?? []) as { id: string; nome: string }[])} hoje={hoje} />
          <ul className="mt-3 divide-y divide-borda text-sm">
            {((ats ?? []) as { id: string; inicio: string; fim: string; motivo: string | null; colaboradores: { nome: string } | { nome: string }[] | null }[]).map((a) => {
              const c = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores;
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{c?.nome ?? "—"} · {dm(a.inicio)}{a.fim !== a.inicio ? ` a ${dm(a.fim)}` : ""}{a.motivo ? ` · ${a.motivo}` : ""}</span>
                  <ApagarAtestado id={a.id} />
                </li>
              );
            })}
            {(ats ?? []).length === 0 && <li className="py-2 text-texto-fraco">Nenhum atestado registrado.</li>}
          </ul>
        </section>

        <section className="rounded-cartao border border-borda p-4">
          <h2 className="mb-2 font-semibold">Regras</h2>
          <form action={salvarConfigAssiduidade} className="space-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="ativo" defaultChecked={cfg.ativo} className="h-4 w-4" /> Prêmio ligado</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2">R$ por mês <input name="valor_mes" defaultValue={cfg.valor_mes} inputMode="decimal" className={`${CAMPO} w-20 text-right`} /></label>
              <label className="flex items-center gap-2">Tolerância (min no mês) <input name="tolerancia_min" defaultValue={cfg.tolerancia_min} inputMode="numeric" className={`${CAMPO} w-16 text-right`} /></label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2">Mês começa no dia <input name="dia_inicio_mes" defaultValue={cfg.dia_inicio_mes} inputMode="numeric" className={`${CAMPO} w-14 text-right`} /></label>
              <label className="flex items-center gap-2">Conta desde <input type="date" name="inicio" defaultValue={cfg.inicio ?? ""} className={CAMPO} /></label>
            </div>
            <div>
              <p className="mb-1 text-xs text-texto-suave">Entrada (em cima) e saída (embaixo) do turno do dia; vazio = não trabalha. Igual ao &quot;Horário Restaurante&quot; do RHiD. A saída serve pras horas previstas e extras dos relatórios.</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d} className="flex flex-col gap-1 text-xs text-texto-fraco">{DOW[d]}<input type="time" name={`entrada_${d}`} defaultValue={cfg.entradas[String(d)] ?? ""} className={CAMPO} title="Entrada" /><input type="time" name={`saida_${d}`} defaultValue={cfg.saidas[String(d)] ?? ""} className={CAMPO} title="Saída" /></label>
                ))}
              </div>
            </div>
            <Enviar className="min-h-10 rounded-controle bg-texto px-4 font-semibold text-fundo">Salvar regras</Enviar>
          </form>
        </section>
      </div>
    </div>
  );
}
