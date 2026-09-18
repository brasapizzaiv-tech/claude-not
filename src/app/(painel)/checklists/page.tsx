import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/checklists-core";
import { ChecklistItensVista } from "@/components/checklist-itens-vista";

export const metadata = { title: "Checklists de hoje · Brasa" };
export const dynamic = "force-dynamic";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export default async function ChecklistsHojePage({ searchParams }: { searchParams: Promise<{ dia?: string; ver?: string }> }) {
  const sp = await searchParams;
  const hoje = core.hojeSP();
  const dia = core.diaValido(sp.dia ?? "") ? sp.dia! : hoje;
  const supabase = await createClient();
  const db = supabase as unknown as core.Db;

  const [setores, modelos] = await Promise.all([core.listarSetores(db), core.listarModelos(db)]);
  const valem = modelos.filter((m) => core.valeNoDia(m, dia));
  const [itens, execs] = await Promise.all([
    core.listarItens(db, valem.map((m) => m.id)),
    core.execucoesDoDia(db, dia),
  ]);
  const respostas = await core.respostasDe(db, execs.map((e) => e.id));

  const linhas = valem.map((m) => {
    const exec = execs.find((e) => e.modelo_id === m.id) ?? null;
    const meus = itens.filter((i) => i.modelo_id === m.id);
    const resp = exec ? respostas.filter((r) => r.execucao_id === exec.id) : [];
    return { modelo: m, itens: meus, exec, resp, s: core.situacao(meus, resp, exec) };
  });
  const totais = {
    listas: linhas.length,
    concluidas: linhas.filter((l) => l.s.concluida).length,
    andamento: linhas.filter((l) => l.s.iniciada && !l.s.concluida).length,
    pendentes: linhas.filter((l) => !l.s.iniciada).length,
  };
  const aberta = sp.ver ? linhas.find((l) => l.modelo.id === sp.ver) : null;
  const card = "rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">✅ Checklists de hoje</h1>
          <p className="mt-1 text-zinc-500">
            {dia === hoje ? "Hoje" : core.dataCurta(dia)} · o que cada setor já fez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/checklists?dia=${core.addDiasIso(dia, -1)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">← dia anterior</Link>
          {dia !== hoje && <Link href="/checklists" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">hoje</Link>}
          <Link href="/checklists/revisao" className="rounded-lg border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300">🔎 Revisar e apontar</Link>
          <Link href="/checklists/historico" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Histórico</Link>
          <Link href="/checklists/modelos" className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600">Modelos</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-zinc-500">Listas do dia</p><p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{totais.listas}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Concluídas</p><p className="text-2xl font-bold text-emerald-600">{totais.concluidas}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Em andamento</p><p className="text-2xl font-bold text-amber-600">{totais.andamento}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Não iniciadas</p><p className="text-2xl font-bold text-zinc-400">{totais.pendentes}</p></div>
      </div>

      {linhas.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma lista vale neste dia. Cadastre em <Link href="/checklists/modelos" className="text-orange-600 underline">Modelos</Link>.
        </p>
      )}

      {setores.map((s) => {
        const doSetor = linhas.filter((l) => l.modelo.setor_id === s.id);
        if (doSetor.length === 0) return null;
        return (
          <div key={s.id} className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: s.cor ?? undefined }}>{s.nome}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {core.MOMENTOS.map((mom) => {
                const doMomento = doSetor.filter((l) => l.modelo.momento === mom);
                if (doMomento.length === 0) return null;
                return doMomento.map((l) => (
                  <Link
                    key={l.modelo.id}
                    href={`/checklists?dia=${dia}&ver=${l.modelo.id}`}
                    className={`rounded-2xl border p-3 ${l.s.concluida ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : l.s.iniciada ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "border-dashed border-zinc-300 dark:border-zinc-700"}`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">{core.ROTULO_MOMENTO[mom]}</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{l.modelo.nome}</p>
                    <p className="mt-1 text-sm">
                      <b className={l.s.concluida ? "text-emerald-600" : l.s.iniciada ? "text-amber-600" : "text-zinc-400"}>{l.s.feitos}/{l.s.total}</b>
                      <span className="ml-2 text-xs text-zinc-500">
                        {l.s.concluida && l.exec?.concluido_em ? `✓ ${l.exec.concluido_nome ?? ""} ${hora(l.exec.concluido_em)}` : l.s.iniciada && l.exec ? `${l.exec.iniciado_nome ?? ""} desde ${hora(l.exec.iniciado_em)}` : "não iniciada"}
                      </span>
                    </p>
                  </Link>
                ));
              })}
            </div>
          </div>
        );
      })}

      {aberta && (
        <div className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{aberta.modelo.nome}</h2>
              <p className="text-sm text-zinc-500">
                {core.ROTULO_MOMENTO[aberta.modelo.momento]} ·{" "}
                {aberta.exec
                  ? `${aberta.exec.iniciado_nome ?? "?"} começou ${hora(aberta.exec.iniciado_em)}${aberta.exec.concluido_em ? ` · concluída ${hora(aberta.exec.concluido_em)} por ${aberta.exec.concluido_nome ?? "?"}` : ""}`
                  : "não iniciada"}
              </p>
            </div>
            <Link href={`/checklists?dia=${dia}`} className="text-sm text-zinc-400 hover:text-zinc-700">fechar</Link>
          </div>
          <ChecklistItensVista itens={aberta.itens} respostas={aberta.resp} />
        </div>
      )}
    </div>
  );
}
