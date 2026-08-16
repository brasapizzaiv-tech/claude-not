"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import {
  salvarAgendamento,
  alternarAgendamento,
  excluirAgendamento,
} from "./actions";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Item = { id: string; nome: string };
export type Ag = {
  id: string;
  nome: string;
  frequencia: string;
  dia_semana: number | null;
  hora: number;
  minuto: number;
  modo: string;
  ativo: boolean;
  ultima_exec: string | null;
  divisao: { categoria_id: string; colaborador_id: string }[] | null;
};

function quando(a: Ag) {
  const hora = `${String(a.hora).padStart(2, "0")}:${String(a.minuto).padStart(2, "0")}`;
  if (a.frequencia === "diario") return `Todo dia às ${hora}`;
  const dia = a.dia_semana != null ? DIAS[a.dia_semana] : "";
  if (a.frequencia === "semanal") return `Toda ${dia} às ${hora}`;
  return `A cada 15 dias · ${dia} às ${hora}`;
}

export function AgendamentosClient({
  ags,
  categorias,
  colaboradores,
}: {
  ags: Ag[];
  categorias: Item[];
  colaboradores: Item[];
}) {
  // null = fechado · "novo" · Ag = editando
  const [form, setForm] = useState<null | "novo" | Ag>(null);
  const router = useRouter();
  const [p, start] = useTransition();

  const acao = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div>
      {form === null ? (
        <button
          onClick={() => setForm("novo")}
          className="mb-6 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          + Novo agendamento
        </button>
      ) : (
        <AgendamentoForm
          editar={form === "novo" ? null : form}
          categorias={categorias}
          colaboradores={colaboradores}
          onClose={() => setForm(null)}
        />
      )}

      {ags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhum agendamento ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="space-y-3">
          {ags.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {a.nome}
                  {!a.ativo && (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                      pausado
                    </span>
                  )}
                </p>
                <p className="text-sm text-zinc-500">{quando(a)}</p>
                <p className="text-xs text-zinc-400">
                  {a.modo === "personalizado"
                    ? `Personalizado · ${(a.divisao ?? []).length} seção(ões)`
                    : a.modo === "todos"
                      ? "Divide entre todos (rodízio)"
                      : "Repete a última divisão"}
                  {a.ultima_exec ? ` · última: ${dataBR(a.ultima_exec)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(a)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Editar
                </button>
                <button
                  disabled={p}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", a.id);
                    fd.set("ativo", (!a.ativo).toString());
                    acao(() => alternarAgendamento(fd));
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
                    a.ativo
                      ? "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {a.ativo ? "Pausar" : "Ativar"}
                </button>
                <button
                  disabled={p}
                  onClick={() => {
                    if (!confirm(`Excluir o agendamento "${a.nome}"?`)) return;
                    const fd = new FormData();
                    fd.set("id", a.id);
                    acao(() => excluirAgendamento(fd));
                  }}
                  className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-60"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendamentoForm({
  editar,
  categorias,
  colaboradores,
  onClose,
}: {
  editar: Ag | null;
  categorias: Item[];
  colaboradores: Item[];
  onClose: () => void;
}) {
  const [freq, setFreq] = useState(editar?.frequencia ?? "semanal");
  const [modo, setModo] = useState(editar?.modo ?? "repetir_ultima");
  const [divisao, setDivisao] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const d of editar?.divisao ?? []) m[d.categoria_id] = d.colaborador_id;
    return m;
  });

  const setCat = (catId: string, colId: string) =>
    setDivisao((d) => ({ ...d, [catId]: colId }));
  const divisaoJson = JSON.stringify(
    Object.entries(divisao)
      .filter(([, colId]) => colId)
      .map(([categoria_id, colaborador_id]) => ({ categoria_id, colaborador_id })),
  );
  const horario = editar
    ? `${String(editar.hora).padStart(2, "0")}:${String(editar.minuto).padStart(2, "0")}`
    : "08:00";

  return (
    <form
      action={async (fd) => {
        await salvarAgendamento(fd);
        onClose();
      }}
      className="mb-6 space-y-4 rounded-2xl border border-orange-200 bg-orange-50/40 p-5 dark:border-orange-900/50 dark:bg-orange-950/20"
    >
      {editar && <input type="hidden" name="id" value={editar.id} />}
      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {editar ? "Editar agendamento" : "Novo agendamento"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Nome</label>
          <input
            name="nome"
            required
            defaultValue={editar?.nome ?? ""}
            placeholder="Ex.: Contagem da salada"
            className={`${inputCls} w-full`}
          />
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
            <select name="dia_semana" defaultValue={String(editar?.dia_semana ?? 1)} className={inputCls}>
              {DIAS.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Horário</label>
          <input type="time" name="horario" defaultValue={horario} className={inputCls} />
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
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-3 text-sm text-zinc-500">
            Escolha quem conta cada seção. Deixe em <b>— não contar —</b> as que
            não entram.
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
        </div>
      )}

      <div className="flex gap-2">
        <button className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
          {editar ? "Salvar alterações" : "Salvar"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Cancelar
        </button>
      </div>
    </form>
  );
}
