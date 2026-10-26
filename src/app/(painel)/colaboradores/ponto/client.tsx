"use client";

import { useState, useTransition } from "react";
import { BotaoAcao, Enviar } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { desconsiderarBatida, deslocarBatida, fecharMes, importarAfdRhid, incluirBatida, justificar, moverBatidaDia, reabrirMes } from "./actions";

const CAMPO = "min-h-9 rounded-controle border border-borda-forte bg-transparent px-2 text-sm";

export function Imprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-10 rounded-controle border border-borda-forte px-3 text-sm">
      Imprimir
    </button>
  );
}

export function ImportarAfd() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <form
      action={async (fd) => {
        setMsg(null);
        const r = await importarAfdRhid(fd);
        setMsg(r.ok ? { ok: true, t: `${r.novas} batida(s) nova(s) de ${r.recebidas} no arquivo${r.semColaborador ? ` · ${r.semColaborador} sem colaborador (CPF não cadastrado)` : ""}.` } : { ok: false, t: r.erro });
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <label className="cursor-pointer rounded-controle border border-borda-forte px-3 py-2">
        Arquivo AFD do RHiD
        <input type="file" name="arquivo" accept=".txt,text/plain" className="ml-2 max-w-48 text-xs" />
      </label>
      <Enviar className="btn-principal min-h-10">Importar</Enviar>
      {msg && <span className={`w-full text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.t}</span>}
    </form>
  );
}

/** "Ajustar" de um dia do espelho: justificar (atestado/abono) ou incluir batida esquecida. */
export type TipoJustOpcao = { id: string; nome: string; efeito: "dia" | "horas" | "ajuste"; tira_premio: boolean };

export function AjustarDia({ colaboradorId, nome, dia, tipos = [] }: { colaboradorId: string; nome: string; dia: string; tipos?: TipoJustOpcao[] }) {
  const [aberto, setAberto] = useState<"" | "justificar" | "batida">("");
  const [tipoId, setTipoId] = useState("");
  const tipoSel = tipos.find((t) => t.id === tipoId);
  const [erro, setErro] = useState<string | null>(null);
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, start] = useTransition();
  if (!aberto) {
    return (
      <span className="flex gap-2 whitespace-nowrap text-xs">
        <button type="button" onClick={() => setAberto("justificar")} className="text-orange-600 hover:underline">justificar</button>
        <button type="button" onClick={() => setAberto("batida")} className="text-orange-600 hover:underline">+ batida</button>
      </span>
    );
  }
  return (
    <div className="w-64 rounded-controle border border-borda bg-painel-cartao p-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{nome} · {dia.slice(8, 10)}/{dia.slice(5, 7)}</p>
      {aberto === "justificar" ? (
        <form
          action={async (fd) => { setErro(null); const r = await justificar(fd); if (r.ok) setAberto(""); else setErro(r.erro); }}
          className="space-y-1.5"
        >
          <input type="hidden" name="colaborador_id" value={colaboradorId} />
          <select name="tipo_id" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={`${CAMPO} w-full`} required>
            <option value="">Tipo de justificativa…</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.tira_premio ? " (tira o prêmio)" : ""}</option>)}
          </select>
          {tipoSel && tipoSel.efeito !== "dia" && (
            <input name="minutos" placeholder={tipoSel.efeito === "horas" ? "Quanto abona (hh:mm, ex.: 01:30)" : "Quanto soma (hh:mm) ou tira (-00:30)"} className={`${CAMPO} w-full`} required />
          )}
          <div className="flex gap-1">
            <input type="date" name="inicio" defaultValue={dia} className={`${CAMPO} w-1/2`} aria-label="De" />
            <input type="date" name="fim" defaultValue={dia} className={`${CAMPO} w-1/2`} aria-label="Até" />
          </div>
          <input name="motivo" placeholder="Motivo (opcional)" maxLength={200} className={`${CAMPO} w-full`} />
          <label className="block">Arquivo (foto ou PDF, opcional)<input type="file" name="arquivo" accept="image/*,application/pdf" className="mt-0.5 w-full" /></label>
          <div className="flex gap-2">
            <Enviar className="btn-principal min-h-8">Salvar</Enviar>
            <button type="button" onClick={() => setAberto("")} className="text-texto-suave">cancelar</button>
          </div>
        </form>
      ) : (
        <div className="space-y-1.5">
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={`${CAMPO} w-full`} aria-label="Hora da batida" />
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Por quê (ex.: esqueceu de bater)" maxLength={200} className={`${CAMPO} w-full`} />
          <p className="text-texto-fraco">Saída depois da meia-noite: põe a hora (ex.: 00:40), conta neste dia.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={salvando || !hora}
              onClick={() => start(async () => { setErro(null); const r = await incluirBatida(colaboradorId, dia, hora, obs); if (r.ok) { setAberto(""); setHora(""); setObs(""); } else setErro(r.erro); })}
              className="min-h-8 rounded-controle bg-texto px-3 font-semibold text-fundo disabled:opacity-40"
            >
              {salvando ? "Salvando..." : "Incluir"}
            </button>
            <button type="button" onClick={() => setAberto("")} className="text-texto-suave">cancelar</button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1 text-red-600">{erro}</p>}
    </div>
  );
}

/** Hora da batida no espelho; clicando abre "Alterações de ponto" (como no RHiD). */
export function BatidaMenu({ id, hora, manual, ignorada, destaque }: { id?: string; hora: string; manual?: boolean; ignorada?: boolean; destaque?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, start] = useTransition();
  if (!id) return <span>{hora}</span>;
  const fazer = (f: () => Promise<{ ok: boolean; erro?: string } | void>) => start(async () => {
    setErro(null);
    const r = await f();
    if (r && !r.ok) setErro(r.erro ?? "Não deu certo."); else setAberto(false);
  });
  const item = "block w-full px-3 py-1.5 text-left hover:bg-superficie-suave disabled:opacity-40";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={manual ? "Batida incluída à mão" : "Alterações de ponto"}
        className={`rounded px-1 hover:bg-superficie-suave ${ignorada ? "text-texto-fraco line-through" : ""} ${destaque ? "font-semibold text-amber-700 dark:text-amber-400" : ""} ${manual ? "italic" : ""}`}
      >
        {hora}{manual ? "*" : ""}
      </button>
      {aberto && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-56 rounded-controle border border-borda bg-painel-cartao py-1 text-xs shadow-lg print:hidden">
          <span className="block px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-texto-fraco">Alterações de ponto</span>
          {ignorada ? (
            <button type="button" disabled={salvando} onClick={() => fazer(() => desconsiderarBatida(id, false))} className={item}>Considerar de novo</button>
          ) : (
            <>
              <button type="button" disabled={salvando} onClick={() => fazer(() => desconsiderarBatida(id, true))} className={item}>Desconsiderar marcação</button>
              <button type="button" disabled={salvando} onClick={() => fazer(() => deslocarBatida(id, 1))} className={item}>Deslocar para a direita</button>
              <button type="button" disabled={salvando} onClick={() => fazer(() => deslocarBatida(id, -1))} className={item}>Deslocar para a esquerda</button>
              <button type="button" disabled={salvando} onClick={() => fazer(() => moverBatidaDia(id, -1))} className={item}>Deslocar para o dia anterior</button>
              <button type="button" disabled={salvando} onClick={() => fazer(() => moverBatidaDia(id, 1))} className={item}>Deslocar para o próximo dia</button>
            </>
          )}
          <button type="button" onClick={() => setAberto(false)} className={`${item} text-texto-fraco`}>fechar</button>
          {erro && <span className="block px-3 pb-1 text-red-600">{erro}</span>}
        </span>
      )}
    </span>
  );
}

/** Fechar (ou reabrir) o mês de uma ou mais pessoas (migration 0258). */
export function FechamentoMes({ de, ate, pessoas, reabrir, rotulo, pequeno }: { de: string; ate: string; pessoas: string[]; reabrir?: boolean; rotulo: string; pequeno?: boolean }) {
  const router = useRouter();
  if (!pessoas.length) return null;
  async function fazer() {
    const pergunta = reabrir ? "Reabrir o mês dessa pessoa?" : pessoas.length > 1 ? `Fechar o mês de ${pessoas.length} pessoas?` : "Fechar o mês dessa pessoa?";
    const detalhe = reabrir ? "Volta a dar pra mexer nas batidas e justificativas. Depois de corrigir, feche de novo; a pessoa assina de novo no app." : "Confira o espelho antes. Fechado, ninguém mexe nas batidas nem nas justificativas desses dias, e o mês vai pro app pra pessoa assinar.";
    if (!(await confirmar(pergunta, { detalhe, okTexto: reabrir ? "Reabrir" : "Fechar o mês" }))) return;
    const r = reabrir ? await reabrirMes(de, pessoas[0]) : await fecharMes(de, ate, pessoas);
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  return (
    <BotaoAcao aoClicar={fazer} className={pequeno ? "min-h-11 rounded-full px-3 text-xs font-semibold text-texto-marca hover:underline" : "btn-principal !min-h-11 text-sm"}>
      {rotulo}
    </BotaoAcao>
  );
}
