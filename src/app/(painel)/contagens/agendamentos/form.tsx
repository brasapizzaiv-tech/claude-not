"use client";

import { useState, useTransition } from "react";
import { confirmar } from "@/components/dialogo";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import {
  salvarAgendamento,
  alternarAgendamento,
  excluirAgendamento,
} from "./actions";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const inputCls =
  "min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";

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
          className="mb-6 rounded-cartao bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
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
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum agendamento ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="space-y-3">
          {ags.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-painel-cartao p-4"
            >
              <div>
                <p className="font-medium text-texto">
                  {a.nome}
                  {!a.ativo && (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-mini text-texto-suave dark:bg-zinc-800">
                      pausado
                    </span>
                  )}
                </p>
                <p className="text-sm text-texto-suave">{quando(a)}</p>
                <p className="text-xs text-texto-fraco">
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
                  className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
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
                  className={`rounded-controle px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
                    a.ativo
                      ? "border border-borda-forte text-texto-suave hover:bg-superficie-suave   "
                      : "bg-texto text-fundo hover:opacity-90"
                  }`}
                >
                  {a.ativo ? "Pausar" : "Ativar"}
                </button>
                <button
                  disabled={p}
                  onClick={async () => {
                    if (!await confirmar(`Excluir o agendamento "${a.nome}"?`)) return;
                    const fd = new FormData();
                    fd.set("id", a.id);
                    acao(() => excluirAgendamento(fd));
                  }}
                  className="text-xs text-texto-fraco hover:text-red-600 disabled:opacity-60"
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
      className="mb-6 space-y-4 rounded-cartao border border-orange-200 bg-orange-50/40 p-5 dark:border-orange-900/50 dark:bg-orange-950/20"
    >
      {editar && <input type="hidden" name="id" value={editar.id} />}
      <p className="text-sm font-semibold text-texto-suave">
        {editar ? "Editar agendamento" : "Novo agendamento"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-texto-suave">Nome</label>
          <input
            name="nome"
            required
            defaultValue={editar?.nome ?? ""}
            placeholder="Ex.: Contagem da salada"
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Frequência</label>
          <select name="frequencia" value={freq} onChange={(e) => setFreq(e.target.value)} className={inputCls}>
            <option value="diario">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
          </select>
        </div>
        {freq !== "diario" && (
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Dia da semana</label>
            <select name="dia_semana" defaultValue={String(editar?.dia_semana ?? 1)} className={inputCls}>
              {DIAS.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Horário</label>
          <input type="time" name="horario" defaultValue={horario} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-texto-suave">Divisão</label>
          <select name="modo" value={modo} onChange={(e) => setModo(e.target.value)} className={inputCls}>
            <option value="repetir_ultima">Repetir última divisão</option>
            <option value="todos">Dividir entre todos (rodízio)</option>
            <option value="personalizado">Personalizado (escolher)</option>
          </select>
        </div>
      </div>

      {modo === "personalizado" && (
        <div className="rounded-cartao border border-borda bg-painel-cartao p-4">
          <p className="mb-3 text-sm text-texto-suave">
            Escolha quem conta cada seção. Deixe em <b>— não contar —</b> as que
            não entram.
          </p>
          <input type="hidden" name="divisao" value={divisaoJson} />
          <div className="grid gap-2 sm:grid-cols-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-texto-suave">
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
        <button className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90">
          {editar ? "Salvar alterações" : "Salvar"}
        </button>
        <button type="button" onClick={onClose} className="rounded-controle px-3 py-2 text-sm text-texto-suave hover:bg-superficie-suave">
          Cancelar
        </button>
      </div>
    </form>
  );
}
