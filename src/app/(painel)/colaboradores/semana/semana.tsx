"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl, rotuloDia, rotuloSemana, somarDias, deYmd, segundaDe, TURNOS, vinculoDoTurno } from "@/lib/equipe";
import { criarEsporadico, excluirDezPorCento, lancarPagamentosSemana, marcarPresenca, preencherEscalaFixa, salvarDezPorCento, salvarExtra, type Turno } from "./actions";

export type Pessoa = {
  id: string;
  nome: string;
  turno: "dia" | "noite" | "ambos" | "proprietario";
  vinculo: "clt" | "freelance";
  vinculo_noite: "clt" | "freelance" | null;
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
type Dez = { data: string; valor: number; pagar_em: string };
// Linha do painel de 10%: valor como texto (digitação) + em que semana é pago.
type DezLinha = { data: string; valor: string; pagar_em: string };

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

type Pago = { colaborador_id: string; valor: number; lancamento_id: string | null; desconto: number };

export function SemanaClient({
  segunda, dias, pessoas, presencasIniciais, dezIniciais, pagos, fiadoPor, extrasIniciais,
}: {
  segunda: string;
  dias: string[];
  pessoas: Pessoa[];
  presencasIniciais: Presenca[];
  dezIniciais: Dez[];
  pagos: Pago[];
  fiadoPor: Record<string, { valor: number; n: number }>;
  extrasIniciais: { colaborador_id: string; valor: number; motivo: string | null; turno: Turno }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Extra por pessoa na semana (valor digitado + motivo + turno em que conta).
  type ExtraSem = { valor: string; motivo: string; turno: Turno };
  const [extrasSem, setExtrasSem] = useState<Record<string, ExtraSem>>(() => {
    const o: Record<string, ExtraSem> = {};
    for (const e of extrasIniciais) o[e.colaborador_id] = { valor: Number(e.valor) ? fmtNum(Number(e.valor)) : "", motivo: e.motivo ?? "", turno: e.turno === "dia" ? "dia" : "noite" };
    return o;
  });
  // Turno padrão do extra: quem é só de dia → dia; os demais → noite.
  const turnoPadraoExtra = (p: Pessoa): Turno => (p.turno === "dia" ? "dia" : "noite");
  const extraDe = (p: Pessoa): ExtraSem => extrasSem[p.id] ?? { valor: "", motivo: "", turno: turnoPadraoExtra(p) };
  function salvarExtraDe(p: Pessoa, patch?: Partial<ExtraSem>) {
    const e = { ...extraDe(p), ...patch };
    const v = numBRtxt(e.valor);
    setExtrasSem((o) => ({ ...o, [p.id]: { ...e, valor: v ? fmtNum(v) : "" } }));
    start(async () => {
      const r = await salvarExtra(segunda, p.id, v, e.motivo, e.turno);
      if (r.erro) setErro(r.erro);
    });
  }
  const pagoDe = useMemo(() => new Map(pagos.map((p) => [p.colaborador_id, p])), [pagos]);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set()); // quem NÃO lançar agora
  const [descontar, setDescontar] = useState<Set<string>>(new Set()); // de quem descontar o fiado (opcional)
  const [jaPago, setJaPago] = useState(false);
  const [dataPag, setDataPag] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [formaPag, setFormaPag] = useState("Dinheiro");
  const [msg, setMsg] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(presencasIniciais.map((p) => chave(p.colaborador_id, p.data, p.turno))),
  );
  const [dez, setDez] = useState<DezLinha[]>(() =>
    dezIniciais.map((d) => ({ data: d.data, valor: Number(d.valor) ? fmtNum(Number(d.valor)) : "", pagar_em: d.pagar_em })),
  );
  const [novaNoite, setNovaNoite] = useState("");
  const [extras, setExtras] = useState<Set<string>>(new Set()); // esporádicos trazidos pra semana
  const [erro, setErro] = useState<string | null>(null);
  const [addAberto, setAddAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDia, setNovoDia] = useState("");
  const [novoNoite, setNovoNoite] = useState("");
  const [buscaExtra, setBuscaExtra] = useState("");
  const [modo, setModo] = useState<"grade" | "resumo">("grade");
  const [turnoFiltro, setTurnoFiltro] = useState<"todos" | "dia" | "noite">("todos");
  // Pessoas puxadas pro Resumo só pra receber um extra (ex.: CLT que fez algo a mais, sem contar como dia).
  const [soExtra, setSoExtra] = useState<Set<string>>(new Set());
  const [escolhendoExtra, setEscolhendoExtra] = useState("");
  const cabeNoFiltro = (p: Pessoa) =>
    turnoFiltro === "todos" || p.turno === "ambos" || p.turno === turnoFiltro;

  // Quem aparece na grade: fixos (não esporádicos, não proprietários) + esporádicos
  // que têm presença na semana ou foram adicionados agora.
  const naGrade = useMemo(() => {
    const comPresenca = new Set(presencasIniciais.map((p) => p.colaborador_id));
    for (const k of marcadas) comPresenca.add(k.split("|")[0]);
    for (const e of extrasIniciais) if (Number(e.valor) > 0) comPresenca.add(e.colaborador_id);
    return pessoas.filter(
      (p) => p.turno !== "proprietario" && (!p.esporadico || comPresenca.has(p.id) || extras.has(p.id) || soExtra.has(p.id)),
    );
  }, [pessoas, presencasIniciais, marcadas, extras, extrasIniciais, soExtra]);

  const foraDaGrade = useMemo(() => {
    const ids = new Set(naGrade.map((p) => p.id));
    return pessoas.filter((p) => !ids.has(p.id) && p.turno !== "proprietario");
  }, [pessoas, naGrade]);

  // Cálculo: cada noite de 10% é dividida entre quem trabalhou NAQUELA noite e
  // recebe 10% (proporcional ao peso — normalmente 1 pra todo mundo). Entram no
  // acerto desta semana as noites com pagar_em = esta segunda (em geral, a
  // semana passada). As diárias são só dos dias desta semana.
  const calc = useMemo(() => {
    const porNoite = dez.map((e) => {
      const pool = numBRtxt(e.valor);
      const presentes = pessoas.filter((p) => p.recebe_10 && marcadas.has(chave(p.id, e.data, "noite")));
      const pesoTotal = presentes.reduce((s, p) => s + (Number(p.peso_10) || 1), 0);
      const unit = pesoTotal > 0 ? pool / pesoTotal : 0;
      return { data: e.data, pagar_em: e.pagar_em, pool, presentes: presentes.length, pesoTotal, unit, nestaSemana: e.pagar_em === segunda };
    });
    const noitesPagas = porNoite.filter((n) => n.nestaSemana);
    const porPessoa = naGrade.map((p) => {
      let nDias = 0, nNoites = 0, dez10 = 0;
      for (const d of dias) {
        if (marcadas.has(chave(p.id, d, "dia"))) nDias++;
        if (marcadas.has(chave(p.id, d, "noite"))) nNoites++;
      }
      if (p.recebe_10) {
        for (const n of noitesPagas) {
          if (marcadas.has(chave(p.id, n.data, "noite"))) dez10 += n.unit * (Number(p.peso_10) || 1);
        }
      }
      // Carteira assinada = salário à parte (não entra diária); pode ser CLT de dia e free de noite.
      const cltDia = vinculoDoTurno(p, "dia") === "clt";
      const cltNoite = vinculoDoTurno(p, "noite") === "clt";
      const diariasDia = cltDia ? 0 : nDias * (Number(p.valor_dia) || 0);
      const diariasNoite = cltNoite ? 0 : nNoites * (Number(p.valor_noite) || 0);
      const diarias = diariasDia + diariasNoite;
      const clt = cltDia && cltNoite;
      const rotuloVinculo = cltDia && cltNoite ? "CLT (salário fixo — só o 10%)"
        : !cltDia && !cltNoite ? "Freelance"
        : cltDia ? "CLT de dia · free de noite" : "free de dia · CLT de noite";
      const extra = numBRtxt(extrasSem[p.id]?.valor ?? "");
      const extraMotivo = extrasSem[p.id]?.motivo ?? "";
      const extraTurno: Turno = extrasSem[p.id]?.turno ?? (p.turno === "dia" ? "dia" : "noite");
      const extraDia = extraTurno === "dia" ? extra : 0;
      const extraNoite = extraTurno === "noite" ? extra : 0;
      return { p, nDias, nNoites, diarias, diariasDia, diariasNoite, dez10, extra, extraMotivo, extraTurno, extraDia, extraNoite, total: diarias + dez10 + extra, clt, cltDia, cltNoite, rotuloVinculo };
    });
    const totalPool = noitesPagas.reduce((s, n) => s + n.pool, 0);
    const totalDiarias = porPessoa.reduce((s, x) => s + x.diarias, 0);
    const totalDez = porPessoa.reduce((s, x) => s + x.dez10, 0);
    const totalExtras = porPessoa.reduce((s, x) => s + x.extra, 0);
    // Gasto por turno: dia = diárias de dia + extras do dia; noite = diárias de noite + 10% + extras da noite.
    const turnoDia = {
      presencas: porPessoa.reduce((s, x) => s + x.nDias, 0),
      diarias: porPessoa.reduce((s, x) => s + x.diariasDia, 0),
      extras: porPessoa.reduce((s, x) => s + x.extraDia, 0),
    };
    const turnoNoite = {
      presencas: porPessoa.reduce((s, x) => s + x.nNoites, 0),
      diarias: porPessoa.reduce((s, x) => s + x.diariasNoite, 0),
      dez: totalDez,
      extras: porPessoa.reduce((s, x) => s + x.extraNoite, 0),
    };
    return { porNoite, noitesPagas, porPessoa, totalPool, totalDiarias, totalDez, totalExtras, turnoDia, turnoNoite };
  }, [dias, dez, naGrade, pessoas, marcadas, segunda, extrasSem]);

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

  function salvarDez(data: string, valorTxt: string, pagarEm: string) {
    const v = numBRtxt(valorTxt);
    setDez((lista) => lista.map((e) => (e.data === data ? { ...e, valor: v ? fmtNum(v) : "", pagar_em: pagarEm } : e)));
    start(async () => {
      const r = await salvarDezPorCento(data, v, pagarEm);
      if (r.erro) setErro(r.erro);
    });
  }
  function addNoite() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaNoite)) return;
    if (dez.some((e) => e.data === novaNoite)) { setErro("Essa noite já está na lista."); return; }
    const pagarEm = somarDias(segundaDe(novaNoite), 7);
    setDez((l) => [...l, { data: novaNoite, valor: "", pagar_em: pagarEm }].sort((a, b) => (a.data < b.data ? -1 : 1)));
    setNovaNoite("");
    start(async () => {
      const r = await salvarDezPorCento(novaNoite, 0, pagarEm);
      if (r.erro) setErro(r.erro);
      else router.refresh(); // carrega as presenças daquela noite se for de outra semana
    });
  }
  function removerNoite(data: string) {
    if (!window.confirm(`Apagar o 10% da noite ${rotuloDia(data)}?`)) return;
    setDez((l) => l.filter((e) => e.data !== data));
    start(async () => {
      const r = await excluirDezPorCento(data);
      if (r.erro) setErro(r.erro);
    });
  }

  function baixarCsv() {
    const linhas: string[][] = [
      ["Semana", rotuloSemana(segunda)],
      [],
      ["Nome", "Vínculo", "Dias", "Noites", "Valor dia", "Valor noite", "Diárias dia", "Diárias noite", "10%", "Extra", "Turno do extra", "Motivo extra", "Total"],
      ...calc.porPessoa.map(({ p, nDias, nNoites, diariasDia, diariasNoite, dez10, extra, extraTurno, extraMotivo, total, rotuloVinculo }) => [
        p.nome, rotuloVinculo, String(nDias), String(nNoites),
        fmtNum(Number(p.valor_dia) || 0), fmtNum(Number(p.valor_noite) || 0),
        fmtNum(diariasDia), fmtNum(diariasNoite), fmtNum(dez10), fmtNum(extra), extra > 0 ? extraTurno : "", extraMotivo, fmtNum(total),
      ]),
      [],
      ["Turno", "Presenças", "Diárias", "10%", "Extras", "Total"],
      ["Dia", String(calc.turnoDia.presencas), fmtNum(calc.turnoDia.diarias), "0,00", fmtNum(calc.turnoDia.extras), fmtNum(calc.turnoDia.diarias + calc.turnoDia.extras)],
      ["Noite", String(calc.turnoNoite.presencas), fmtNum(calc.turnoNoite.diarias), fmtNum(calc.turnoNoite.dez), fmtNum(calc.turnoNoite.extras), fmtNum(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)],
      [],
      ["Noite (10% pago nesta semana)", "10% arrecadado", "Presentes", "Cada um"],
      ...calc.noitesPagas.map((n) => [rotuloDia(n.data), fmtNum(n.pool), String(n.presentes), fmtNum(n.unit)]),
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

  // Quem entra no lançamento: tem valor, ainda não foi lançado e não foi desmarcado.
  const aLancar = calc.porPessoa.filter((x) => x.total > 0.005 && !pagoDe.has(x.p.id) && !desmarcados.has(x.p.id));
  const totalALancar = aLancar.reduce((s, x) => s + x.total, 0);
  // Fiado que será descontado (só até o valor da pessoa; a conta continua cheia).
  const descontoDe = (id: string, total: number) =>
    descontar.has(id) ? Math.min(fiadoPor[id]?.valor ?? 0, total) : 0;
  const totalDesconto = aLancar.reduce((s, x) => s + descontoDe(x.p.id, x.total), 0);
  const comFiado = aLancar.filter((x) => (fiadoPor[x.p.id]?.valor ?? 0) > 0.005);

  function lancar() {
    if (!aLancar.length) return;
    const ok = window.confirm(
      `Lançar ${aLancar.length} pagamento(s) somando ${brl(totalALancar)} no Contas a pagar (CMO Eventual / Diaristas)${jaPago ? ", já marcados como pagos" : ""}?` +
        (totalDesconto > 0 ? `\n\nFiado descontado: ${brl(totalDesconto)} (sai em mãos ${brl(totalALancar - totalDesconto)}). As compras internas dessas pessoas serão marcadas como pagas.` : ""),
    );
    if (!ok) return;
    start(async () => {
      const r = await lancarPagamentosSemana(
        segunda,
        aLancar.map((x) => ({
          colaboradorId: x.p.id,
          nome: x.p.nome,
          valor: Math.round(x.total * 100) / 100,
          detalhe: [
            x.nDias ? `${x.nDias} dia${x.nDias > 1 ? "s" : ""}` : "",
            x.nNoites ? `${x.nNoites} noite${x.nNoites > 1 ? "s" : ""}` : "",
            x.dez10 > 0.005 ? `10% ${fmtNum(x.dez10)}` : "",
            x.extra > 0.005 ? `extra ${x.extraTurno === "dia" ? "dia" : "noite"} ${fmtNum(x.extra)}${x.extraMotivo ? ` ${x.extraMotivo}` : ""}` : "",
          ].filter(Boolean).join(", "),
          descontarFiado: descontar.has(x.p.id),
        })),
        { jaPago, data: dataPag, forma: formaPag || null },
      );
      if (r.erro) setErro(r.erro);
      else {
        setMsg(`${r.n} lançamento(s) criado(s) no Contas a pagar${r.totalDesc ? `, fiado descontado ${brl(r.totalDesc)}` : ""}.`);
        setDescontar(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Semana e 10%</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Marque quem trabalhou em cada dia (☀️ dia / 🌙 noite). O 10% de cada noite é dividido por quem trabalhou naquela noite e entra no acerto da semana seguinte.
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
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700" title="Filtrar por turno">
          {([["todos", "Todos"], ["dia", "☀️ Dia"], ["noite", "🌙 Noite"]] as const).map(([k, rot]) => (
            <button key={k} onClick={() => setTurnoFiltro(k)} className={`px-3 py-1.5 ${turnoFiltro === k ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : ""}`}>
              {rot}
            </button>
          ))}
        </div>
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

      {/* 10% da noite: painel separado. Cada noite tem a data em que foi gerada e a
          semana em que é paga (padrão: a seguinte). A divisão usa quem trabalhou NAQUELA noite. */}
      <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">🌙 10% da noite</p>
            <p className="text-xs text-zinc-500">
              Digite o arrecadado de cada noite. Entra no acerto desta semana ({rotuloSemana(segunda)}) o que está marcado como <b>paga nesta semana</b> — normalmente as noites da semana passada.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={novaNoite} onChange={(e) => setNovaNoite(e.target.value)} className={inputCls} />
            <button onClick={addNoite} disabled={!novaNoite} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
              + Adicionar noite
            </button>
          </div>
        </div>
        {dez.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma noite lançada. Adicione a data da noite e digite o valor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-1">Noite</th>
                  <th className="px-2 py-1 text-right">10% arrecadado</th>
                  <th className="px-2 py-1">Paga em</th>
                  <th className="px-2 py-1 text-center">Trabalharam</th>
                  <th className="px-2 py-1 text-right">Cada um</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {calc.porNoite.map((n, i) => {
                  const e = dez[i];
                  const opcoesPagar = Array.from(new Set([somarDias(segundaDe(n.data), 7), segunda, somarDias(segunda, 7), n.pagar_em])).sort();
                  return (
                    <tr key={n.data} className={n.nestaSemana ? "bg-white dark:bg-zinc-950" : "opacity-70"}>
                      <td className="px-2 py-1 font-medium whitespace-nowrap">
                        {rotuloDia(n.data)}
                        {(n.data < dias[0] || n.data > dias[6]) && <span className="ml-1 text-[10px] text-zinc-400">(outra semana)</span>}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          value={e.valor}
                          onChange={(ev) => setDez((l) => l.map((x) => (x.data === n.data ? { ...x, valor: ev.target.value } : x)))}
                          onBlur={(ev) => salvarDez(n.data, ev.target.value, e.pagar_em)}
                          onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                          inputMode="decimal"
                          placeholder="0,00"
                          className={`${inputCls} w-28 text-right font-semibold`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={e.pagar_em}
                          onChange={(ev) => salvarDez(n.data, e.valor, ev.target.value)}
                          className={`${inputCls} ${n.nestaSemana ? "border-indigo-400 font-medium" : ""}`}
                        >
                          {opcoesPagar.map((s) => (
                            <option key={s} value={s}>
                              semana {rotuloSemana(s)}{s === segunda ? " (esta)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        {n.presentes > 0 ? `${n.presentes} 🌙` : n.pool > 0 ? <span className="text-red-600">ninguém marcado nessa noite</span> : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold">{n.presentes > 0 ? brl(n.unit) : "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <button onClick={() => removerNoite(n.data)} className="text-zinc-400 hover:text-red-600" title="Apagar">🗑</button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-indigo-200 font-semibold dark:border-indigo-900">
                  <td className="px-2 py-1" colSpan={1}>Entra nesta semana</td>
                  <td className="px-2 py-1 text-right">{brl(calc.totalPool)}</td>
                  <td className="px-2 py-1 text-xs font-normal text-zinc-500" colSpan={4}>
                    {calc.noitesPagas.length} noite{calc.noitesPagas.length === 1 ? "" : "s"} · quem trabalhou nelas recebe no acerto desta semana, mesmo sem trabalhar agora
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

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
              {calc.porPessoa.filter((x) => cabeNoFiltro(x.p)).map(({ p, nDias, nNoites, total, clt, cltDia, cltNoite }) => (
                <tr key={p.id} className="bg-white dark:bg-zinc-950">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 dark:bg-zinc-950">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.nome}
                      {p.esporadico && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">free</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {TURNOS[p.turno]?.icone}{" "}
                      {clt
                        ? "CLT"
                        : [
                            p.turno !== "noite" ? (cltDia ? "dia CLT" : p.valor_dia ? `dia ${fmtNum(Number(p.valor_dia))}` : "") : "",
                            p.turno !== "dia" ? (cltNoite ? "noite CLT" : p.valor_noite ? `noite ${fmtNum(Number(p.valor_noite))}` : "") : "",
                          ].filter(Boolean).join(" · ")}
                      {p.recebe_10 ? " · 10%" : ""}
                    </div>
                  </td>
                  {dias.map((d) => {
                    const kd = marcadas.has(chave(p.id, d, "dia"));
                    const kn = marcadas.has(chave(p.id, d, "noite"));
                    const mostraDia = p.turno !== "noite" && turnoFiltro !== "noite";
                    const mostraNoite = p.turno !== "dia" && turnoFiltro !== "dia";
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
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          {/* Gasto por turno da semana */}
          <div className="grid gap-3 border-b border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className={`rounded-xl border bg-white p-3 dark:bg-zinc-950 ${turnoFiltro === "dia" ? "border-yellow-500" : "border-zinc-200 dark:border-zinc-800"}`}>
              <div className="text-xs font-bold uppercase text-zinc-500">☀️ Dia</div>
              <div className="text-lg font-semibold">{brl(calc.turnoDia.diarias + calc.turnoDia.extras)}</div>
              <div className="text-xs text-zinc-500">{calc.turnoDia.presencas} presença{calc.turnoDia.presencas === 1 ? "" : "s"} · diárias {brl(calc.turnoDia.diarias)}{calc.turnoDia.extras > 0 ? ` + extras ${brl(calc.turnoDia.extras)}` : ""} (CLT não entra)</div>
            </div>
            <div className={`rounded-xl border bg-white p-3 dark:bg-zinc-950 ${turnoFiltro === "noite" ? "border-indigo-500" : "border-zinc-200 dark:border-zinc-800"}`}>
              <div className="text-xs font-bold uppercase text-zinc-500">🌙 Noite</div>
              <div className="text-lg font-semibold">{brl(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)}</div>
              <div className="text-xs text-zinc-500">{calc.turnoNoite.presencas} presença{calc.turnoNoite.presencas === 1 ? "" : "s"} · diárias {brl(calc.turnoNoite.diarias)} + 10% {brl(calc.turnoNoite.dez)}{calc.turnoNoite.extras > 0 ? ` + extras ${brl(calc.turnoNoite.extras)}` : ""}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-xs font-bold uppercase text-zinc-500">Semana</div>
              <div className="text-lg font-semibold">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras)}</div>
              <div className="text-xs text-zinc-500">diárias {brl(calc.totalDiarias)} + 10% {brl(calc.totalDez)}{calc.totalExtras > 0 ? ` + extras ${brl(calc.totalExtras)}` : ""}</div>
            </div>
          </div>
          {turnoFiltro === "todos" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
              <span className="text-zinc-500">Dar um extra pra alguém que não está na lista (ex.: carteira assinada que fez algo a mais — não conta como dia):</span>
              <select
                value={escolhendoExtra}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    const pes = pessoas.find((x) => x.id === id);
                    setSoExtra((s) => new Set(s).add(id));
                    setExtrasSem((o) => ({ ...o, [id]: o[id] ?? { valor: "", motivo: "", turno: pes ? turnoPadraoExtra(pes) : "noite" } }));
                  }
                  setEscolhendoExtra("");
                }}
                className={inputCls}
              >
                <option value="">+ escolher pessoa…</option>
                {pessoas
                  .filter((p) => p.turno !== "proprietario" && !soExtra.has(p.id))
                  .filter((p) => { const x = calc.porPessoa.find((y) => y.p.id === p.id); return !x || (x.nDias + x.nNoites === 0 && x.dez10 < 0.005 && x.extra < 0.005 && !pagoDe.has(p.id)); })
                  .map((p) => <option key={p.id} value={p.id}>{p.nome}{vinculoDoTurno(p, "dia") === "clt" || vinculoDoTurno(p, "noite") === "clt" ? " (CLT)" : ""}</option>)}
              </select>
            </div>
          )}
          {turnoFiltro !== "todos" && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Mostrando só o turno {turnoFiltro === "dia" ? "☀️ DIA" : "🌙 NOITE"}: os valores abaixo são só desse turno. Pra lançar o pagamento, volte em <b>Todos</b>.
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                {turnoFiltro === "todos" && <th className="px-3 py-3 text-center" title="Entra no lançamento">💸</th>}
                <th className="px-4 py-3">Pessoa</th>
                {turnoFiltro !== "noite" && <th className="px-3 py-3 text-center">Dias</th>}
                {turnoFiltro !== "dia" && <th className="px-3 py-3 text-center">Noites</th>}
                <th className="px-3 py-3 text-right">Diárias</th>
                {turnoFiltro !== "dia" && <th className="px-3 py-3 text-right">10%</th>}
                <th className="px-3 py-3 text-right" title="Algo que fez a mais nesta semana (conta no turno escolhido)">Extra</th>
                <th className="px-4 py-3 text-right">Total a pagar</th>
                {turnoFiltro === "todos" && <th className="px-3 py-3 text-right" title="Compras internas em aberto (opcional descontar)">Fiado</th>}
                {turnoFiltro === "todos" && <th className="px-4 py-3 text-right">Em mãos</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {calc.porPessoa
                .filter((x) => cabeNoFiltro(x.p))
                .map((x) => ({
                  ...x,
                  // No filtro por turno, mostra só a parte daquele turno.
                  diariasM: turnoFiltro === "dia" ? x.diariasDia : turnoFiltro === "noite" ? x.diariasNoite : x.diarias,
                  dezM: turnoFiltro === "dia" ? 0 : x.dez10,
                  extraM: turnoFiltro === "dia" ? x.extraDia : turnoFiltro === "noite" ? x.extraNoite : x.extra,
                  presM: turnoFiltro === "dia" ? x.nDias : turnoFiltro === "noite" ? x.nNoites : x.nDias + x.nNoites,
                }))
                .map((x) => ({ ...x, totalM: x.diariasM + x.dezM + x.extraM }))
                .filter((x) => x.presM > 0 || x.dezM > 0.005 || x.extraM > 0.005 || (turnoFiltro === "todos" && (pagoDe.has(x.p.id) || soExtra.has(x.p.id) || !!extrasSem[x.p.id]?.motivo)))
                .sort((a, b) => b.totalM - a.totalM)
                .map(({ p, nDias, nNoites, diariasM, dezM, extraM, totalM, total, rotuloVinculo }) => (
                  <tr key={p.id} className={`bg-white dark:bg-zinc-950 ${pagoDe.has(p.id) ? "opacity-70" : ""}`}>
                    {turnoFiltro === "todos" && <td className="px-3 py-2 text-center">
                      {pagoDe.has(p.id) ? (
                        <span className="text-xs text-green-600" title={`Lançado: ${brl(Number(pagoDe.get(p.id)!.valor))}`}>✓</span>
                      ) : total > 0.005 ? (
                        <input
                          type="checkbox"
                          checked={!desmarcados.has(p.id)}
                          onChange={(e) => setDesmarcados((s) => { const n = new Set(s); if (e.target.checked) n.delete(p.id); else n.add(p.id); return n; })}
                        />
                      ) : null}
                    </td>}
                    <td className="px-4 py-2">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.nome}</div>
                      <div className="text-[11px] text-zinc-400">
                        {rotuloVinculo}{p.funcao ? ` · ${p.funcao}` : ""}
                        {pagoDe.has(p.id) && <span className="ml-1 text-green-600">· lançado no contas a pagar ({brl(Number(pagoDe.get(p.id)!.valor))})</span>}
                      </div>
                    </td>
                    {turnoFiltro !== "noite" && <td className="px-3 py-2 text-center">{nDias}</td>}
                    {turnoFiltro !== "dia" && <td className="px-3 py-2 text-center">{nNoites}</td>}
                    <td className="px-3 py-2 text-right">{brl(diariasM)}</td>
                    {turnoFiltro !== "dia" && <td className="px-3 py-2 text-right">{brl(dezM)}</td>}
                    <td className="px-3 py-2 text-right">
                      {turnoFiltro !== "todos" ? (
                        <span className={extraM > 0 ? "" : "text-zinc-300"}>{extraM > 0 ? brl(extraM) : "—"}</span>
                      ) : pagoDe.has(p.id) ? (
                        <span className="text-xs text-zinc-500">{extrasSem[p.id]?.valor ? `${extrasSem[p.id].turno === "dia" ? "☀️" : "🌙"} ${extrasSem[p.id].valor}${extrasSem[p.id].motivo ? ` · ${extrasSem[p.id].motivo}` : ""}` : "—"}</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1">
                            {(extraDe(p).valor || extraDe(p).motivo) && (
                              <select
                                value={extraDe(p).turno}
                                onChange={(e) => salvarExtraDe(p, { turno: e.target.value as Turno })}
                                title="Em que turno esse extra conta"
                                className={`${inputCls} px-1 py-1 text-xs`}
                              >
                                <option value="dia">☀️ dia</option>
                                <option value="noite">🌙 noite</option>
                              </select>
                            )}
                            <input
                              value={extraDe(p).valor}
                              onChange={(e) => setExtrasSem((o) => ({ ...o, [p.id]: { ...extraDe(p), valor: e.target.value } }))}
                              onBlur={() => salvarExtraDe(p)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              inputMode="decimal"
                              placeholder="0,00"
                              className={`${inputCls} w-20 text-right`}
                            />
                          </div>
                          {(extraDe(p).valor || extraDe(p).motivo) && (
                            <input
                              value={extraDe(p).motivo}
                              onChange={(e) => setExtrasSem((o) => ({ ...o, [p.id]: { ...extraDe(p), motivo: e.target.value } }))}
                              onBlur={() => salvarExtraDe(p)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              placeholder="motivo (ex.: hora extra)"
                              className={`${inputCls} w-40 px-1 py-0.5 text-[11px]`}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">{brl(totalM)}</td>
                    {turnoFiltro === "todos" && <td className="px-3 py-2 text-right whitespace-nowrap">
                      {pagoDe.has(p.id) ? (
                        Number(pagoDe.get(p.id)!.desconto) > 0 ? <span className="text-xs text-zinc-500">− {brl(Number(pagoDe.get(p.id)!.desconto))}</span> : <span className="text-zinc-300">—</span>
                      ) : (fiadoPor[p.id]?.valor ?? 0) > 0.005 ? (
                        <label className="flex cursor-pointer items-center justify-end gap-1 text-xs text-red-600" title={`${fiadoPor[p.id].n} compra(s) em aberto — marque pra descontar no acerto`}>
                          <input
                            type="checkbox"
                            checked={descontar.has(p.id)}
                            onChange={(e) => setDescontar((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                          />
                          deve {brl(fiadoPor[p.id].valor)}
                        </label>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>}
                    {turnoFiltro === "todos" && <td className="px-4 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                      {pagoDe.has(p.id)
                        ? brl(Number(pagoDe.get(p.id)!.valor) - Number(pagoDe.get(p.id)!.desconto || 0))
                        : brl(total - descontoDe(p.id, total))}
                    </td>}
                  </tr>
                ))}
              {turnoFiltro === "todos" ? (
                <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                  <td className="px-4 py-3" colSpan={4}>Total da semana</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalDiarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalDez)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalExtras)}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras)}</td>
                  <td className="px-3 py-3 text-right text-red-600">{totalDesconto > 0 ? `− ${brl(totalDesconto)}` : ""}</td>
                  <td className="px-4 py-3 text-right text-green-700 dark:text-green-400">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras - totalDesconto)}</td>
                </tr>
              ) : turnoFiltro === "dia" ? (
                <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                  <td className="px-4 py-3" colSpan={2}>Total do turno ☀️ Dia</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoDia.diarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoDia.extras)}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.turnoDia.diarias + calc.turnoDia.extras)}</td>
                </tr>
              ) : (
                <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                  <td className="px-4 py-3" colSpan={2}>Total do turno 🌙 Noite</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.diarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.dez)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.extras)}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
            10% que entra neste acerto: <b>{brl(calc.totalPool)}</b> ({calc.noitesPagas.map((n) => rotuloDia(n.data)).join(", ") || "nenhuma noite"})
            {Math.abs(calc.totalPool - calc.totalDez) > 0.01 && (
              <span className="ml-2 text-amber-600">— {brl(calc.totalPool - calc.totalDez)} sem ninguém marcado pra receber.</span>
            )}
          </div>

          {/* Pagar → Contas a pagar (CMO Eventual / Diaristas) */}
          {turnoFiltro === "todos" && <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-orange-50/60 p-3 text-sm dark:border-zinc-800 dark:bg-orange-950/20">
            <label className="flex items-center gap-1">
              Data
              <input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} className={inputCls} />
            </label>
            <select value={formaPag} onChange={(e) => setFormaPag(e.target.value)} className={inputCls}>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Pix">Pix</option>
              <option value="Transferência">Transferência</option>
              <option value="">(sem forma)</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} /> já paguei (entra como pago)
            </label>
            <button
              onClick={lancar}
              disabled={pending || aLancar.length === 0}
              className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-40"
            >
              💸 Lançar {aLancar.length} pagamento{aLancar.length === 1 ? "" : "s"} · {brl(totalALancar)} no Contas a pagar
            </button>
            <span className="text-xs text-zinc-500">categoria: CMO Eventual / Diaristas · a conta entra com o valor cheio; o fiado só abate o que sai em mãos</span>
            {comFiado.length > 0 && (
              <button
                type="button"
                onClick={() => setDescontar((s) => (s.size >= comFiado.length ? new Set() : new Set(comFiado.map((x) => x.p.id))))}
                className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                {descontar.size >= comFiado.length ? "não descontar fiado de ninguém" : `descontar fiado de todos (${comFiado.length})`}
              </button>
            )}
            {msg && <span className="text-xs text-green-700">{msg} <Link href="/financeiro/contas" className="underline">ver</Link></span>}
          </div>}
        </div>
      )}
    </div>
  );
}
