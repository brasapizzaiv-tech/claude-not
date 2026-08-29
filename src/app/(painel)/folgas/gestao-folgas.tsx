"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GRUPOS, GRUPO_KEYS, DIAS, MESES, TURNO, DIAS_ANTECEDENCIA,
  type GrupoKey, type Funcionario, type Pedido, type Limites, type Ajustes, type Bloqueios,
  iso, dow, fmtData, difDias, gruposDe, alvosDe, limiteDe, contar, semGerente,
} from "@/lib/folgas";
import {
  decidirPedido, reabrirPedido, lancarFolga, excluirPedido,
  salvarLimites, definirAjuste, limparAjuste,
  travarData, destravarData,
} from "./actions";

type Aba = "pedidos" | "calendario" | "limites";

export function GestaoFolgas({
  equipe, pedidos, limitesRows, ajustesRows, bloqueiosRows, hojeIso,
}: {
  equipe: Funcionario[];
  pedidos: Pedido[];
  limitesRows: { grupo: string; dia_semana: number; limite: number | null }[];
  ajustesRows: { data: string; grupo: string; limite: number }[];
  bloqueiosRows: { data: string; motivo: string }[];
  hojeIso: string;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState<Aba>("pedidos");
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);

  const byId = useMemo(() => new Map(equipe.map((f) => [f.id, f])), [equipe]);
  const limites: Limites = useMemo(() => {
    const o: Limites = {};
    for (const r of limitesRows) (o[r.grupo] ||= {})[r.dia_semana] = r.limite;
    return o;
  }, [limitesRows]);
  const ajustes: Ajustes = useMemo(() => {
    const o: Ajustes = {};
    for (const r of ajustesRows) (o[r.data] ||= {})[r.grupo] = r.limite;
    return o;
  }, [ajustesRows]);
  const bloqueios: Bloqueios = useMemo(() => {
    const o: Bloqueios = {};
    for (const r of bloqueiosRows) o[r.data] = r.motivo;
    return o;
  }, [bloqueiosRows]);

  function run(fn: () => Promise<{ ok: boolean; mensagem?: string }>, sucesso?: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (sucesso) setAviso({ ok: true, txt: sucesso });
        else setAviso(null);
        router.refresh();
      } else {
        setAviso({ ok: false, txt: r.mensagem || "Não foi possível." });
      }
    });
  }

  const pendentes = pedidos.filter((p) => p.status === "Pendente");
  const abas: [Aba, string][] = [
    ["pedidos", `Pedidos (${pendentes.length})`],
    ["calendario", "Calendário"],
    ["limites", "Limites padrão"],
  ];

  const ctx = { equipe, pedidos, byId, limites, ajustes, bloqueios, hojeIso, proc, run, setAviso };

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <div className="mb-4">
        <h1 className="text-xl font-bold">🌴 Folgas</h1>
        <p className="text-xs text-zinc-500">Cadastro da equipe e escala agora em <b>Cadastros → Colaboradores</b>.</p>
      </div>

      {aviso && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${aviso.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"}`}>
          {aviso.txt}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {abas.map(([k, r]) => (
          <button
            key={k}
            onClick={() => { setAba(k); setAviso(null); }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${aba === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}
          >
            {r}
          </button>
        ))}
      </div>

      {aba === "pedidos" && <AbaPedidos {...ctx} />}
      {aba === "calendario" && <AbaCalendario {...ctx} />}
      {aba === "limites" && <AbaLimites limites={limites} proc={proc} run={run} />}
    </div>
  );
}

type Ctx = {
  equipe: Funcionario[];
  pedidos: Pedido[];
  byId: Map<number, Funcionario>;
  limites: Limites;
  ajustes: Ajustes;
  bloqueios: Bloqueios;
  hojeIso: string;
  proc: boolean;
  run: (fn: () => Promise<{ ok: boolean; mensagem?: string }>, sucesso?: string) => void;
  setAviso: (a: { ok: boolean; txt: string } | null) => void;
};

const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

// ======================= ABA PEDIDOS =======================
function AbaPedidos({ equipe, pedidos, byId, limites, ajustes, bloqueios, hojeIso, proc, run }: Ctx) {
  const [negando, setNegando] = useState<number | null>(null);
  const [motivoNeg, setMotivoNeg] = useState("");
  const [lancar, setLancar] = useState(false);

  const pend = pedidos.filter((p) => p.status === "Pendente");
  const negados = pedidos.filter((p) => p.status === "Negado").slice(-15).reverse();

  return (
    <div className="space-y-3">
      <button
        onClick={() => setLancar((v) => !v)}
        className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white"
      >
        {lancar ? "Fechar" : "+ Lançar folga direto"}
      </button>

      {lancar && <FormLancar equipe={equipe} pedidos={pedidos} byId={byId} limites={limites} ajustes={ajustes} proc={proc} run={run} onDone={() => setLancar(false)} />}

      {!pend.length && <div className={card}><p className="text-sm text-zinc-500">Nada esperando decisão. ✅</p></div>}

      {pend.map((p) => {
        const f = byId.get(p.funcionario_id);
        if (!f) return null;
        // grupo mais apertado
        let lim: number | null = null, aprov = 0, gApertado: GrupoKey = alvosDe(p, byId)[0] || f.grupo;
        for (const g of alvosDe(p, byId)) {
          const l = limiteDe(p.data, g, limites, ajustes);
          if (l === null || l === undefined) continue;
          const a = contar(pedidos, p.data, g, false, byId);
          if (lim === null || l - a < lim - aprov) { lim = l; aprov = a; gApertado = g; }
        }
        const estoura = lim !== null && aprov >= lim;
        const conc = pedidos.filter((x) => x.data === p.data && x.status === "Pendente" && alvosDe(x, byId).includes(gApertado)).length;
        const atras = difDias(hojeIso, p.data) < DIAS_ANTECEDENCIA;
        const doisTurnos = gruposDe(f).length > 1;
        return (
          <div key={p.id} className={`${card} ${estoura ? "border-red-500/50" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{f.nome} <span className="font-normal text-zinc-400">· {f.vinculo}</span></div>
                <div className="text-xs" style={{ color: GRUPOS[f.grupo].cor }}>
                  {gruposDe(f).map((g) => GRUPOS[g].nome).join(" + ")}{f.funcao ? ` · ${f.funcao}` : ""}
                </div>
                <div className="mt-1 font-semibold">
                  {DIAS[dow(p.data)]}, {fmtData(p.data)}
                  {p.grupo_alvo && doisTurnos ? ` · turno ${TURNO[p.grupo_alvo] || ""}` : ""}
                  {!p.grupo_alvo && doisTurnos ? <span className="text-amber-500"> · dia inteiro</span> : ""}
                </div>
                {p.motivo && <p className="mt-1 text-sm text-zinc-500">{p.motivo}</p>}
                <p className={`mt-1 text-xs ${estoura ? "text-red-500" : "text-zinc-500"}`}>
                  {lim === null ? "Grupo sem operação nesse dia" : `${aprov} de ${lim} já aprovada(s) em ${GRUPOS[gApertado].nome.toLowerCase()}`}
                  {estoura ? " · aprovar aqui passa do limite" : ""}
                </p>
                {conc > 1 && <p className="mt-1 text-xs font-bold text-amber-500">{conc} pessoas do mesmo grupo pediram esse dia</p>}
                {f.gerente && semGerente(p.data, equipe, pedidos) && <p className="mt-1 text-xs font-bold text-red-500">A casa fica sem nenhum gerente nesse dia</p>}
                {atras && <p className="mt-1 text-xs text-amber-500">Fora do prazo de {DIAS_ANTECEDENCIA} dias</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    disabled={proc}
                    onClick={() => run(() => decidirPedido(p.id, true))}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold text-white ${estoura ? "bg-red-600" : "bg-emerald-600"}`}
                  >
                    {estoura ? "Aprovar mesmo assim" : "Aprovar"}
                  </button>
                  <button
                    onClick={() => { setNegando(negando === p.id ? null : p.id); setMotivoNeg(""); }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-600"
                  >
                    Negar
                  </button>
                </div>
              </div>
            </div>
            {negando === p.id && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <input
                  autoFocus
                  value={motivoNeg}
                  onChange={(e) => setMotivoNeg(e.target.value)}
                  placeholder="Motivo da negativa — a pessoa vai ler isso"
                  className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700"
                />
                <button
                  disabled={proc}
                  onClick={() => run(() => decidirPedido(p.id, false, motivoNeg), undefined)}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white"
                >
                  Confirmar negativa
                </button>
              </div>
            )}
          </div>
        );
      })}

      <CalendarioAprovadas pedidos={pedidos} byId={byId} bloqueios={bloqueios} hojeIso={hojeIso} proc={proc} run={run} />

      {negados.length > 0 && (
        <div className={card}>
          <h2 className="mb-2 font-bold">Negados recentes</h2>
          <ul className="space-y-1 text-sm">
            {negados.map((p) => {
              const f = byId.get(p.funcionario_id);
              if (!f) return null;
              return (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    {f.nome} · {fmtData(p.data)}{" "}
                    <span className="text-zinc-400">{p.motivo_negativa || "sem motivo registrado"}</span>
                  </span>
                  <button onClick={() => run(() => reabrirPedido(p.id))} className="shrink-0 text-xs text-blue-500 underline">reabrir</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Calendário do mês com os nomes de quem está de folga (aprovado) em cada dia.
function CalendarioAprovadas({ pedidos, byId, bloqueios, hojeIso, proc, run }: {
  pedidos: Pedido[]; byId: Map<number, Funcionario>; bloqueios: Bloqueios;
  hojeIso: string; proc: boolean; run: Ctx["run"];
}) {
  const [ano, setAno] = useState(Number(hojeIso.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeIso.slice(5, 7)) - 1);

  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();

  function navega(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a);
  }

  const aprovadas = pedidos.filter((p) => p.status === "Aprovado");

  const celulas: ReactNode[] = [];
  for (let i = 0; i < primeiro; i++) celulas.push(<div key={`v${i}`} />);
  for (let d = 1; d <= total; d++) {
    const data = iso(ano, mes, d);
    const doDia = aprovadas.filter((p) => p.data === data);
    const trav = bloqueios[data];
    celulas.push(
      <div key={data} className="min-h-[64px] rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
          {d}{trav && <span className="h-2 w-2 rounded-full bg-red-500" title={trav} />}
        </div>
        <div className="mt-0.5 flex flex-col gap-0.5">
          {doDia.map((p) => {
            const f = byId.get(p.funcionario_id);
            if (!f) return null;
            const g = (p.grupo_alvo as GrupoKey) || f.grupo;
            return (
              <button
                key={p.id}
                onClick={() => { if (window.confirm(`Excluir a folga de ${f.nome} em ${fmtData(p.data)}?`)) run(() => excluirPedido(p.id)); }}
                disabled={proc}
                className="truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight"
                style={{ color: GRUPOS[g]?.cor, background: `${GRUPOS[g]?.cor}1f` }}
                title={`${f.nome} — ${GRUPOS[g]?.nome ?? ""} (clique para excluir)`}
              >
                {f.nome.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>,
    );
  }

  return (
    <div className={card}>
      <h2 className="font-bold">Folgas aprovadas</h2>
      <p className="text-sm text-zinc-500">Quem está de folga em cada dia. Toque num nome para excluir.</p>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => navega(-1)} className="text-sm text-zinc-500">‹ Anterior</button>
        <h3 className="font-bold">{MESES[mes]} {ano}</h3>
        <button onClick={() => navega(1)} className="text-sm text-zinc-500">Próximo ›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-400">
        {DIAS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">{celulas}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        {GRUPO_KEYS.map((g) => (
          <span key={g} className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full" style={{ background: GRUPOS[g].cor }} />{GRUPOS[g].nome}
          </span>
        ))}
      </div>
    </div>
  );
}

function FormLancar({ equipe, pedidos, byId, limites, ajustes, proc, run, onDone }: {
  equipe: Funcionario[]; pedidos: Pedido[]; byId: Map<number, Funcionario>;
  limites: Limites; ajustes: Ajustes; proc: boolean;
  run: Ctx["run"]; onDone: () => void;
}) {
  const [pid, setPid] = useState("");
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [turno, setTurno] = useState<string | "">("");

  const f = pid ? byId.get(Number(pid)) : undefined;
  const grupos = f ? gruposDe(f) : [];
  const info = f && data
    ? grupos.map((g) => {
        const l = limiteDe(data, g, limites, ajustes);
        const a = contar(pedidos, data, g, true, byId);
        return `${GRUPOS[g].nome}: ${l === null || l === undefined ? "não opera" : `${a}/${l}`}`;
      }).join(" · ")
    : "";

  function salvar() {
    run(() => lancarFolga(Number(pid), data, motivo, turno || undefined), "Folga lançada.");
    onDone();
  }

  return (
    <div className={`${card} border-amber-500/40`}>
      <h2 className="font-bold">Lançar folga direto</h2>
      <p className="text-sm text-zinc-500">Para quando a pessoa pede pessoalmente ou no WhatsApp. Entra já aprovada.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={pid} onChange={(e) => { setPid(e.target.value); setTurno(""); }} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
          <option value="">Escolha a pessoa</option>
          {GRUPO_KEYS.map((g) => (
            <optgroup key={g} label={GRUPOS[g].nome}>
              {equipe.filter((e) => e.grupo === g && e.ativo).map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      </div>
      {grupos.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => setTurno("")} className={`rounded-lg px-3 py-1.5 text-sm ${turno === "" ? "bg-blue-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>Dia inteiro</button>
          {grupos.map((g) => (
            <button key={g} onClick={() => setTurno(g)} className={`rounded-lg px-3 py-1.5 text-sm ${turno === g ? "bg-blue-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>
              {GRUPOS[g].nome} ({TURNO[g]})
            </button>
          ))}
        </div>
      )}
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo ou observação" className="mt-2 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      {info && <p className="mt-2 text-xs text-zinc-500">{info}</p>}
      <div className="mt-3 flex gap-2">
        <button disabled={proc || !pid || !data} onClick={salvar} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">Lançar folga aprovada</button>
        <button onClick={onDone} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Cancelar</button>
      </div>
    </div>
  );
}

// ======================= ABA CALENDÁRIO =======================
function AbaCalendario({ pedidos, byId, limites, ajustes, bloqueios, hojeIso, proc, run }: Ctx) {
  const [ano, setAno] = useState(Number(hojeIso.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeIso.slice(5, 7)) - 1);
  const [sel, setSel] = useState<string | null>(null);
  const [motivoTrava, setMotivoTrava] = useState("");

  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();

  function navega(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a); setSel(null);
  }

  const celulas: ReactNode[] = [];
  for (let i = 0; i < primeiro; i++) celulas.push(<div key={`v${i}`} />);
  for (let d = 1; d <= total; d++) {
    const data = iso(ano, mes, d);
    let cor = "bg-emerald-500", rot: string[] = [], abertos = 0, pior = "livre";
    if (bloqueios[data]) { cor = "bg-zinc-400"; rot = ["Travado"]; }
    else {
      for (const g of GRUPO_KEYS) {
        const lim = limiteDe(data, g, limites, ajustes);
        if (lim === null || lim === undefined) continue;
        abertos++;
        const sobra = lim - contar(pedidos, data, g, true, byId);
        if (sobra <= 1) rot.push(`${GRUPOS[g].curto} ${sobra}`);
        if (sobra <= 0) pior = "cheio"; else if (sobra === 1 && pior !== "cheio") pior = "apertado";
      }
      if (!abertos) { cor = "bg-zinc-400"; rot = ["Fechado"]; }
      else { cor = pior === "cheio" ? "bg-red-500" : pior === "apertado" ? "bg-amber-500" : "bg-emerald-500"; if (!rot.length) rot = ["Livre"]; }
    }
    celulas.push(
      <button
        key={data}
        onClick={() => setSel(data)}
        className={`flex min-h-[58px] flex-col rounded-lg border p-1 text-left ${sel === data ? "border-blue-500 ring-1 ring-blue-500" : "border-zinc-200 dark:border-zinc-800"}`}
      >
        <span className="flex items-center justify-between text-sm font-semibold">
          {d}<span className={`h-2.5 w-2.5 rounded-full ${cor}`} />
        </span>
        <span className="mt-0.5 text-[10px] leading-tight text-zinc-500">{rot.join(" · ")}</span>
      </button>,
    );
  }

  const doDia = sel ? pedidos.filter((p) => p.data === sel && p.status !== "Negado") : [];

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => navega(-1)} className="text-sm text-zinc-500">‹ Anterior</button>
          <h3 className="font-bold">{MESES[mes]} {ano}</h3>
          <button onClick={() => navega(1)} className="text-sm text-zinc-500">Próximo ›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-400">
          {DIAS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">{celulas}</div>
        <p className="mt-2 text-xs text-zinc-500">Só aparecem os grupos com 1 vaga ou menos. Toque no dia para ver o detalhe.</p>
      </div>

      {sel && (
        <div className={`${card} border-blue-500/30`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{DIAS[dow(sel)]}, {fmtData(sel)}</h2>
            <button onClick={() => setSel(null)} className="text-sm text-zinc-500">fechar</button>
          </div>
          <div className="mt-2 space-y-1.5">
            {GRUPO_KEYS.map((g) => {
              const lim = limiteDe(sel, g, limites, ajustes);
              if (lim === null || lim === undefined)
                return <div key={g} className="flex justify-between text-sm text-zinc-400"><span>{GRUPOS[g].nome}</span><span>Sem operação</span></div>;
              const usadas = contar(pedidos, sel, g, true, byId);
              return (
                <div key={g} className="flex items-center justify-between text-sm">
                  <span style={{ color: GRUPOS[g].cor }} className="font-semibold">{GRUPOS[g].nome}</span>
                  <span className="flex items-center gap-2">
                    <button disabled={proc || lim <= 0} onClick={() => run(() => definirAjuste(sel, g, lim - 1))} className="h-7 w-7 rounded border border-zinc-300 dark:border-zinc-600">−</button>
                    <b className="min-w-[52px] text-center">{usadas}/{lim}</b>
                    <button disabled={proc} onClick={() => run(() => definirAjuste(sel, g, lim + 1))} className="h-7 w-7 rounded border border-zinc-300 dark:border-zinc-600">+</button>
                  </span>
                </div>
              );
            })}
          </div>
          {ajustes[sel] && (
            <button onClick={() => run(() => limparAjuste(sel))} className="mt-2 text-xs text-blue-500 underline">voltar ao limite padrão do dia da semana</button>
          )}

          {doDia.length > 0 && (
            <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <p className="mb-1 text-xs font-semibold text-zinc-400">De folga nesse dia:</p>
              <div className="flex flex-wrap gap-1">
                {doDia.map((p) => {
                  const f = byId.get(p.funcionario_id);
                  if (!f) return null;
                  const g = (p.grupo_alvo as GrupoKey) || f.grupo;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { if (window.confirm(`Excluir a folga de ${f.nome} em ${fmtData(p.data)}?`)) run(() => excluirPedido(p.id)); }}
                      className="rounded px-2 py-0.5 text-xs"
                      style={{ color: GRUPOS[g]?.cor, background: `${GRUPOS[g]?.cor}22` }}
                      title="Excluir esta folga"
                    >
                      {f.nome.split(" ")[0]}{p.status === "Pendente" ? " (pend.)" : ""} ✕
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {bloqueios[sel] ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-red-500">Data travada: {bloqueios[sel]}</span>
                <button disabled={proc} onClick={() => run(() => destravarData(sel))} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">Destravar</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input value={motivoTrava} onChange={(e) => setMotivoTrava(e.target.value)} placeholder="Motivo da trava (ex.: Kerb, evento)" className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
                <button disabled={proc} onClick={() => run(() => travarData(sel, motivoTrava))} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">Travar data</button>
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">Travar só impede o pedido pelo app — você continua podendo lançar folga direto.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= ABA LIMITES =======================
function AbaLimites({ limites, proc, run }: { limites: Limites; proc: boolean; run: Ctx["run"] }) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const g of GRUPO_KEYS) for (let d = 0; d <= 6; d++) {
      const v = limites[g]?.[d];
      o[`${g}|${d}`] = v === null || v === undefined ? "" : String(v);
    }
    return o;
  });

  function salvar() {
    const rows: { grupo: string; dia_semana: number; limite: number | null }[] = [];
    for (const g of GRUPO_KEYS) for (let d = 0; d <= 6; d++) {
      const s = vals[`${g}|${d}`];
      rows.push({ grupo: g, dia_semana: d, limite: s === "" ? null : Math.max(0, Number(s) || 0) });
    }
    run(() => salvarLimites(rows), "Limites salvos.");
  }

  return (
    <div className={card}>
      <h2 className="font-bold">Limite padrão de folgas</h2>
      <p className="text-sm text-zinc-500">Quantas pessoas de cada grupo podem folgar em cada dia da semana. Vale de hoje em diante. Ajustes de um dia específico ficam na aba Calendário.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <tbody>
            <tr>
              <th />
              {DIAS.map((d) => <th key={d} className="p-1.5 text-xs font-semibold text-zinc-400">{d}</th>)}
            </tr>
            {GRUPO_KEYS.map((g) => (
              <tr key={g}>
                <td className="whitespace-nowrap py-2 pr-2 font-semibold" style={{ color: GRUPOS[g].cor }}>{GRUPOS[g].nome}</td>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <td key={d} className="p-0.5">
                    <input
                      type="number" min={0} max={30}
                      value={vals[`${g}|${d}`]}
                      onChange={(e) => setVals((o) => ({ ...o, [`${g}|${d}`]: e.target.value }))}
                      placeholder="—"
                      className="w-full min-w-[52px] rounded border border-zinc-300 bg-transparent px-1 py-2 text-center dark:border-zinc-700"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={proc} onClick={salvar} className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">Salvar limites padrão</button>
      <p className="mt-2 text-xs text-zinc-500"><b>Em branco</b> = o grupo não trabalha nesse dia (nem aparece pra quem é do grupo). <b>Zero</b> = trabalha, mas sem vaga de folga (a pessoa vê &quot;Sem vaga&quot; e ainda pode pedir).</p>
    </div>
  );
}

