"use client";

import { useState } from "react";
import { salvarAgendamento } from "./actions";

const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function NovoAgendamento() {
  const [aberto, setAberto] = useState(false);
  const [freq, setFreq] = useState("semanal");

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mb-6 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
      >
        + Novo agendamento
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await salvarAgendamento(fd);
        setAberto(false);
      }}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <div className="min-w-40 flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Nome</label>
        <input
          name="nome"
          required
          placeholder="Ex.: Contagem da salada"
          className={`${inputCls} w-full`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Frequência</label>
        <select
          name="frequencia"
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          className={inputCls}
        >
          <option value="diario">Diária</option>
          <option value="semanal">Semanal</option>
          <option value="quinzenal">Quinzenal</option>
        </select>
      </div>
      {freq !== "diario" && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Dia da semana</label>
          <select name="dia_semana" defaultValue="1" className={inputCls}>
            {DIAS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Horário</label>
        <input type="time" name="horario" defaultValue="08:00" className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Divisão</label>
        <select name="modo" defaultValue="repetir_ultima" className={inputCls}>
          <option value="repetir_ultima">Repetir última divisão</option>
          <option value="todos">Dividir entre todos (rodízio)</option>
        </select>
      </div>
      <button className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
        Salvar
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        Cancelar
      </button>
    </form>
  );
}
