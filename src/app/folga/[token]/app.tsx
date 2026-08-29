"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GRUPOS, DIAS, MESES, TURNO, DIAS_ANTECEDENCIA,
  type GrupoKey, type Pedido, type Limites, type Ajustes, type Bloqueios,
  iso, dow, fmtData, difDias, limiteDe,
} from "@/lib/folgas";
import { pedirFolga, cancelarMeuPedido } from "./actions";

type Eu = {
  nome: string;
  grupo: GrupoKey;
  grupo2: GrupoKey | null;
  dias: number[] | null;
  dias2: number[] | null;
};

export function FolgaApp({
  token, eu, counts, limitesRows, ajustesRows, bloqueiosRows, meus, hojeIso,
}: {
  token: string;
  eu: Eu;
  counts: Record<string, number>;
  limitesRows: { grupo: string; dia_semana: number; limite: number | null }[];
  ajustesRows: { data: string; grupo: string; limite: number }[];
  bloqueiosRows: { data: string; motivo: string }[];
  meus: Pedido[];
  hojeIso: string;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [ano, setAno] = useState(Number(hojeIso.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeIso.slice(5, 7)) - 1);
  const [sel, setSel] = useState<string | null>(null);
  const [turno, setTurno] = useState<string | "">("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);

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

  const grupos = [eu.grupo, eu.grupo2].filter(Boolean) as GrupoKey[];
  const diasDoGrupo = (g: GrupoKey) => (g === eu.grupo2 ? eu.dias2 : eu.dias) || [];

  const temPedido = (data: string) => meus.some((p) => p.data === data && p.status !== "Negado");

  // turnos que a pessoa trabalha nesse dia, com as vagas
  function postosDe(data: string) {
    const res: { grupo: GrupoKey; limite: number; usadas: number; sobra: number }[] = [];
    for (const g of grupos) {
      if (!diasDoGrupo(g).includes(dow(data))) continue;
      const lim = limiteDe(data, g, limites, ajustes);
      if (lim === null || lim === undefined) continue;
      const usadas = counts[`${data}|${g}`] || 0;
      res.push({ grupo: g, limite: lim, usadas, sobra: lim - usadas });
    }
    return res;
  }

  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const mesAtual = ano === Number(hojeIso.slice(0, 4)) && mes === Number(hojeIso.slice(5, 7)) - 1;

  function navega(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a); setSel(null);
  }

  function abrir(data: string) {
    setSel(data); setTurno(""); setMotivo(""); setAviso(null);
  }

  function enviar() {
    if (!sel) return;
    const postos = postosDe(sel);
    const alvo = postos.length > 1 ? (turno || "") : "";
    start(async () => {
      const r = await pedirFolga(token, sel, motivo, alvo || undefined);
      if (r.ok) {
        setAviso({ ok: true, txt: "Pedido enviado! Aguarde a resposta." });
        setSel(null);
        router.refresh();
      } else {
        setAviso({ ok: false, txt: r.mensagem || "Não foi possível pedir." });
      }
    });
  }

  const celulas: ReactNode[] = [];
  for (let i = 0; i < primeiro; i++) celulas.push(<div key={`v${i}`} />);
  for (let d = 1; d <= total; d++) {
    const data = iso(ano, mes, d);
    const passado = data < hojeIso;
    let cor = "bg-emerald-500", clicavel = true;
    if (passado) { cor = "bg-transparent"; clicavel = false; }
    else if (bloqueios[data]) { cor = "bg-zinc-400"; clicavel = false; }
    else {
      const postos = postosDe(data);
      if (!postos.length) { cor = "bg-zinc-300 dark:bg-zinc-700"; clicavel = false; }
      else {
        const melhor = Math.max(...postos.map((x) => x.sobra));
        cor = melhor > 0 ? "bg-emerald-500" : "bg-red-500";
      }
    }
    const marcado = !passado && temPedido(data);
    celulas.push(
      <button
        key={data}
        disabled={!clicavel}
        onClick={() => abrir(data)}
        className={`flex min-h-[46px] flex-col items-center justify-center rounded-lg border text-sm ${sel === data ? "border-blue-500 ring-1 ring-blue-500" : "border-zinc-200 dark:border-zinc-800"} ${passado ? "opacity-30" : ""} ${clicavel ? "" : "cursor-default"}`}
      >
        <span className="font-semibold">{d}</span>
        {marcado ? <span className="text-[10px] text-blue-500">✓ pedida</span> : <span className={`mt-0.5 h-2 w-2 rounded-full ${cor}`} />}
      </button>,
    );
  }

  const postosSel = sel ? postosDe(sel) : [];
  const travadoSel = sel ? bloqueios[sel] : null;
  const foraPrazo = sel ? difDias(hojeIso, sel) < DIAS_ANTECEDENCIA : false;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-3 dark:bg-zinc-950">
      <div className="mb-3 flex items-center gap-3 px-1 pt-2">
        <span className="text-2xl">🌴</span>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Olá, {eu.nome.split(" ")[0]}</h1>
          <p className="text-xs text-zinc-500">{grupos.map((g) => GRUPOS[g].nome).join(" + ")}</p>
        </div>
      </div>

      {aviso && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${aviso.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-red-500/40 bg-red-500/10 text-red-600"}`}>
          {aviso.txt}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => navega(-1)} disabled={mesAtual} className="text-sm text-zinc-500 disabled:opacity-30">‹</button>
          <h3 className="text-sm font-bold">{MESES[mes]} {ano}</h3>
          <button onClick={() => navega(1)} className="text-sm text-zinc-500">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-zinc-400">
          {DIAS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">{celulas}</div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> tem vaga</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" /> sem vaga</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-zinc-400" /> travado / não trabalha</span>
        </div>
      </div>

      {/* Pedir folga no dia escolhido */}
      {sel && (
        <div className="mt-3 rounded-2xl border border-blue-500/30 bg-white p-4 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{DIAS[dow(sel)]}, {fmtData(sel)}</h2>
            <button onClick={() => setSel(null)} className="text-sm text-zinc-500">fechar</button>
          </div>

          {travadoSel ? (
            <p className="mt-2 text-sm text-red-500">Dia travado: {travadoSel}. Não dá pra pedir folga nesse dia.</p>
          ) : postosSel.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Você não trabalha nesse dia.</p>
          ) : (
            <>
              {postosSel.length > 1 && (
                <>
                  <p className="mt-3 text-xs text-zinc-500">Você trabalha nos dois turnos nesse dia. De qual quer folga?</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button onClick={() => setTurno("")} className={`rounded-lg px-3 py-1.5 text-sm ${turno === "" ? "bg-blue-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>Dia inteiro</button>
                    {postosSel.map((p) => (
                      <button key={p.grupo} onClick={() => setTurno(p.grupo)} className={`rounded-lg px-3 py-1.5 text-sm ${turno === p.grupo ? "bg-blue-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>
                        {GRUPOS[p.grupo].nome} ({TURNO[p.grupo]})
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-3 space-y-1 text-sm">
                {postosSel.map((p) => (
                  <div key={p.grupo} className="flex justify-between">
                    <span style={{ color: GRUPOS[p.grupo].cor }}>{GRUPOS[p.grupo].nome}</span>
                    <span className={p.sobra > 0 ? "text-emerald-600" : "text-red-500"}>
                      {p.sobra > 0 ? `${p.sobra} vaga(s)` : "sem vaga"}
                    </span>
                  </div>
                ))}
              </div>

              {foraPrazo && <p className="mt-2 text-xs text-amber-500">Faltam menos de {DIAS_ANTECEDENCIA} dias — o pedido vai marcado como fora do prazo.</p>}
              {temPedido(sel) && <p className="mt-2 text-xs text-blue-500">Você já tem um pedido nesse dia.</p>}

              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (opcional)"
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
              <button
                disabled={proc}
                onClick={enviar}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {proc ? "Enviando..." : "Pedir folga"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Meus pedidos */}
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 font-bold">Meus pedidos</h2>
        {meus.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pedido ainda.</p>
        ) : (
          <ul className="space-y-2">
            {meus.slice().reverse().map((p) => {
              const cor = p.status === "Aprovado" ? "text-emerald-600" : p.status === "Negado" ? "text-red-500" : "text-amber-500";
              return (
                <li key={p.id} className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-2 text-sm last:border-0 dark:border-zinc-800">
                  <div className="min-w-0">
                    <div className="font-medium">{fmtData(p.data)} <span className={`font-semibold ${cor}`}>· {p.status}</span></div>
                    {p.grupo_alvo && <div className="text-xs text-zinc-500">turno {TURNO[p.grupo_alvo] || ""}</div>}
                    {p.motivo && <div className="text-xs text-zinc-500">{p.motivo}</div>}
                    {p.status === "Negado" && p.motivo_negativa && <div className="text-xs text-red-500">Motivo: {p.motivo_negativa}</div>}
                  </div>
                  {p.status === "Pendente" && (
                    <button
                      disabled={proc}
                      onClick={() => { if (window.confirm("Cancelar este pedido?")) start(async () => { await cancelarMeuPedido(token, p.id); router.refresh(); }); }}
                      className="shrink-0 text-xs text-red-500 underline"
                    >
                      cancelar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 pb-6 text-center text-[11px] text-zinc-400">Brasa · folgas</p>
    </div>
  );
}
