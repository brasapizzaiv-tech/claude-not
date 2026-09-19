import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/checklists-core";

export const metadata = { title: "Histórico de checklists · Brasa" };
export const dynamic = "force-dynamic";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const inputCls = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export default async function HistoricoChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; setor?: string; pessoa?: string }>;
}) {
  const sp = await searchParams;
  const hoje = core.hojeSP();
  const de = core.diaValido(sp.de ?? "") ? sp.de! : core.addDiasIso(hoje, -29);
  const ate = core.diaValido(sp.ate ?? "") ? sp.ate! : hoje;
  const supabase = await createClient();
  const db = supabase as unknown as core.Db;

  const [setores, modelos, { data: execRows }] = await Promise.all([
    core.listarSetores(db, true),
    core.listarModelos(db, true),
    supabase
      .from("checklist_execucoes")
      .select("id, modelo_id, data, iniciado_em, iniciado_nome, concluido_em, concluido_nome")
      .gte("data", de).lte("data", ate)
      .order("data", { ascending: false }),
  ]);
  let execs = (execRows as core.Execucao[]) ?? [];
  const porModelo = new Map(modelos.map((m) => [m.id, m]));
  if (sp.setor) execs = execs.filter((e) => porModelo.get(e.modelo_id)?.setor_id === sp.setor);
  if (sp.pessoa) execs = execs.filter((e) => [e.iniciado_nome, e.concluido_nome].filter(Boolean).join(" ").toLowerCase().includes(sp.pessoa!.toLowerCase()));

  const itens = await core.listarItens(db, [...new Set(execs.map((e) => e.modelo_id))]);
  const respostas = await core.respostasDe(db, execs.map((e) => e.id));

  // Resumo por setor + itens que mais ficam pendentes
  type Res = { nome: string; cor: string | null; listas: number; concluidas: number; itens: number; feitos: number };
  const porSetor = new Map<string, Res>();
  const pendentePorItem = new Map<string, { texto: string; setor: string; n: number }>();
  for (const e of execs) {
    const m = porModelo.get(e.modelo_id);
    if (!m) continue;
    const s = setores.find((x) => x.id === m.setor_id);
    const r = porSetor.get(m.setor_id) ?? { nome: s?.nome ?? "—", cor: s?.cor ?? null, listas: 0, concluidas: 0, itens: 0, feitos: 0 };
    r.listas++;
    if (e.concluido_em) r.concluidas++;
    const meus = itens.filter((i) => i.modelo_id === m.id);
    const resp = respostas.filter((x) => x.execucao_id === e.id);
    const sit = core.situacao(meus, resp, e);
    r.itens += sit.total; r.feitos += sit.feitos;
    porSetor.set(m.setor_id, r);
    const porItem = new Map(resp.map((x) => [x.item_id, x]));
    for (const i of meus) {
      if (core.itemRespondido(i, porItem.get(i.id))) continue;
      const p = pendentePorItem.get(i.id) ?? { texto: i.texto, setor: s?.nome ?? "—", n: 0 };
      p.n++;
      pendentePorItem.set(i.id, p);
    }
  }
  const resumo = [...porSetor.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const maisPendentes = [...pendentePorItem.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  const card = "rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link href="/checklists" className="text-sm text-zinc-500 hover:text-orange-600">← Checklists de hoje</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50"><Icone nome="caderno" tamanho={20} className="mr-2" /> Histórico de checklists</h1>
          <p className="mt-1 text-zinc-500">Quem fez, quando, e o que mais fica pendente.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div><label className="mb-1 block text-xs text-zinc-500">De</label><input type="date" name="de" defaultValue={de} className={inputCls} /></div>
          <div><label className="mb-1 block text-xs text-zinc-500">Até</label><input type="date" name="ate" defaultValue={ate} className={inputCls} /></div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Setor</label>
            <select name="setor" defaultValue={sp.setor ?? ""} className={inputCls}>
              <option value="">todos</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-xs text-zinc-500">Pessoa</label><input name="pessoa" defaultValue={sp.pessoa ?? ""} placeholder="nome" className={`${inputCls} w-28`} /></div>
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">Filtrar</button>
        </form>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Conclusão por setor</p>
          {resumo.length === 0 ? <p className="text-sm text-zinc-400">Nada no período.</p> : (
            <ul className="space-y-1.5 text-sm">
              {resumo.map((r) => {
                const pct = r.listas === 0 ? 0 : Math.round((r.concluidas / r.listas) * 100);
                const pctItens = r.itens === 0 ? 0 : Math.round((r.feitos / r.itens) * 100);
                return (
                  <li key={r.nome} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 font-medium" style={{ color: r.cor ?? undefined }}>{r.nome}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-32 shrink-0 text-right text-xs text-zinc-500">{pct}% das listas · {pctItens}% dos itens</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={card}>
          <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Itens que mais ficam pendentes</p>
          {maisPendentes.length === 0 ? <p className="text-sm text-zinc-400">Nenhum pendente.</p> : (
            <ol className="space-y-1 text-sm">
              {maisPendentes.map((p, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="w-6 text-right font-bold text-red-600">{p.n}×</span>
                  <span className="text-zinc-800 dark:text-zinc-100">{p.texto}</span>
                  <span className="text-xs text-zinc-400">{p.setor}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr><th className="px-4 py-2">Dia</th><th className="px-4 py-2">Lista</th><th className="px-4 py-2">Quem</th><th className="px-4 py-2 text-right">Itens</th><th className="px-4 py-2">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {execs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Nenhuma execução no período.</td></tr>}
            {execs.map((e) => {
              const m = porModelo.get(e.modelo_id);
              const meus = itens.filter((i) => i.modelo_id === e.modelo_id);
              const sit = core.situacao(meus, respostas.filter((r) => r.execucao_id === e.id), e);
              const s = setores.find((x) => x.id === m?.setor_id);
              return (
                <tr key={e.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-2 tabular-nums text-zinc-500">{core.dataCurta(e.data)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/checklists?dia=${e.data}&ver=${e.modelo_id}`} className="font-medium text-zinc-900 hover:text-orange-600 hover:underline dark:text-zinc-100">{m?.nome ?? "—"}</Link>
                    <span className="ml-2 text-xs" style={{ color: s?.cor ?? undefined }}>{s?.nome}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {e.iniciado_nome ?? "—"} {hora(e.iniciado_em)}
                    {e.concluido_em && <span className="block">✓ {e.concluido_nome ?? "—"} {hora(e.concluido_em)}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{sit.feitos}/{sit.total}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.concluido_em ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {e.concluido_em ? "concluída" : "em andamento"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
