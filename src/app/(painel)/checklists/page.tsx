import Link from "next/link";
import { Icone } from "@/components/icone";
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
  const card = "rounded-cartao border border-borda p-4 ";

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto"><Icone nome="checklist" tamanho={20} className="mr-2" /> Checklists de hoje</h1>
          <p className="mt-1 text-texto-suave">
            {dia === hoje ? "Hoje" : core.dataCurta(dia)} · o que cada setor já fez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/checklists?dia=${core.addDiasIso(dia, -1)}`} className="rounded-controle border border-borda-forte px-3 py-2 text-sm">← dia anterior</Link>
          {dia !== hoje && <Link href="/checklists" className="rounded-controle border border-borda-forte px-3 py-2 text-sm">hoje</Link>}
          <Link href="/checklists/revisao" className="rounded-controle border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300"><Icone nome="buscar" tamanho={14} className="mr-1.5" /> Revisar e apontar</Link>
          <Link href="/checklists/historico" className="rounded-controle border border-borda-forte px-3 py-2 text-sm">Histórico</Link>
          <Link href="/checklists/modelos" className="rounded-controle bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600">Modelos</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-texto-suave">Listas do dia</p><p className="text-2xl font-bold text-texto">{totais.listas}</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Concluídas</p><p className="text-2xl font-bold text-emerald-600">{totais.concluidas}</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Em andamento</p><p className="text-2xl font-bold text-amber-600">{totais.andamento}</p></div>
        <div className={card}><p className="text-xs text-texto-suave">Não iniciadas</p><p className="text-2xl font-bold text-texto-fraco">{totais.pendentes}</p></div>
      </div>

      {linhas.length === 0 && (
        <p className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhuma lista vale neste dia. Cadastre em <Link href="/checklists/modelos" className="text-orange-600 underline">Modelos</Link>.
        </p>
      )}

      {setores.map((s) => {
        const doSetor = linhas.filter((l) => l.modelo.setor_id === s.id);
        if (doSetor.length === 0) return null;
        return (
          <div key={s.id} className="mb-5">
            <p className="mb-2 text-xs font-bold" style={{ color: s.cor ?? undefined }}>{s.nome}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {core.MOMENTOS.map((mom) => {
                const doMomento = doSetor.filter((l) => l.modelo.momento === mom);
                if (doMomento.length === 0) return null;
                return doMomento.map((l) => (
                  <Link
                    key={l.modelo.id}
                    href={`/checklists?dia=${dia}&ver=${l.modelo.id}`}
                    className={`rounded-cartao border p-3 ${l.s.concluida ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : l.s.iniciada ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "border-dashed border-borda-forte"}`}
                  >
                    <p className="text-mini text-texto-fraco">{core.ROTULO_MOMENTO[mom]}</p>
                    <p className="font-semibold text-texto">{l.modelo.nome}</p>
                    <p className="mt-1 text-sm">
                      <b className={l.s.concluida ? "text-emerald-600" : l.s.iniciada ? "text-amber-600" : "text-texto-fraco"}>{l.s.feitos}/{l.s.total}</b>
                      <span className="ml-2 text-xs text-texto-suave">
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
        <div className="mt-6 rounded-cartao border border-borda p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-texto">{aberta.modelo.nome}</h2>
              <p className="text-sm text-texto-suave">
                {core.ROTULO_MOMENTO[aberta.modelo.momento]} ·{" "}
                {aberta.exec
                  ? `${aberta.exec.iniciado_nome ?? "?"} começou ${hora(aberta.exec.iniciado_em)}${aberta.exec.concluido_em ? ` · concluída ${hora(aberta.exec.concluido_em)} por ${aberta.exec.concluido_nome ?? "?"}` : ""}`
                  : "não iniciada"}
              </p>
            </div>
            <Link href={`/checklists?dia=${dia}`} className="text-sm text-texto-fraco hover:text-texto-suave">fechar</Link>
          </div>
          <ChecklistItensVista itens={aberta.itens} respostas={aberta.resp} />
        </div>
      )}
    </div>
  );
}
