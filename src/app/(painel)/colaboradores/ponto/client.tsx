"use client";

import { useState, useTransition } from "react";
import { Enviar } from "@/components/enviar";
import { importarAfdRhid, incluirBatida, justificar } from "./actions";

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
      <Enviar className="min-h-10 rounded-controle bg-texto px-3 font-semibold text-fundo">Importar</Enviar>
      {msg && <span className={`w-full text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.t}</span>}
    </form>
  );
}

/** "Ajustar" de um dia do espelho: justificar (atestado/abono) ou incluir batida esquecida. */
export function AjustarDia({ colaboradorId, nome, dia }: { colaboradorId: string; nome: string; dia: string }) {
  const [aberto, setAberto] = useState<"" | "justificar" | "batida">("");
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
          <select name="tipo" className={`${CAMPO} w-full`} defaultValue="atestado">
            <option value="atestado">Atestado (tira o prêmio)</option>
            <option value="abono">Abonar ausência (não tira o prêmio)</option>
          </select>
          <div className="flex gap-1">
            <input type="date" name="inicio" defaultValue={dia} className={`${CAMPO} w-1/2`} aria-label="De" />
            <input type="date" name="fim" defaultValue={dia} className={`${CAMPO} w-1/2`} aria-label="Até" />
          </div>
          <input name="motivo" placeholder="Motivo (opcional)" maxLength={200} className={`${CAMPO} w-full`} />
          <label className="block">Arquivo (foto ou PDF, opcional)<input type="file" name="arquivo" accept="image/*,application/pdf" className="mt-0.5 w-full" /></label>
          <div className="flex gap-2">
            <Enviar className="min-h-8 rounded-controle bg-texto px-3 font-semibold text-fundo">Salvar</Enviar>
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
