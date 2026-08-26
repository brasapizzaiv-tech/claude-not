"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import {
  apagarReserva,
  bloquearData,
  criarReserva,
  definirStatus,
  liberarBloqueio,
  marcarChegou,
  salvarLimites,
  salvarMensagens,
  salvarReserva,
  type DadosReserva,
} from "./actions";

export type Reserva = {
  id: string;
  nome: string;
  telefone: string;
  data: string;
  turno: string;
  chegada: string | null;
  pessoas: number;
  adultos: number | null;
  criancas: number;
  lugar: string | null;
  mesa: string | null;
  ocasiao: string | null;
  nascimento: string | null;
  observacao: string | null;
  status: string;
  origem: string;
  chegou_em: string | null;
};
export type Bloqueio = {
  id: string;
  data: string;
  turno: string;
  motivo: string | null;
};
export type Limite = {
  turno: string;
  max_reservas: number;
  max_pessoas: number;
  grupo_grande: number;
};

const TURNOS = ["Almoço", "Rodízio"];
const CHEGADAS: Record<string, string[]> = {
  "Almoço": ["11h15", "11h30", "11h45"],
  "Rodízio": ["19h00", "19h15", "19h30", "19h45"],
};
const LUGARES = ["Tanto faz", "Salão", "Deck"];
const OCASIOES = ["Só uma reserva", "Aniversário", "Outra data especial"];
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const rotulo = "mb-1 block text-xs text-zinc-500";
const cartao = "rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800";
const btn =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}
// Telefone no formato do WhatsApp: só dígitos, com o 55 na frente.
function foneWhats(t: string) {
  const n = (t || "").replace(/\D/g, "");
  return n.startsWith("55") ? n : "55" + n;
}
function montarMsg(modelo: string, r: Reserva) {
  return (modelo || "")
    .replaceAll("{nome}", r.nome)
    .replaceAll("{data}", dataBR(r.data))
    .replaceAll("{turno}", r.turno)
    .replaceAll("{pessoas}", String(r.pessoas));
}

export function AgendaReservas({
  dia,
  hoje,
  reservas,
  proximas,
  bloqueios,
  limites,
  mensagens,
}: {
  dia: string;
  hoje: string;
  reservas: Reserva[];
  proximas: { data: string; turno: string; pessoas: number }[];
  bloqueios: Bloqueio[];
  limites: Limite[];
  mensagens: Record<string, string>;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);

  const lim = useMemo(() => {
    const m: Record<string, Limite> = {};
    for (const t of TURNOS)
      m[t] = limites.find((l) => l.turno === t) ?? {
        turno: t,
        max_reservas: 30,
        max_pessoas: 120,
        grupo_grande: 12,
      };
    return m;
  }, [limites]);

  const ativas = reservas.filter((r) => r.status !== "cancelada");
  const pessoasDia = ativas.reduce((s, r) => s + r.pessoas, 0);
  const aguardando = ativas.filter((r) => r.status === "aguardando").length;

  function irPara(d: string) {
    router.push(`/reservas?dia=${d}`);
  }
  function acao(fn: () => Promise<unknown>) {
    start(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Reservas</h1>
      <p className="mt-1 text-zinc-500">
        As reservas do site caem aqui. Confirme, remarque, feche datas e lance a
        reserva de quem ligar.
      </p>

      {/* Navegação do dia */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => irPara(addDias(dia, -1))} className={btn}>
          ← dia anterior
        </button>
        <input
          type="date"
          value={dia}
          onChange={(e) => e.target.value && irPara(e.target.value)}
          className={campo}
        />
        <button onClick={() => irPara(addDias(dia, 1))} className={btn}>
          próximo dia →
        </button>
        {dia !== hoje && (
          <button onClick={() => irPara(hoje)} className={btn}>
            hoje
          </button>
        )}
        <span className="ml-auto text-sm text-zinc-500">
          {diaSemana(dia)}, {dataBR(dia)} ·{" "}
          <b className="text-zinc-800 dark:text-zinc-200">{ativas.length}</b> reservas ·{" "}
          <b className="text-zinc-800 dark:text-zinc-200">{pessoasDia}</b> pessoas
          {aguardando > 0 && (
            <span className="ml-1 font-semibold text-amber-600">
              · {aguardando} aguardando
            </span>
          )}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-5">
          {/* Lotação do dia */}
          <div className={cartao}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Como está o dia
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {TURNOS.map((t) => {
                const doTurno = ativas.filter((r) => r.turno === t);
                const pes = doTurno.reduce((s, r) => s + r.pessoas, 0);
                const pct = Math.min(
                  100,
                  Math.round((pes * 100) / (lim[t].max_pessoas || 1)),
                );
                const cor =
                  pct >= 95 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
                return (
                  <div key={t}>
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{t}</span>
                      <span>
                        {pes} de {lim[t].max_pessoas} lugares · {doTurno.length}/
                        {lim[t].max_reservas} reservas
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {pct >= 100
                        ? "Lotado — o site não aceita mais reservas neste turno."
                        : `Restam ${lim[t].max_pessoas - pes} lugares.`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reservas do dia */}
          {reservas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
              Nenhuma reserva para este dia.
            </div>
          ) : (
            <div className="space-y-3">
              {reservas.map((r) =>
                editando === r.id ? (
                  <FormReserva
                    key={r.id}
                    inicial={r}
                    proc={proc}
                    aoSalvar={(d) =>
                      acao(async () => {
                        await salvarReserva(r.id, d);
                        setEditando(null);
                      })
                    }
                    aoCancelar={() => setEditando(null)}
                  />
                ) : (
                  <CartaoReserva
                    key={r.id}
                    r={r}
                    proc={proc}
                    mensagens={mensagens}
                    aoEditar={() => setEditando(r.id)}
                    acao={acao}
                  />
                ),
              )}
            </div>
          )}
        </div>

        {/* Coluna da direita */}
        <div className="space-y-5">
          <NovaReserva dia={dia} proc={proc} acao={acao} />
          <Bloqueios
            dia={dia}
            bloqueios={bloqueios}
            proc={proc}
            acao={acao}
            irPara={irPara}
          />
          <ProximosDias hoje={hoje} proximas={proximas} lim={lim} irPara={irPara} />
          <Ajustes lim={lim} mensagens={mensagens} proc={proc} acao={acao} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- cartão de uma reserva ---------------- */
function CartaoReserva({
  r,
  proc,
  mensagens,
  aoEditar,
  acao,
}: {
  r: Reserva;
  proc: boolean;
  mensagens: Record<string, string>;
  aoEditar: () => void;
  acao: (fn: () => Promise<unknown>) => void;
}) {
  const borda =
    r.status === "confirmada"
      ? "border-l-4 border-l-green-500"
      : r.status === "cancelada"
        ? "border-l-4 border-l-red-400 opacity-60"
        : r.status === "aguardando"
          ? "border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
          : "border-l-4 border-l-orange-500";
  const tag =
    "rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700";
  const zap = (chave: string) =>
    `https://wa.me/${foneWhats(r.telefone)}?text=${encodeURIComponent(
      montarMsg(mensagens["msg_" + chave] ?? "", r),
    )}`;

  return (
    <div className={`${cartao} ${borda}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {r.nome}
        </span>
        <span className={tag}>
          {r.turno}
          {r.chegada ? ` · ${r.chegada}` : ""}
        </span>
        <span className={tag}>
          {r.pessoas} {r.pessoas === 1 ? "pessoa" : "pessoas"}
        </span>
        {r.criancas > 0 && (
          <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] text-amber-600">
            {r.criancas} cadeirão
          </span>
        )}
        {r.ocasiao && r.ocasiao !== "Só uma reserva" && (
          <span className={tag}>{r.ocasiao}</span>
        )}
        {r.status === "aguardando" && (
          <span className="rounded-full border border-amber-400 px-2 py-0.5 text-[11px] font-medium text-amber-600">
            aguardando mesa
          </span>
        )}
        {r.status === "confirmada" && (
          <span className="rounded-full border border-green-400 px-2 py-0.5 text-[11px] font-medium text-green-600">
            confirmada
          </span>
        )}
        {r.status === "cancelada" && (
          <span className="rounded-full border border-red-300 px-2 py-0.5 text-[11px] text-red-500">
            cancelada
          </span>
        )}
        {r.chegou_em && (
          <span className="rounded-full border border-green-400 px-2 py-0.5 text-[11px] font-medium text-green-600">
            chegou
          </span>
        )}
        {r.mesa && (
          <span className="rounded-full border border-orange-400 px-2 py-0.5 text-[11px] font-medium text-orange-600">
            mesa {r.mesa}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-zinc-500">
        {r.adultos ?? r.pessoas} adultos
        {r.criancas ? ` e ${r.criancas} crianças` : ""} · {r.telefone} ·{" "}
        {r.lugar ?? "Tanto faz"} ·{" "}
        {r.origem === "site" ? "veio do site" : "contato direto"}
        {r.nascimento ? ` · nasc. ${dataBR(r.nascimento)}` : ""}
      </p>
      {r.observacao && (
        <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{r.observacao}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.status !== "confirmada" && (
          <button
            disabled={proc}
            onClick={() => acao(() => definirStatus(r.id, "confirmada"))}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Confirmar
          </button>
        )}
        <button
          disabled={proc}
          onClick={() => acao(() => marcarChegou(r.id, !r.chegou_em))}
          className={btn}
        >
          {r.chegou_em ? "Desmarcar chegada" : "Chegou"}
        </button>
        <button onClick={aoEditar} className={btn}>
          Editar
        </button>
        <a href={zap("confirmacao")} target="_blank" rel="noopener" className={btn}>
          💬 Confirmar
        </a>
        {r.status === "aguardando" && (
          <a href={zap("aguardando")} target="_blank" rel="noopener" className={btn}>
            💬 Aguardar
          </a>
        )}
        <a href={zap("sem_mesa")} target="_blank" rel="noopener" className={btn}>
          💬 Sem mesa
        </a>
        {r.status !== "cancelada" && (
          <button
            disabled={proc}
            onClick={() => acao(() => definirStatus(r.id, "cancelada"))}
            className={btn}
          >
            Cancelar
          </button>
        )}
        <button
          disabled={proc}
          onClick={() => {
            if (confirm(`Apagar de vez a reserva de ${r.nome}?`))
              acao(() => apagarReserva(r.id));
          }}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-red-600"
        >
          Apagar
        </button>
      </div>
    </div>
  );
}

/* ---------------- formulário de edição ---------------- */
function FormReserva({
  inicial,
  proc,
  aoSalvar,
  aoCancelar,
}: {
  inicial: Reserva;
  proc: boolean;
  aoSalvar: (d: DadosReserva) => void;
  aoCancelar: () => void;
}) {
  const [d, setD] = useState({
    nome: inicial.nome,
    telefone: inicial.telefone,
    data: inicial.data,
    turno: inicial.turno,
    chegada: inicial.chegada ?? "",
    adultos: String(inicial.adultos ?? inicial.pessoas),
    criancas: String(inicial.criancas ?? 0),
    lugar: inicial.lugar ?? "Tanto faz",
    mesa: inicial.mesa ?? "",
    ocasiao: inicial.ocasiao ?? "Só uma reserva",
    observacao: inicial.observacao ?? "",
    status: inicial.status,
  });
  const set = (k: string, v: string) => setD((s) => ({ ...s, [k]: v }));

  return (
    <div className={`${cartao} border-orange-300 dark:border-orange-800`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={rotulo}>Nome</label>
          <input value={d.nome} onChange={(e) => set("nome", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Telefone</label>
          <input value={d.telefone} onChange={(e) => set("telefone", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Dia</label>
          <input type="date" value={d.data} onChange={(e) => set("data", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Turno</label>
          <select
            value={d.turno}
            onChange={(e) => {
              set("turno", e.target.value);
              set("chegada", CHEGADAS[e.target.value]?.[0] ?? "");
            }}
            className={`${campo} w-full`}
          >
            {TURNOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Chegada</label>
          <select value={d.chegada} onChange={(e) => set("chegada", e.target.value)} className={`${campo} w-full`}>
            <option value="">—</option>
            {(CHEGADAS[d.turno] ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Adultos</label>
          <input type="number" min="0" value={d.adultos} onChange={(e) => set("adultos", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Crianças</label>
          <input type="number" min="0" value={d.criancas} onChange={(e) => set("criancas", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Onde</label>
          <select value={d.lugar} onChange={(e) => set("lugar", e.target.value)} className={`${campo} w-full`}>
            {LUGARES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Mesa</label>
          <input value={d.mesa} onChange={(e) => set("mesa", e.target.value)} placeholder="ex.: 12" className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Ocasião</label>
          <select value={d.ocasiao} onChange={(e) => set("ocasiao", e.target.value)} className={`${campo} w-full`}>
            {OCASIOES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Situação</label>
          <select value={d.status} onChange={(e) => set("status", e.target.value)} className={`${campo} w-full`}>
            {["nova", "aguardando", "confirmada", "cancelada"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo}>Observação</label>
          <textarea value={d.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className={`${campo} w-full`} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={proc}
          onClick={() =>
            aoSalvar({
              nome: d.nome,
              telefone: d.telefone,
              data: d.data,
              turno: d.turno,
              chegada: d.chegada || null,
              adultos: Number(d.adultos) || 0,
              criancas: Number(d.criancas) || 0,
              lugar: d.lugar,
              mesa: d.mesa || null,
              ocasiao: d.ocasiao,
              observacao: d.observacao || null,
              status: d.status,
            })
          }
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          Salvar alterações
        </button>
        <button onClick={aoCancelar} className={btn}>
          Cancelar edição
        </button>
      </div>
    </div>
  );
}

/* ---------------- nova reserva (quem ligou) ---------------- */
function NovaReserva({
  dia,
  proc,
  acao,
}: {
  dia: string;
  proc: boolean;
  acao: (fn: () => Promise<unknown>) => void;
}) {
  const vazio = {
    nome: "",
    telefone: "",
    data: dia,
    turno: "Almoço",
    chegada: "11h15",
    adultos: "2",
    criancas: "0",
    lugar: "Tanto faz",
    ocasiao: "Só uma reserva",
    observacao: "",
  };
  const [d, setD] = useState(vazio);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string) => setD((s) => ({ ...s, [k]: v }));

  return (
    <div className={cartao}>
      <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Lançar reserva (quem ligou)
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={rotulo}>Nome</label>
          <input value={d.nome} onChange={(e) => set("nome", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo}>Telefone</label>
          <input value={d.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(51) 90000-0000" className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Dia</label>
          <input type="date" value={d.data} onChange={(e) => set("data", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Turno</label>
          <select
            value={d.turno}
            onChange={(e) => {
              set("turno", e.target.value);
              set("chegada", CHEGADAS[e.target.value]?.[0] ?? "");
            }}
            className={`${campo} w-full`}
          >
            {TURNOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Chegada</label>
          <select value={d.chegada} onChange={(e) => set("chegada", e.target.value)} className={`${campo} w-full`}>
            {(CHEGADAS[d.turno] ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Onde</label>
          <select value={d.lugar} onChange={(e) => set("lugar", e.target.value)} className={`${campo} w-full`}>
            {LUGARES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Adultos</label>
          <input type="number" min="0" value={d.adultos} onChange={(e) => set("adultos", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div>
          <label className={rotulo}>Crianças</label>
          <input type="number" min="0" value={d.criancas} onChange={(e) => set("criancas", e.target.value)} className={`${campo} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo}>Ocasião</label>
          <select value={d.ocasiao} onChange={(e) => set("ocasiao", e.target.value)} className={`${campo} w-full`}>
            {OCASIOES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo}>Observação</label>
          <textarea value={d.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className={`${campo} w-full`} />
        </div>
      </div>
      <button
        disabled={proc}
        onClick={() => {
          setMsg(null);
          acao(async () => {
            const r = await criarReserva({
              nome: d.nome,
              telefone: d.telefone,
              data: d.data,
              turno: d.turno,
              chegada: d.chegada,
              adultos: Number(d.adultos) || 0,
              criancas: Number(d.criancas) || 0,
              lugar: d.lugar,
              mesa: null,
              ocasiao: d.ocasiao,
              observacao: d.observacao,
            });
            setMsg(r.ok ? "✓ Reserva lançada." : (r.erro ?? "Não salvou."));
            if (r.ok) setD({ ...vazio, data: d.data });
          });
        }}
        className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {proc ? "Salvando..." : "Salvar reserva"}
      </button>
      {msg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}

/* ---------------- datas fechadas ---------------- */
function Bloqueios({
  dia,
  bloqueios,
  proc,
  acao,
  irPara,
}: {
  dia: string;
  bloqueios: Bloqueio[];
  proc: boolean;
  acao: (fn: () => Promise<unknown>) => void;
  irPara: (d: string) => void;
}) {
  const [data, setData] = useState(dia);
  const [turno, setTurno] = useState("Dia todo");
  const [motivo, setMotivo] = useState("");

  return (
    <div className={cartao}>
      <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Fechar datas
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Data fechada some do site: quem tentar reservar recebe o aviso na hora.
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        <select value={turno} onChange={(e) => setTurno(e.target.value)} className={campo}>
          {["Dia todo", ...TURNOS].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          className={`${campo} min-w-40 flex-1`}
        />
        <button
          disabled={proc}
          onClick={() =>
            acao(async () => {
              await bloquearData(data, turno, motivo);
              setMotivo("");
            })
          }
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
        >
          Fechar
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {bloqueios.length === 0 ? (
          <p className="text-xs text-zinc-400">Nenhuma data fechada.</p>
        ) : (
          bloqueios.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
            >
              <button onClick={() => irPara(b.data)} className="text-left hover:text-orange-600">
                <b>{dataBR(b.data)}</b> · {b.turno}
                {b.motivo ? ` · ${b.motivo}` : ""}
              </button>
              <button
                disabled={proc}
                onClick={() => acao(() => liberarBloqueio(b.id))}
                className="text-zinc-400 hover:text-green-600"
              >
                liberar
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------- próximos dias ---------------- */
function ProximosDias({
  hoje,
  proximas,
  lim,
  irPara,
}: {
  hoje: string;
  proximas: { data: string; turno: string; pessoas: number }[];
  lim: Record<string, Limite>;
  irPara: (d: string) => void;
}) {
  const conta = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of proximas) {
      (m[r.data] ??= {})[r.turno] = (m[r.data]?.[r.turno] ?? 0) + r.pessoas;
    }
    return m;
  }, [proximas]);

  return (
    <div className={cartao}>
      <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Próximos 15 dias
      </h2>
      <div className="space-y-2">
        {Array.from({ length: 16 }, (_, i) => addDias(hoje, i)).map((d) => {
          const c = conta[d] ?? {};
          const total = TURNOS.reduce((s, t) => s + (c[t] ?? 0), 0);
          return (
            <button
              key={d}
              onClick={() => irPara(d)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="w-28 shrink-0 text-zinc-600 dark:text-zinc-300">
                {diaSemana(d).slice(0, 3)}, {dataBR(d).slice(0, 5)}
              </span>
              <span className="flex flex-1 gap-2">
                {TURNOS.map((t) => {
                  const pes = c[t] ?? 0;
                  const pct = Math.min(
                    100,
                    Math.round((pes * 100) / (lim[t].max_pessoas || 1)),
                  );
                  const cor =
                    pct >= 95 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
                  return (
                    <span key={t} className="flex-1">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <span className={`block h-full ${cor}`} style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  );
                })}
              </span>
              <span className="w-20 shrink-0 text-right text-zinc-400">
                {total ? `${total} pessoas` : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- lotação e mensagens ---------------- */
function Ajustes({
  lim,
  mensagens,
  proc,
  acao,
}: {
  lim: Record<string, Limite>;
  mensagens: Record<string, string>;
  proc: boolean;
  acao: (fn: () => Promise<unknown>) => void;
}) {
  const [l, setL] = useState(lim);
  const [m, setM] = useState({
    msg_confirmacao: mensagens.msg_confirmacao ?? "",
    msg_aguardando: mensagens.msg_aguardando ?? "",
    msg_sem_mesa: mensagens.msg_sem_mesa ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const setLim = (t: string, k: keyof Limite, v: string) =>
    setL((s) => ({ ...s, [t]: { ...s[t], [k]: Number(v) || 0 } }));

  return (
    <details className={cartao}>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Ajustes: lotação e mensagens
      </summary>

      <div className="mt-3 space-y-4">
        {TURNOS.map((t) => (
          <div key={t}>
            <h3 className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t}</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={rotulo}>Máx. reservas</label>
                <input type="number" min="1" value={l[t].max_reservas} onChange={(e) => setLim(t, "max_reservas", e.target.value)} className={`${campo} w-full`} />
              </div>
              <div>
                <label className={rotulo}>Máx. pessoas</label>
                <input type="number" min="1" value={l[t].max_pessoas} onChange={(e) => setLim(t, "max_pessoas", e.target.value)} className={`${campo} w-full`} />
              </div>
              <div>
                <label className={rotulo}>Grupo grande</label>
                <input type="number" min="2" value={l[t].grupo_grande} onChange={(e) => setLim(t, "grupo_grande", e.target.value)} className={`${campo} w-full`} />
              </div>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-zinc-400">
          Grupo grande: a partir desse número a reserva do site entra como
          “aguardando”, para vocês confirmarem as mesas antes.
        </p>

        <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            Mensagens do WhatsApp. Use {"{nome}"}, {"{data}"}, {"{turno}"} e{" "}
            {"{pessoas}"} — trocamos pelos dados da reserva.
          </p>
          {(
            [
              ["msg_confirmacao", "Confirmação"],
              ["msg_aguardando", "Aguardando mesa"],
              ["msg_sem_mesa", "Sem mesa"],
            ] as const
          ).map(([chave, nome]) => (
            <div key={chave}>
              <label className={rotulo}>{nome}</label>
              <textarea
                rows={2}
                value={m[chave]}
                onChange={(e) => setM((s) => ({ ...s, [chave]: e.target.value }))}
                className={`${campo} w-full`}
              />
            </div>
          ))}
        </div>

        <button
          disabled={proc}
          onClick={() => {
            setMsg(null);
            acao(async () => {
              await salvarLimites(TURNOS.map((t) => l[t]));
              await salvarMensagens(
                Object.entries(m).map(([chave, valor]) => ({ chave, valor })),
              );
              setMsg("✓ Salvo.");
            });
          }}
          className="w-full rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
        >
          Salvar ajustes
        </button>
        {msg && <p className="text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
      </div>
    </details>
  );
}
