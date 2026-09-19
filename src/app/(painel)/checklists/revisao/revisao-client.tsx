"use client";

import { Icone } from "@/components/icone";

// Revisão do dia: vê lista a lista com as fotos, aponta o que precisa ser
// corrigido e publica na TV da cozinha com prazo.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ROTULO_MOMENTO, addDiasIso, dataCurta,
  type Apontamento, type Execucao, type Modelo, type ModeloItem, type Resposta, type Situacao,
} from "@/lib/checklists-core";
import { ChecklistItensVista } from "@/components/checklist-itens-vista";
import {
  criarApontamentoPainel, excluirApontamentoPainel, publicarNaTv,
  resolverApontamentoPainel, tirarApontamentoDaTv,
} from "../actions";

export type ListaRevisao = {
  modelo: Modelo; setor: string; setorId: string; cor: string | null;
  itens: ModeloItem[]; execucao: Execucao | null; respostas: Resposta[]; situacao: Situacao;
};
type SetorMini = { id: string; nome: string; cor: string | null };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inputCls = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const btnSec = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

// Prazos rápidos + data escolhida.
const PRAZOS = [
  { rotulo: "1 dia", dias: 0 },
  { rotulo: "2 dias", dias: 1 },
  { rotulo: "3 dias", dias: 2 },
  { rotulo: "1 semana", dias: 6 },
] as const;

export function RevisaoClient({
  dia, hoje, listas, setores, apontamentos,
}: {
  dia: string; hoje: string; listas: ListaRevisao[]; setores: SetorMini[]; apontamentos: Apontamento[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [apontando, setApontando] = useState<{ lista: ListaRevisao; item: ModeloItem | null } | null>(null);
  const [prazoDias, setPrazoDias] = useState<number>(1);
  const [prazoData, setPrazoData] = useState<string>("");

  const doDia = apontamentos.filter((a) => a.data_ref === dia);
  const naTv = apontamentos.filter((a) => a.na_tv && !a.resolvido_em);
  const naoPublicados = doDia.filter((a) => !a.na_tv && !a.resolvido_em);
  const resumo = useMemo(() => ({
    listas: listas.length,
    concluidas: listas.filter((l) => l.situacao.concluida).length,
    naoIniciadas: listas.filter((l) => !l.situacao.iniciada).length,
    itensPendentes: listas.reduce((s, l) => s + l.situacao.pendentes, 0),
  }), [listas]);

  function agir<T>(fn: () => Promise<T & { ok?: boolean; mensagem?: string }>, sucesso?: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r && r.ok === false) { setMsg(r.mensagem ?? "Não consegui salvar."); return; }
      if (sucesso) setMsg(sucesso);
      router.refresh();
    });
  }
  const prazoEscolhido = () => (prazoData ? prazoData : addDiasIso(hoje, prazoDias));

  const card = "rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800";

  return (
    <div>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50"><Icone nome="buscar" tamanho={20} /> Revisar checklists</h1>
          <p className="mt-1 text-zinc-500">
            {dia === addDiasIso(hoje, -1) ? "Ontem" : dia === hoje ? "Hoje" : ""} {dataCurta(dia)} · veja o que ficou e aponte as correções.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/checklists/revisao?dia=${addDiasIso(dia, -1)}`} className={btnSec}>← dia anterior</a>
          {dia < hoje && <a href={`/checklists/revisao?dia=${addDiasIso(dia, 1)}`} className={btnSec}>dia seguinte →</a>}
        </div>
      </div>

      {msg && <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{msg}</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-zinc-500">Listas do dia</p><p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{resumo.listas}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Concluídas</p><p className="text-2xl font-bold text-emerald-600">{resumo.concluidas}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Não iniciadas</p><p className="text-2xl font-bold text-red-600">{resumo.naoIniciadas}</p></div>
        <div className={card}><p className="text-xs text-zinc-500">Itens pendentes</p><p className="text-2xl font-bold text-amber-600">{resumo.itensPendentes}</p></div>
      </div>

      {/* Listas do dia */}
      <div className="space-y-2">
        {listas.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-400 dark:border-zinc-700">Nenhuma lista valia neste dia.</p>
        )}
        {listas.map((l) => {
          const abertaAgora = aberta === l.modelo.id;
          return (
            <div key={l.modelo.id} className={`rounded-2xl border p-4 ${l.situacao.concluida ? "border-zinc-200 dark:border-zinc-800" : "border-amber-300 dark:border-amber-900"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {l.modelo.nome}
                    <span className="ml-2 text-xs font-normal" style={{ color: l.cor ?? undefined }}>{l.setor}</span>
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{ROTULO_MOMENTO[l.modelo.momento]}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {l.execucao
                      ? <>{l.execucao.iniciado_nome ?? "?"} começou {hora(l.execucao.iniciado_em)}
                          {l.execucao.concluido_em ? ` · concluída ${hora(l.execucao.concluido_em)} por ${l.execucao.concluido_nome ?? "?"}` : " · não concluída"}</>
                      : <span className="font-semibold text-red-600">não iniciada</span>}
                    {" · "}<b className={l.situacao.pendentes > 0 ? "text-amber-600" : "text-emerald-600"}>{l.situacao.feitos}/{l.situacao.total}</b> itens
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setAberta(abertaAgora ? null : l.modelo.id)} className={btnSec}>{abertaAgora ? "fechar" : "ver itens"}</button>
                  <button onClick={() => setApontando({ lista: l, item: null })} className="rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300">
                    Apontar correção
                  </button>
                </div>
              </div>
              {abertaAgora && (
                <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  <ChecklistItensVista
                    itens={l.itens}
                    respostas={l.respostas}
                    acao={(item) => (
                      <button
                        key={item.id}
                        onClick={() => setApontando({ lista: l, item })}
                        className="shrink-0 rounded-lg border border-amber-400 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300"
                      >
                        Apontar
                      </button>
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Apontamento avulso */}
      <div className="mt-4">
        <button onClick={() => setApontando({ lista: listas[0] ?? ({} as ListaRevisao), item: null })} className="text-sm font-medium text-orange-600 hover:underline">
          + apontamento avulso (algo que eu vi, fora da lista)
        </button>
      </div>

      {/* Apontamentos do dia ainda não publicados */}
      {naoPublicados.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{naoPublicados.length} apontamento(s) deste dia ainda fora da TV</p>
          <ul className="mt-2 space-y-1 text-sm">
            {naoPublicados.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-zinc-800">{a.setor_nome ?? "geral"}</span>
                <span className="flex-1 text-zinc-800 dark:text-zinc-100">{a.texto}</span>
                <button onClick={() => agir(() => excluirApontamentoPainel(a.id))} disabled={proc} className="text-xs text-zinc-400 hover:text-red-600">apagar</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-amber-200 pt-3 dark:border-amber-900">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Fica na TV por</label>
              <div className="flex flex-wrap gap-1.5">
                {PRAZOS.map((p) => (
                  <button
                    key={p.rotulo}
                    onClick={() => { setPrazoDias(p.dias); setPrazoData(""); }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${!prazoData && prazoDias === p.dias ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}
                  >
                    {p.rotulo}
                  </button>
                ))}
                <input type="date" value={prazoData} min={hoje} onChange={(e) => setPrazoData(e.target.value)} className={inputCls} title="ou uma data final" />
              </div>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => agir(() => publicarNaTv(naoPublicados.map((a) => a.id), prazoEscolhido()), `Publicado na TV até ${dataCurta(prazoEscolhido())}.`)}
              disabled={proc}
              className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Icone nome="tv" tamanho={15} className="mr-1.5" /> Publicar na TV ({naoPublicados.length}) até {dataCurta(prazoEscolhido())}
            </button>
          </div>
        </div>
      )}

      {/* O que está na TV agora */}
      <div className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100"><span className="inline-flex items-center gap-1.5"><Icone nome="tv" tamanho={14} /> Na TV agora ({naTv.length})</span></p>
          <a href="/checklists/apontamentos" className="text-xs text-zinc-500 underline">histórico de apontamentos</a>
        </div>
        {naTv.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhum apontamento na TV. Ela segue mostrando só o cardápio.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {naTv.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-zinc-800">{a.setor_nome ?? "geral"}</span>
                <span className="flex-1 text-zinc-800 dark:text-zinc-100">
                  {a.texto}
                  {a.mostrar_nome && a.pessoa_nome && <span className="ml-1 text-xs text-zinc-500">({a.pessoa_nome})</span>}
                </span>
                <span className="text-xs text-zinc-400">
                  de {dataCurta(a.data_ref)} · {a.ate ? `até ${dataCurta(a.ate)}` : "sem prazo"}
                  {a.publicado_por ? ` · ${a.publicado_por}` : ""}
                  {a.publicado_em ? ` ${quando(a.publicado_em)}` : ""}
                </span>
                <button onClick={() => agir(() => resolverApontamentoPainel(a.id), "Marcado como resolvido — saiu da TV.")} disabled={proc} className="rounded-lg border border-emerald-500 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  ✓ Resolvido
                </button>
                <button onClick={() => agir(() => tirarApontamentoDaTv(a.id), "Tirado da TV.")} disabled={proc} className="text-xs text-zinc-400 hover:text-red-600">tirar da TV</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {apontando && (
        <ApontarModal
          lista={apontando.lista}
          item={apontando.item}
          dia={dia}
          hoje={hoje}
          setores={setores}
          onClose={() => setApontando(null)}
          onSalvar={(input) => { agir(() => criarApontamentoPainel(input), "Apontamento criado."); setApontando(null); }}
          proc={proc}
        />
      )}
    </div>
  );
}

function ApontarModal({
  lista, item, dia, hoje, setores, onClose, onSalvar, proc,
}: {
  lista: ListaRevisao; item: ModeloItem | null; dia: string; hoje: string; setores: SetorMini[];
  onClose: () => void; proc: boolean;
  onSalvar: (input: {
    data_ref: string; texto: string; setor_id: string | null;
    execucao_id: string | null; item_id: string | null; item_texto: string | null;
    pessoa_nome: string | null; na_tv: boolean; ate: string | null; mostrar_nome: boolean;
  }) => void;
}) {
  const [texto, setTexto] = useState(item ? `${item.texto}: ` : "");
  const [setorId, setSetorId] = useState<string>(lista?.setorId ?? setores[0]?.id ?? "");
  const [naTv, setNaTv] = useState(true);
  const [prazo, setPrazo] = useState<number>(1);
  const [prazoData, setPrazoData] = useState("");
  const [mostrarNome, setMostrarNome] = useState(false);
  const pessoa = lista?.execucao?.concluido_nome ?? lista?.execucao?.iniciado_nome ?? null;
  const ate = prazoData || addDiasIso(hoje, prazo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-950">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Apontar correção</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          {item ? <>Item: <b className="text-zinc-700 dark:text-zinc-200">{item.texto}</b> · {lista.modelo.nome}</> : "Apontamento do dia (não ligado a um item)"}
        </p>
        <label className="mt-4 mb-1 block text-xs text-zinc-500">O que precisa ser corrigido</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Ex.: a bancada ficou com gordura atrás do fogão"
          className={`${inputCls} w-full`}
          autoFocus
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Setor</label>
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} className={`${inputCls} w-full`}>
              <option value="">geral (sem setor)</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Prazo na TV</label>
            <div className="flex flex-wrap gap-1.5">
              {PRAZOS.map((p) => (
                <button
                  key={p.rotulo}
                  type="button"
                  onClick={() => { setPrazo(p.dias); setPrazoData(""); }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${!prazoData && prazo === p.dias ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <input type="date" value={prazoData} min={hoje} onChange={(e) => setPrazoData(e.target.value)} className={`${inputCls} mt-1.5 w-full`} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" checked={naTv} onChange={(e) => setNaTv(e.target.checked)} />
          Publicar na TV da cozinha {naTv && <span className="text-xs text-zinc-500">(até {dataCurta(ate)})</span>}
        </label>
        {pessoa && (
          <label className="mt-1.5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={mostrarNome} onChange={(e) => setMostrarNome(e.target.checked)} />
            Mostrar o nome na TV <span className="text-xs text-zinc-500">({pessoa})</span>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Cancelar</button>
          <button
            onClick={() => onSalvar({
              data_ref: dia, texto, setor_id: setorId || null,
              execucao_id: lista?.execucao?.id ?? null, item_id: item?.id ?? null, item_texto: item?.texto ?? null,
              pessoa_nome: pessoa, na_tv: naTv, ate: naTv ? ate : null, mostrar_nome: mostrarNome,
            })}
            disabled={proc || texto.trim().length < 3}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {naTv ? "Apontar e publicar" : "Apontar"}
          </button>
        </div>
      </div>
    </div>
  );
}
