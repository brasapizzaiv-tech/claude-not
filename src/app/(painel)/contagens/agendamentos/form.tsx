"use client";

import { useState } from "react";
import { salvarAgendamento } from "./actions";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Item = { id: string; nome: string };

export function NovoAgendamento({
  categorias,
  colaboradores,
}: {
  categorias: Item[];
  colaboradores: Item[];
}) {
  const [aberto, setAberto] = useState(false);
  const [freq, setFreq] = useState("semanal");
  const [modo, setModo] = useState("repetir_ultima");
  // divisão: categoria_id -> colaborador_id ("" = não conta)
  const [divisao, setDivisao] = useState<Record<string, string>>({});

  const setCat = (catId: string, colId: string) =>
    setDivisao((d) => ({ ...d, [catId]: colId }));

  const divisaoJson = JSON.stringify(
    Object.entries(divisao)
      .filter(([, colId]) => colId)
      .map(([categoria_id, colaborador_id]) => ({ categoria_id, colaborador_id })),
  );

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
        setDivisao({});
        setModo("repetir_ultima");
      }}
      className="mb-6 space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Nome</label>
          <input name="nome" required placeholder="Ex.: Contagem da salada" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Frequência</label>
          <select name="frequencia" value={freq} onChange={(e) => setFreq(e.target.value)} className={inputCls}>
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
                <option key={i} value={i}>{d}</option>
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
          <select name="modo" value={modo} onChange={(e) => setModo(e.target.value)} className={inputCls}>
            <option value="repetir_ultima">Repetir última divisão</option>
            <option value="todos">Dividir entre todos (rodízio)</option>
            <option value="personalizado">Personalizado (escolher)</option>
          </select>
        </div>
      </div>

      {modo === "personalizado" && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="mb-3 text-sm text-zinc-500">
            Escolha quem conta cada seção. Deixe em <b>— não contar —</b> as
            seções que não entram nesta contagem.
          </p>
          <input type="hidden" name="divisao" value={divisaoJson} />
          <div className="grid gap-2 sm:grid-cols-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                  {c.nome}
                </span>
                <select
                  value={divisao[c.id] ?? ""}
                  onChange={(e) => setCat(c.id, e.target.value)}
                  className={`${inputCls} w-40`}
                >
                  <option value="">— não contar —</option>
                  {colaboradores.map((col) => (
                    <option key={col.id} value={col.id}>{col.nome}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {colaboradores.length === 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Cadastre colaboradores primeiro (menu Colaboradores).
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
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
      </div>
    </form>
  );
}
