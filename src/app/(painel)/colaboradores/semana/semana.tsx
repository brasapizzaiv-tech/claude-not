"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl, rotuloDia, rotuloSemana, somarDias, deYmd, TURNOS } from "@/lib/equipe";
import { criarEsporadico, marcarPresenca, preencherEscalaFixa, salvarDezPorCento, type Turno } from "./actions";

export type Pessoa = {
  id: string;
  nome: string;
  turno: "dia" | "noite" | "ambos" | "proprietario";
  vinculo: "clt" | "freelance";
  funcao: string | null;
  valor_dia: number | null;
  valor_noite: number | null;
  salario_base: number | null;
  recebe_10: boolean;
  peso_10: number;
  esporadico: boolean;
  ativo: boolean;
};

type Presenca = { colaborador_id: string; data: string; turno: Turno };
type Dez = { data: string; valor: number; obs: string | null };

const chave = (id: string, data: string, turno: Turno) => `${id}|${data}|${turno}`;

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function numBRtxt(s: string) {
  const t = s.trim();
  if (!t) return 0;
  const n = t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t)
    ? Number(t.replace(/\./g, "").replace(",", "."))
    : Number(t);
  return Number.isFinite(n) ? n : 0;
}
const fmtNum = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SemanaClient({
  segunda, dias, pessoas, presencasIniciais, dezIniciais,
}: {
  segunda: string;
  dias: string[];
  pessoas: Pessoa[];
  presencasIniciais: Presenca[];
  dezIniciais: Dez[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(presencasIniciais.map((p) => chave(p.colaborador_id, p.data, p.turno))),
  );
  const [dez, setDez] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const d of dezIniciais) o[d.data] = d.valor ? fmtNum(Number(d.valor)) : "";
    return o;
  });
  const [extras, setExtras] = useState<Set<string>>(new Set()); // esporádicos trazidos pra semana
  const [erro, setErro] = useState<string | null>(null);
  const [addAberto, setAddAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDia, setNovoDia] = useState("");
  const [novoNoite, setNovoNoite] = useState("");
  const [buscaExtra, setBuscaExtra] = useState("");
  const [modo, setModo] = useState<"grade" | "resumo">("grade");

  // Quem aparece na grade: fixos (não esporádicos, não proprietários) + esporádicos
  // que têm presença na semana ou foram adicionados agora.
  const naGrade = useMemo(() => {
    const comPresenca = new Set(presencasIniciais.map((p) => p.colaborador_id));
    for (const k of marcadas) comPresenca.add(k.split("|")[0]);
    return pessoas.filter(
      (p) => p.turno !== "proprietario" && (!p.esporadico || comPresenca.has(p.id) || extras.has(p.id)),
    );
  }, [pessoas, presencasIniciais, marcadas, extras]);

  const foraDaGrade = useMemo(() => {
    const ids = new Set(naGrade.map((p) => p.id));
    return pessoas.filter((p) => !ids.has(p.id) && p.turno !== "proprietario");
  }, [pessoas, naGrade]);

  // Cálculo: por noite, o 10% é dividido entre os presentes que recebem 10%
  // (proporcional ao peso — normalmente 1 pra todo mundo).
  const calc = useMemo(() => {
    const porNoite = dias.map((d) => {
      const pool = numBRtxt(dez[d] ?? "");
      const presentes = naGrade.filter((p) => p.recebe_10 && marcadas.has(chave(p.id, d, "noite")));
      const pesoTotal = presentes.reduce((s, p) => s + (Number(p.peso_10) || 1), 0);
      const unit = pesoTotal > 0 ? pool / pesoTotal : 0;
      return { data: d, pool, presentes: presentes.length, pesoTotal, unit };
    });
    const porPessoa = naGrade.map((p) => {
      let nDias = 0, nNoites = 0, dez10 = 0;
      for (const [i, d] of dias.entries()) {
        if (marcadas.has(chave(p.id, d, "dia"))) nDias++;
        if (marcadas.has(chave(p.id, d, "noite"))) {
          nNoites++;
          if (p.recebe_10) dez10 += porNoite[i].unit * (Number(p.peso_10) || 1);
        }
      }
      const clt = p.vinculo === "clt";
      const diarias = clt ? 0 : nDias * (Number(p.valor_dia) || 0) + nNoites * (Number(p.valor_noite) || 0);
      return { p, nDias, nNoites, diarias, dez10, total: diarias + dez10, clt };
    });
    const totalPool = porNoite.reduce((s, n) => s + n.pool, 0);
    const totalDiarias = porPessoa.reduce((s, x) => s + x.diarias, 0);
    const totalDez = porPessoa.reduce((s, x) => s + x.dez10, 0);
    return { porNoite, porPessoa, totalPool, totalDiarias, totalDez };
  }, [dias, dez, naGrade, marcadas]);

  function toggle(p: Pessoa, d: string, turno: Turno) {
    const k = chave(p.id, d, turno);
    const marcar = !marcadas.has(k);
    setMarcadas((prev) => { const n = new Set(prev); if (marcar) n.add(k); else n.delete(k); return n; });
    start(async () => {
      const r = await marcarPresenca(p.id, d, turno, marcar);
      if (r.erro) {
        setErro(r.erro);
        setMarcadas((prev) => { const n = new Set(prev); if (marcar) n.delete(k); else n.add(k); return n; });
      }
    });
  }

  function salvarDez(d: string) {
    const v = numBRtxt(dez[d] ?? "");
    setDez((o) => ({ ...o, [d]: v ? fmtNum(v) : "" }));
    start(async () => {
      const r = await salvarDezPorCento(d, v);
      if (r.erro) setErro(r.erro);
    });
  }

  function baixarCsv() {
    const linhas: string[][] = [
      ["Semana", rotuloSemana(segunda)],
      [],
      ["Nome", "Vínculo", "Dias", "Noites", "Valor dia", "Valor noite", "Diárias", "10%", "Total"],
      ...calc.porPessoa.map(({ p, nDias, nNoites, diarias, dez10, total, clt }) => [
        p.nome, clt ? "CLT" : "Freelance", String(nDias), String(nNoites),
        fmtNum(Number(p.valor_dia) || 0), fmtNum(Number(p.valor_noite) || 0),
        fmtNum(diarias), fmtNum(dez10), fmtNum(total),
      ]),
      [],
      ["Noite", "10% arrecadado", "Presentes", "Cada um"],
      ...calc.porNoite.map((n) => [rotuloDia(n.data), fmtNum(n.pool), String(n.presentes), fmtNum(n.unit)]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `semana-${segunda}.csv`;
    a.click();
  }

  const hoje = new Date();
  const ehHoje = (d: string) => deYmd(d).toDateString() === hoje.toDateString();

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Semana e 10%</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Marque quem trabalhou em cada dia (☀️ dia / 🌙 noite), digite o 10% de cada noite e o sistema soma o que pagar.
            {" "}<Link href="/colaboradores" className="text-orange-600 hover:underline">Cadastro da equipe</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/colaboradores/semana?s=${somarDias(segunda, -7)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">← anterior</Link>
          <span className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white">{rotuloSemana(segunda)}</span>
          <Link href={`/colaboradores/semana?s=${somarDias(segunda, 7)}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">próxima →</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          <button onClick={() => setModo("grade")} className={`px-3 py-1.5 ${modo === "grade" ? "bg-orange-500 text-white" : ""}`}>🗓️ Grade</button>
          <button onClick={() => setModo("resumo")} className={`px-3 py-1.5 ${modo === "resumo" ? "bg-orange-500 text-white" : ""}`}>💵 Resumo pra pagar</button>
        </div>
        <button
          onClick={() => start(async () => { const r = await preencherEscalaFixa(segunda); if (r.erro) setErro(r.erro); else router.refresh(); })}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          title="Marca os dias fixos de cada pessoa (não apaga o que já foi marcado)"
        >
          ✨ Preencher com a escala fixa
        </button>
        <button onClick={() => setAddAberto((v) => !v)} className="rounded-lg border border-orange-500 px-3 py-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
          + Free esporádico
        </button>
        <button onClick={baixarCsv} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
          ⬇️ Planilha (CSV)
        </button>
        {pending && <span className="text-xs text-zinc-400">salvando…</span>}
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>

      {addAberto && (
        <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
          <p className="mb-2 text-sm font-medium">Trazer alguém pra esta semana</p>
          {foraDaGrade.length > 0 && (
            <div className="mb-3">
              <input
                value={buscaExtra}
                onChange={(e) => setBuscaExtra(e.target.value)}
                placeholder="Buscar quem já está cadastrado…"
                className={`${inputCls} mb-2 w-full sm:w-72`}
              />
              <div className="flex flex-wrap gap-1.5">
                {foraDaGrade
                  .filter((p) => !buscaExtra || p.nome.toLowerCase().includes(buscaExtra.toLowerCase()))
                  .slice(0, 30)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setExtras((s) => new Set(s).add(p.id)); setAddAberto(false); }}
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm hover:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {p.nome}{p.esporadico ? " · free" : ""}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <p className="mb-1 text-xs font-bold uppercase text-zinc-400">Ou cadastrar um free novo</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome" className={`${inputCls} w-48`} />
            <input value={novoDia} onChange={(e) => setNovoDia(e.target.value)} placeholder="R$ dia" inputMode="decimal" className={`${inputCls} w-24`} />
            <input value={novoNoite} onChange={(e) => setNovoNoite(e.target.value)} placeholder="R$ noite" inputMode="decimal" className={`${inputCls} w-24`} />
            <button
              onClick={() =>
                start(async () => {
                  const r = await criarEsporadico(novoNome, numBRtxt(novoDia) || null, numBRtxt(novoNoite) || null);
                  if (r.erro) { setErro(r.erro); return; }
                  if (r.id) setExtras((s) => new Set(s).add(r.id!));
                  setNovoNome(""); setNovoDia(""); setNovoNoite(""); setAddAberto(false);
                  router.refresh();
                })
              }
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
            >
              Cadastrar e trazer
            </button>
          </div>
        </div>
      )}

      {modo === "grade" ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left dark:bg-zinc-900">Pessoa</th>
                {dias.map((d) => (
                  <th key={d} className={`px-1 py-2 text-center ${ehHoje(d) ? "text-orange-600" : ""}`}>{rotuloDia(d)}</th>
                ))}
                <th className="px-3 py-2 text-right">Semana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {calc.porPessoa.map(({ p, nDias, nNoites, total, clt }) => (
                <tr key={p.id} className="bg-white dark:bg-zinc-950">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 dark:bg-zinc-950">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.nome}
                      {p.esporadico && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">free</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {TURNOS[p.turno]?.icone} {clt ? "CLT" : `${p.valor_dia ? `dia ${fmtNum(Number(p.valor_dia))}` : ""}${p.valor_dia && p.valor_noite ? " · " : ""}${p.valor_noite ? `noite ${fmtNum(Number(p.valor_noite))}` : ""}`}
                      {p.recebe_10 ? " · 10%" : ""}
                    </div>
                  </td>
                  {dias.map((d) => {
                    const kd = marcadas.has(chave(p.id, d, "dia"));
                    const kn = marcadas.has(chave(p.id, d, "noite"));
                    const mostraDia = p.turno !== "noite";
                    const mostraNoite = p.turno !== "dia";
                    return (
                      <td key={d} className={`px-1 py-1 text-center ${ehHoje(d) ? "bg-orange-50/60 dark:bg-orange-950/20" : ""}`}>
                        <div className="flex justify-center gap-0.5">
                          <button
                            onClick={() => toggle(p, d, "dia")}
                            title="Trabalhou de dia"
                            className={`h-8 w-8 rounded-md border text-base ${kd ? "border-yellow-500 bg-yellow-400 text-zinc-900" : "border-zinc-200 text-zinc-300 hover:border-yellow-400 dark:border-zinc-800"} ${mostraDia ? "" : "opacity-30"}`}
                          >
                            ☀️
                          </button>
                          <button
                            onClick={() => toggle(p, d, "noite")}
                            title="Trabalhou de noite"
                            className={`h-8 w-8 rounded-md border text-base ${kn ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-200 text-zinc-300 hover:border-indigo-400 dark:border-zinc-800"} ${mostraNoite ? "" : "opacity-30"}`}
                          >
                            🌙
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right">
                    <div className="text-xs text-zinc-500">{nDias}☀️ {nNoites}🌙</div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{brl(total)}</div>
                  </td>
                </tr>
              ))}
              <tr className="bg-indigo-50/60 dark:bg-indigo-950/30">
                <td className="sticky left-0 z-10 bg-indigo-50 px-3 py-2 font-semibold dark:bg-indigo-950">
                  🌙 10% da noite (R$)
                  <div className="text-[11px] font-normal text-zinc-500">digite o arrecadado</div>
                </td>
                {calc.porNoite.map((n) => (
                  <td key={n.data} className="px-1 py-2 text-center align-top">
                    <input
                      value={dez[n.data] ?? ""}
                      onChange={(e) => setDez((o) => ({ ...o, [n.data]: e.target.value }))}
                      onBlur={() => salvarDez(n.data)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={`${inputCls} w-[4.6rem] text-right font-semibold`}
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {n.presentes > 0 ? <>÷ {n.presentes} = <b>{fmtNum(n.unit)}</b></> : n.pool > 0 ? <span className="text-red-600">ninguém marcado</span> : "—"}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold">{brl(calc.totalPool)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Pessoa</th>
                <th className="px-3 py-3 text-center">Dias</th>
                <th className="px-3 py-3 text-center">Noites</th>
                <th className="px-3 py-3 text-right">Diárias</th>
                <th className="px-3 py-3 text-right">10%</th>
                <th className="px-4 py-3 text-right">Total a pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {calc.porPessoa
                .filter((x) => x.nDias + x.nNoites > 0)
                .sort((a, b) => b.total - a.total)
                .map(({ p, nDias, nNoites, diarias, dez10, total, clt }) => (
                  <tr key={p.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.nome}</div>
                      <div className="text-[11px] text-zinc-400">{clt ? "CLT (salário fixo — só o 10%)" : "Freelance"}{p.funcao ? ` · ${p.funcao}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-center">{nDias}</td>
                    <td className="px-3 py-2 text-center">{nNoites}</td>
                    <td className="px-3 py-2 text-right">{brl(diarias)}</td>
                    <td className="px-3 py-2 text-right">{brl(dez10)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">{brl(total)}</td>
                  </tr>
                ))}
              <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                <td className="px-4 py-3" colSpan={3}>Total da semana</td>
                <td className="px-3 py-3 text-right">{brl(calc.totalDiarias)}</td>
                <td className="px-3 py-3 text-right">{brl(calc.totalDez)}</td>
                <td className="px-4 py-3 text-right">{brl(calc.totalDiarias + calc.totalDez)}</td>
              </tr>
            </tbody>
          </table>
          <div className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
            10% arrecadado na semana: <b>{brl(calc.totalPool)}</b>
            {Math.abs(calc.totalPool - calc.totalDez) > 0.01 && (
              <span className="ml-2 text-amber-600">— {brl(calc.totalPool - calc.totalDez)} sem ninguém marcado pra receber.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
