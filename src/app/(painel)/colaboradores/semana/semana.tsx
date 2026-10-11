"use client";

import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl, rotuloDia, rotuloSemana, somarDias, deYmd, segundaDe, vinculoDoTurno } from "@/lib/equipe";
import { criarEsporadico, excluirAdiantamento, excluirDezPorCento, lancarComplementoSemana, lancarPagamentosSemana, marcarPresenca, preencherEscalaFixa, registrarAdiantamento, salvarDezPorCento, salvarExtra, type Turno } from "./actions";

export type Pessoa = {
  id: string;
  nome: string;
  turno: "dia" | "noite" | "ambos" | "proprietario";
  vinculo: "clt" | "freelance";
  vinculo_noite: "clt" | "freelance" | null;
  bate_ponto?: boolean;
  funcao: string | null;
  valor_dia: number | null;
  valor_noite: number | null;
  valor_free?: number | null;    // CLT trabalhando fora da escala (free)
  dias_dia?: number[] | null;    // escala (0=dom): pra CLT, dia fora daqui = free
  dias_noite?: number[] | null;
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

/** Dia fora da escala da pessoa no turno (sem escala cadastrada = nunca é "fora"). */
function foraDaEscala(p: Pessoa, turno: Turno, dow: number) {
  const escala = (turno === "dia" ? p.dias_dia : p.dias_noite) ?? [];
  return escala.length > 0 && !escala.includes(dow);
}

const inputCls =
  "rounded-controle border border-borda-forte bg-white px-2 py-1 text-sm text-texto focus:border-orange-500 dark:border-borda-forte dark:bg-zinc-950 dark:text-zinc-100";

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
// Adiantamento em aberto: dinheiro dado antes do acerto, descontado na próxima semana lançada.
type Adiantamento = { id: string; colaborador_id: string; nome: string; valor: number; data: string; motivo: string | null };

export function SemanaClient({
  segunda, dias, pessoas, presencasIniciais, dezIniciais, pagos, fiadoPor, extrasIniciais, adiantamentos, inativos10 = [], batidasPonto = [], pontoSemPessoa = [],
}: {
  /** Batidas do relógio de ponto da semana (migration 0221). */
  batidasPonto?: { colaborador_id: string; data: string; turno: Turno; hora: string }[];
  /** Batidas sem colaborador ligado (CPF não cadastrado). */
  pontoSemPessoa?: { nome: string | null; cpf: string; n: number }[];
  /** Desativados que trabalharam nas noites de 10%: entram só na divisão. */
  inativos10?: { id: string; peso_10: number | null }[];
  segunda: string;
  dias: string[];
  pessoas: Pessoa[];
  presencasIniciais: Presenca[];
  dezIniciais: Dez[];
  pagos: Pago[];
  fiadoPor: Record<string, { valor: number; n: number }>;
  extrasIniciais: { colaborador_id: string; valor: number; motivo: string | null; turno: Turno; desconto?: number; desconto_motivo?: string | null }[];
  adiantamentos: Adiantamento[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Adiantamentos em aberto por pessoa. Diferente do fiado, saem no acerto por
  // padrão (a caixinha já vem marcada) — dar adiantamento é exatamente isso.
  const adiantPor = useMemo(() => {
    const o: Record<string, { valor: number; n: number }> = {};
    for (const a of adiantamentos) {
      const x = (o[a.colaborador_id] ??= { valor: 0, n: 0 });
      x.valor = Math.round((x.valor + Number(a.valor)) * 100) / 100;
      x.n++;
    }
    return o;
  }, [adiantamentos]);
  const [descontarAdiant, setDescontarAdiant] = useState<Set<string>>(() => new Set(adiantamentos.map((a) => a.colaborador_id)));
  const [adiantAberto, setAdiantAberto] = useState(false);
  const [adiantPessoa, setAdiantPessoa] = useState("");
  const [adiantValor, setAdiantValor] = useState("");
  const [adiantData, setAdiantData] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [adiantMotivo, setAdiantMotivo] = useState("");
  function registrarAdiant() {
    const p = pessoas.find((x) => x.id === adiantPessoa);
    const v = numBRtxt(adiantValor);
    if (!p || !(v > 0)) { setErro("Escolha a pessoa e informe o valor do adiantamento."); return; }
    start(async () => {
      const r = await registrarAdiantamento(p.id, p.nome, v, adiantData, adiantMotivo);
      if (r.erro) { setErro(r.erro); return; }
      setDescontarAdiant((s) => new Set(s).add(p.id));
      setAdiantValor(""); setAdiantMotivo("");
      setMsg(`✓ Adiantamento de ${brl(v)} registrado pra ${p.nome}. Sai no próximo acerto.`);
      router.refresh();
    });
  }
  // Extra e desconto por pessoa na semana (valor + motivo; extra tem turno).
  type ExtraSem = { valor: string; motivo: string; turno: Turno; desconto: string; descMotivo: string };
  const [extrasSem, setExtrasSem] = useState<Record<string, ExtraSem>>(() => {
    const o: Record<string, ExtraSem> = {};
    for (const e of extrasIniciais)
      o[e.colaborador_id] = {
        valor: Number(e.valor) ? fmtNum(Number(e.valor)) : "",
        motivo: e.motivo ?? "",
        turno: e.turno === "dia" ? "dia" : "noite",
        desconto: Number(e.desconto) ? fmtNum(Number(e.desconto)) : "",
        descMotivo: e.desconto_motivo ?? "",
      };
    return o;
  });
  // Turno padrão do extra: quem é só de dia → dia; os demais → noite.
  const turnoPadraoExtra = (p: Pessoa): Turno => (p.turno === "dia" ? "dia" : "noite");
  const extraDe = (p: Pessoa): ExtraSem => extrasSem[p.id] ?? { valor: "", motivo: "", turno: turnoPadraoExtra(p), desconto: "", descMotivo: "" };
  function salvarExtraDe(p: Pessoa, patch?: Partial<ExtraSem>) {
    const e = { ...extraDe(p), ...patch };
    const v = numBRtxt(e.valor);
    const d = numBRtxt(e.desconto);
    setExtrasSem((o) => ({ ...o, [p.id]: { ...e, valor: v ? fmtNum(v) : "", desconto: d ? fmtNum(d) : "" } }));
    start(async () => {
      const r = await salvarExtra(segunda, p.id, v, e.motivo, e.turno, d, e.descMotivo);
      if (r.erro) setErro(r.erro);
    });
  }
  // Soma por pessoa (pode ter o lançamento da semana + complementos).
  const pagoDe = useMemo(() => {
    const m = new Map<string, { valor: number; desconto: number; n: number }>();
    for (const p of pagos) {
      const a = m.get(p.colaborador_id) ?? { valor: 0, desconto: 0, n: 0 };
      a.valor = Math.round((a.valor + Number(p.valor)) * 100) / 100;
      a.desconto = Math.round((a.desconto + Number(p.desconto || 0)) * 100) / 100;
      a.n++;
      m.set(p.colaborador_id, a);
    }
    return m;
  }, [pagos]);
  // Esqueceu algo depois de lançar: lança só a diferença.
  async function lancarDiferenca(p: Pessoa, diferenca: number) {
    const ex = extrasSem[p.id];
    const detalhe = ex?.motivo ? `extra ${ex.motivo}` : "valor esquecido";
    if (!await confirmar(`Lançar mais ${brl(diferenca)} pra ${p.nome} (semana ${rotuloSemana(segunda)}) no Contas a pagar${jaPago ? ", já marcado como pago" : ""}?`)) return;
    start(async () => {
      const r = await lancarComplementoSemana(segunda, p.id, p.nome, diferenca, detalhe, { jaPago, data: dataPag, forma: formaPag || null });
      setMsg("erro" in r && r.erro ? r.erro : `✓ Diferença de ${brl(diferenca)} lançada pra ${p.nome}.`);
      router.refresh();
    });
  }
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set()); // quem NÃO lançar agora
  const [descontar, setDescontar] = useState<Set<string>>(new Set()); // de quem descontar o fiado (opcional)
  // Quanto do fiado descontar (texto digitado); sem nada digitado = tudo que couber.
  const [descontarValor, setDescontarValor] = useState<Record<string, string>>({});
  const [jaPago, setJaPago] = useState(false);
  const [dataPag, setDataPag] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [formaPag, setFormaPag] = useState("Dinheiro");
  const [msg, setMsg] = useState<string | null>(null);
  const horasPonto = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of batidasPonto) {
      const k = `${b.colaborador_id}|${b.data}|${b.turno}`;
      const a = m.get(k) ?? [];
      a.push(b.hora);
      m.set(k, a);
    }
    for (const a of m.values()) a.sort((x, y) => (x < "05:00" ? "24" + x : x).localeCompare(y < "05:00" ? "24" + y : y));
    return m;
  }, [batidasPonto]);
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
      const presentes = [
        ...pessoas.filter((p) => p.recebe_10),
        ...inativos10, // desativados depois: a parte deles já foi paga, não sobra pros outros
      ].filter((p) => marcadas.has(chave(p.id, e.data, "noite")));
      const pesoTotal = presentes.reduce((s, p) => s + (Number(p.peso_10) || 1), 0);
      const unit = pesoTotal > 0 ? pool / pesoTotal : 0;
      return { data: e.data, pagar_em: e.pagar_em, pool, presentes: presentes.length, pesoTotal, unit, nestaSemana: e.pagar_em === segunda };
    });
    const noitesPagas = porNoite.filter((n) => n.nestaSemana);
    const porPessoa = naGrade.map((p) => {
      let nDias = 0, nNoites = 0, dez10 = 0, freeDia = 0, freeNoite = 0;
      for (const d of dias) {
        const dow = deYmd(d).getDay();
        if (marcadas.has(chave(p.id, d, "dia"))) { nDias++; if (foraDaEscala(p, "dia", dow)) freeDia++; }
        if (marcadas.has(chave(p.id, d, "noite"))) { nNoites++; if (foraDaEscala(p, "noite", dow)) freeNoite++; }
      }
      if (p.recebe_10) {
        for (const n of noitesPagas) {
          if (marcadas.has(chave(p.id, n.data, "noite"))) dez10 += n.unit * (Number(p.peso_10) || 1);
        }
      }
      // Carteira assinada = salário à parte (não entra diária); pode ser CLT de dia e free de noite.
      const cltDia = vinculoDoTurno(p, "dia") === "clt";
      const cltNoite = vinculoDoTurno(p, "noite") === "clt";
      // CLT: só o "free" (dia fora da escala) é pago, pelo valor do free.
      const nFree = (cltDia ? freeDia : 0) + (cltNoite ? freeNoite : 0);
      const diariasDia = cltDia ? freeDia * (Number(p.valor_free) || 0) : nDias * (Number(p.valor_dia) || 0);
      const diariasNoite = cltNoite ? freeNoite * (Number(p.valor_free) || 0) : nNoites * (Number(p.valor_noite) || 0);
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
      // Desconto (atraso, falta…) abate do total; nunca fica negativo.
      const descontoSem = numBRtxt(extrasSem[p.id]?.desconto ?? "");
      const descontoMotivo = extrasSem[p.id]?.descMotivo ?? "";
      const bruto = diarias + dez10 + extra;
      const total = Math.max(0, bruto - descontoSem);
      return { p, nDias, nNoites, nFree, diarias, diariasDia, diariasNoite, dez10, extra, extraMotivo, extraTurno, extraDia, extraNoite, descontoSem: Math.min(descontoSem, bruto), descontoMotivo, total, clt, cltDia, cltNoite, rotuloVinculo };
    });
    const totalPool = noitesPagas.reduce((s, n) => s + n.pool, 0);
    const totalDiarias = porPessoa.reduce((s, x) => s + x.diarias, 0);
    const totalDez = porPessoa.reduce((s, x) => s + x.dez10, 0);
    const totalExtras = porPessoa.reduce((s, x) => s + x.extra, 0);
    const totalDescontosSem = porPessoa.reduce((s, x) => s + x.descontoSem, 0);
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
    return { porNoite, noitesPagas, porPessoa, totalPool, totalDiarias, totalDez, totalExtras, totalDescontosSem, turnoDia, turnoNoite };
  }, [dias, dez, naGrade, pessoas, marcadas, segunda, extrasSem, inativos10]);

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
  async function removerNoite(data: string) {
    if (!await confirmar(`Apagar o 10% da noite ${rotuloDia(data)}?`)) return;
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
      ["Nome", "Vínculo", "Dias", "Noites", "Valor dia", "Valor noite", "Diárias dia", "Diárias noite", "10%", "Extra", "Turno do extra", "Motivo extra", "Desconto", "Motivo desconto", "Total"],
      ...calc.porPessoa.map(({ p, nDias, nNoites, diariasDia, diariasNoite, dez10, extra, extraTurno, extraMotivo, descontoSem, descontoMotivo, total, rotuloVinculo }) => [
        p.nome, rotuloVinculo, String(nDias), String(nNoites),
        fmtNum(Number(p.valor_dia) || 0), fmtNum(Number(p.valor_noite) || 0),
        fmtNum(diariasDia), fmtNum(diariasNoite), fmtNum(dez10), fmtNum(extra), extra > 0 ? extraTurno : "", extraMotivo, fmtNum(descontoSem), descontoMotivo, fmtNum(total),
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
  // O que sai do valor em mãos (a conta continua cheia): o adiantamento primeiro,
  // e o fiado, se marcado, no que sobrar. Nunca passa do valor da pessoa.
  const adiantDe = (id: string, total: number) => (descontarAdiant.has(id) ? Math.min(adiantPor[id]?.valor ?? 0, total) : 0);
  // Fiado pedido: o que foi digitado, ou tudo (Infinity) se o campo está como veio.
  const fiadoPedido = (id: string) => (descontarValor[id] === undefined ? Infinity : numBRtxt(descontarValor[id]));
  const fiadoDe = (id: string, total: number, a: number) =>
    descontar.has(id) ? Math.max(0, Math.min(fiadoPor[id]?.valor ?? 0, fiadoPedido(id), total - a)) : 0;
  const descontoDe = (id: string, total: number) => {
    const a = adiantDe(id, total);
    return a + fiadoDe(id, total, a);
  };
  const totalDesconto = aLancar.reduce((s, x) => s + descontoDe(x.p.id, x.total), 0);
  const comFiado = aLancar.filter((x) => (fiadoPor[x.p.id]?.valor ?? 0) > 0.005);

  // Relatório dos pagamentos da semana: abre numa aba nova, pronto pra imprimir
  // ou salvar em PDF. É montado daqui, com o mesmo cálculo da tela (o CSV também
  // é), então mostra exatamente o que o Resumo mostra — inclusive o que ainda
  // não foi lançado. Tem coluna de assinatura porque o acerto é em mãos.
  function abrirRelatorio() {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const linhas = calc.porPessoa.filter((x) => x.total > 0.005 || pagoDe.has(x.p.id));
    const fiadoDescDe = (id: string, total: number) => (pagoDe.has(id) ? Number(pagoDe.get(id)!.desconto || 0) : descontoDe(id, total));
    const emMaosDe = (id: string, total: number) =>
      pagoDe.has(id) ? Number(pagoDe.get(id)!.valor) - Number(pagoDe.get(id)!.desconto || 0) : total - descontoDe(id, total);
    const totalFiado = linhas.reduce((s, x) => s + fiadoDescDe(x.p.id, x.total), 0);
    const totalEmMaos = linhas.reduce((s, x) => s + emMaosDe(x.p.id, x.total), 0);
    const totalGeral = calc.totalDiarias + calc.totalDez + calc.totalExtras - calc.totalDescontosSem;
    const agora = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const n = (v: number) => (v > 0.005 ? fmtNum(v) : "");
    const corpo = linhas
      .map((x) => {
        const extraTxt = x.extra > 0.005 ? `${fmtNum(x.extra)}${x.extraMotivo ? `<div class="mini">${esc(x.extraMotivo)}</div>` : ""}` : "";
        const descTxt = x.descontoSem > 0.005 ? `− ${fmtNum(x.descontoSem)}${x.descontoMotivo ? `<div class="mini">${esc(x.descontoMotivo)}</div>` : ""}` : "";
        const fiado = fiadoDescDe(x.p.id, x.total);
        const situacao = pagoDe.has(x.p.id) ? "Lançado" : x.total > 0.005 ? "A lançar" : "—";
        return `<tr>
          <td>${esc(x.p.nome)}<div class="mini">${esc(x.rotuloVinculo)}${x.p.funcao ? ` · ${esc(x.p.funcao)}` : ""}</div></td>
          <td class="c">${x.nDias || ""}</td><td class="c">${x.nNoites || ""}</td>
          <td class="r">${n(x.diarias)}</td><td class="r">${n(x.dez10)}</td><td class="r">${extraTxt}</td><td class="r neg">${descTxt}</td>
          <td class="r b">${fmtNum(x.total)}</td><td class="r neg">${fiado > 0.005 ? `− ${fmtNum(fiado)}` : ""}</td>
          <td class="r b">${fmtNum(emMaosDe(x.p.id, x.total))}</td><td class="c">${situacao}</td><td class="ass"></td>
        </tr>`;
      })
      .join("");
    const noites = calc.noitesPagas
      .map((x) => `<tr><td>${esc(rotuloDia(x.data))}</td><td class="r">${fmtNum(x.pool)}</td><td class="c">${x.presentes}</td><td class="r">${fmtNum(x.unit)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pagamentos ${esc(rotuloSemana(segunda))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 11px/1.35 Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 12px; }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; }
  th { background: #eee; text-align: left; font-weight: 600; } .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .b { font-weight: 700; } .neg { color: #b00; } .mini { font-size: 9px; color: #666; font-weight: 400; } .ass { width: 120px; }
  tfoot td { background: #f4f4f4; font-weight: 700; } .peq { width: 45%; }
  .botao { position: fixed; right: 16px; top: 12px; padding: 8px 14px; font: 600 13px Arial; background: #222; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  @media print { .botao { display: none; } body { padding: 0; } }
</style></head><body>
<button class="botao" onclick="window.print()">Imprimir / salvar PDF</button>
<h1>Pagamentos da semana · ${esc(rotuloSemana(segunda))}</h1>
<div class="sub">Semana e 10% · gerado em ${esc(agora)} · valores em reais</div>
<table><thead><tr>
  <th>Nome</th><th class="c">Dias</th><th class="c">Noites</th><th class="r">Diárias</th><th class="r">10%</th><th class="r">Extra</th><th class="r">Desconto</th>
  <th class="r">Total</th><th class="r">Adiant./fiado</th><th class="r">Em mãos</th><th class="c">Situação</th><th class="ass">Assinatura</th>
</tr></thead><tbody>${corpo}</tbody>
<tfoot><tr><td>Total · ${linhas.length} pessoa${linhas.length === 1 ? "" : "s"}</td><td class="c">${calc.turnoDia.presencas}</td><td class="c">${calc.turnoNoite.presencas}</td>
  <td class="r">${fmtNum(calc.totalDiarias)}</td><td class="r">${fmtNum(calc.totalDez)}</td><td class="r">${fmtNum(calc.totalExtras)}</td><td class="r neg">${calc.totalDescontosSem > 0.005 ? `− ${fmtNum(calc.totalDescontosSem)}` : ""}</td>
  <td class="r">${fmtNum(totalGeral)}</td><td class="r neg">${totalFiado > 0.005 ? `− ${fmtNum(totalFiado)}` : ""}</td><td class="r">${fmtNum(totalEmMaos)}</td><td></td><td></td></tr></tfoot>
</table>
<div style="display:flex; gap:24px; align-items:flex-start">
<div class="peq"><h2>Por turno</h2>
<table><thead><tr><th>Turno</th><th class="c">Presenças</th><th class="r">Diárias</th><th class="r">10%</th><th class="r">Extras</th><th class="r">Total</th></tr></thead><tbody>
<tr><td>Dia</td><td class="c">${calc.turnoDia.presencas}</td><td class="r">${fmtNum(calc.turnoDia.diarias)}</td><td class="r"></td><td class="r">${fmtNum(calc.turnoDia.extras)}</td><td class="r b">${fmtNum(calc.turnoDia.diarias + calc.turnoDia.extras)}</td></tr>
<tr><td>Noite</td><td class="c">${calc.turnoNoite.presencas}</td><td class="r">${fmtNum(calc.turnoNoite.diarias)}</td><td class="r">${fmtNum(calc.turnoNoite.dez)}</td><td class="r">${fmtNum(calc.turnoNoite.extras)}</td><td class="r b">${fmtNum(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)}</td></tr>
</tbody></table></div>
<div class="peq"><h2>10% que entra neste acerto</h2>
<table><thead><tr><th>Noite</th><th class="r">Arrecadado</th><th class="c">Presentes</th><th class="r">Cada um</th></tr></thead>
<tbody>${noites || `<tr><td colspan="4">Nenhuma noite de 10% neste acerto.</td></tr>`}</tbody>
<tfoot><tr><td>Total</td><td class="r">${fmtNum(calc.totalPool)}</td><td></td><td></td></tr></tfoot></table>
${Math.abs(calc.totalPool - calc.totalDez) > 0.01 ? `<div class="mini" style="margin-top:4px">${fmtNum(calc.totalPool - calc.totalDez)} do 10% sem ninguém marcado pra receber.</div>` : ""}
</div></div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { setErro("O navegador bloqueou a aba do relatório. Libere pop-ups pra este site e tente de novo."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async function lancar() {
    if (!aLancar.length) return;
    const ok = await confirmar(
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
            x.nFree ? `${x.nFree} free${x.nFree > 1 ? "s" : ""} fora da escala` : "",
            x.dez10 > 0.005 ? `10% ${fmtNum(x.dez10)}` : "",
            x.extra > 0.005 ? `extra ${x.extraTurno === "dia" ? "dia" : "noite"} ${fmtNum(x.extra)}${x.extraMotivo ? ` ${x.extraMotivo}` : ""}` : "",
            x.descontoSem > 0.005 ? `desconto ${fmtNum(x.descontoSem)}${x.descontoMotivo ? ` ${x.descontoMotivo}` : ""}` : "",
          ].filter(Boolean).join(", "),
          descontarFiado: descontar.has(x.p.id),
          fiadoValor: fiadoDe(x.p.id, x.total, adiantDe(x.p.id, x.total)),
          descontarAdiantamento: descontarAdiant.has(x.p.id),
        })),
        { jaPago, data: dataPag, forma: formaPag || null },
      );
      if (r.erro) setErro(r.erro);
      else {
        setMsg(`${r.n} lançamento(s) criado(s) no Contas a pagar${r.totalDesc ? `, descontado em mãos ${brl(r.totalDesc)} (adiantamento/fiado)` : ""}.`);
        setDescontar(new Set());
        setDescontarValor({});
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Semana e 10%</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Marque quem trabalhou em cada dia (dia ou noite). O 10% de cada noite é dividido por quem trabalhou naquela noite e entra no acerto da semana seguinte.
            {" "}<Link href="/colaboradores" className="text-orange-600 hover:underline">Cadastro da equipe</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/colaboradores/semana?s=${somarDias(segunda, -7)}`} className="rounded-controle border border-borda-forte px-3 py-2 text-sm">← anterior</Link>
          <span className="rounded-controle bg-orange-500 px-3 py-2 text-sm font-semibold text-white">{rotuloSemana(segunda)}</span>
          <Link href={`/colaboradores/semana?s=${somarDias(segunda, 7)}`} className="rounded-controle border border-borda-forte px-3 py-2 text-sm">próxima →</Link>
        </div>
      </div>

      {pontoSemPessoa.length > 0 && (
        <div className="mb-4 rounded-cartao border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Batidas no relógio sem colaborador ligado:</b>{" "}
          {pontoSemPessoa.map((x) => `${x.nome || "sem nome"} (CPF final ${x.cpf.slice(-4)}, ${x.n} batida${x.n === 1 ? "" : "s"})`).join(" · ")}.
          {" "}Cadastre o CPF da pessoa em <Link href="/colaboradores" className="underline">Colaboradores</Link>; as próximas batidas entram sozinhas.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-controle border border-borda-forte">
          <button onClick={() => setModo("grade")} className={`px-3 py-1.5 ${modo === "grade" ? "bg-orange-500 text-white" : ""}`}><span className="inline-flex items-center gap-1.5"><Icone nome="horario" tamanho={14} /> Grade</span></button>
          <button onClick={() => setModo("resumo")} className={`px-3 py-1.5 ${modo === "resumo" ? "bg-orange-500 text-white" : ""}`}><span className="inline-flex items-center gap-1.5"><Icone nome="dinheiro" tamanho={14} /> Resumo pra pagar</span></button>
        </div>
        <button
          onClick={() => start(async () => { const r = await preencherEscalaFixa(segunda); if (r.erro) setErro(r.erro); else router.refresh(); })}
          className="rounded-controle border border-borda-forte px-3 py-1.5 hover:bg-superficie-suave"
          title="Marca os dias fixos de cada pessoa (não apaga o que já foi marcado)"
        >
          <Icone nome="brilho" tamanho={15} className="mr-1.5" /> Preencher com a escala fixa
        </button>
        <button onClick={() => setAddAberto((v) => !v)} className="rounded-controle border border-orange-500 px-3 py-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
          + Free esporádico
        </button>
        <button
          onClick={() => setAdiantAberto((v) => !v)}
          className="rounded-controle border border-orange-500 px-3 py-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          title="Dinheiro dado antes do acerto; sai do valor em mãos na próxima semana lançada"
        >
          <Icone nome="dinheiro" tamanho={15} className="mr-1.5" /> Adiantamento{adiantamentos.length > 0 ? ` (${adiantamentos.length})` : ""}
        </button>
        <button onClick={baixarCsv} className="rounded-controle border border-borda-forte px-3 py-1.5 hover:bg-superficie-suave">
          <Icone nome="baixar" tamanho={15} className="mr-1.5" /> Planilha (CSV)
        </button>
        <button
          onClick={abrirRelatorio}
          className="rounded-controle border border-borda-forte px-3 py-1.5 hover:bg-superficie-suave"
          title="Abre numa aba nova, pronto pra imprimir ou salvar em PDF, com coluna de assinatura"
        >
          <Icone nome="imprimir" tamanho={15} className="mr-1.5" /> Relatório dos pagamentos
        </button>
        <div className="flex overflow-hidden rounded-controle border border-borda-forte" title="Filtrar por turno">
          {([["todos", "Todos"], ["dia", "Dia"], ["noite", "Noite"]] as const).map(([k, rot]) => (
            <button key={k} onClick={() => setTurnoFiltro(k)} className={`px-3 py-1.5 ${turnoFiltro === k ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : ""}`}>
              {rot}
            </button>
          ))}
        </div>
        {pending && <span className="text-xs text-texto-fraco">salvando…</span>}
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>

      {adiantAberto && (
        <div className="mb-4 rounded-cartao border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
          <p className="mb-1 text-sm font-medium">Adiantamento</p>
          <p className="mb-3 text-xs text-texto-suave">
            Dinheiro que você deu antes do acerto. Fica em aberto e sai do valor em mãos no próximo acerto lançado, separado do fiado das compras internas.
            A conta no Contas a pagar continua com o valor cheio. Se o dinheiro saiu do caixa, faça também a sangria lá.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={adiantPessoa} onChange={(e) => setAdiantPessoa(e.target.value)} className={`${inputCls} w-56`}>
              <option value="">Pessoa…</option>
              {pessoas.filter((p) => p.turno !== "proprietario").map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <input value={adiantValor} onChange={(e) => setAdiantValor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") registrarAdiant(); }} placeholder="R$ valor" inputMode="decimal" className={`${inputCls} w-28`} />
            <input type="date" value={adiantData} onChange={(e) => setAdiantData(e.target.value)} className={inputCls} />
            <input value={adiantMotivo} onChange={(e) => setAdiantMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") registrarAdiant(); }} placeholder="motivo (opcional)" className={`${inputCls} w-48`} />
            <button onClick={registrarAdiant} disabled={pending} className="rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40">
              Registrar adiantamento
            </button>
          </div>
          {adiantamentos.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-bold text-texto-fraco">Em aberto (saem no próximo acerto de cada pessoa)</p>
              <ul className="space-y-1 text-sm">
                {adiantamentos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.nome}</span>
                    <span className="text-texto-suave">{rotuloDia(a.data)}</span>
                    <span className="font-semibold">{brl(Number(a.valor))}</span>
                    {a.motivo && <span className="text-xs text-texto-suave">{a.motivo}</span>}
                    <button
                      onClick={async () => {
                        if (!await confirmar(`Apagar o adiantamento de ${brl(Number(a.valor))} de ${a.nome}?`)) return;
                        start(async () => { const r = await excluirAdiantamento(a.id); if (r.erro) setErro(r.erro); else router.refresh(); });
                      }}
                      className="text-xs text-texto-fraco hover:text-red-600"
                    >
                      apagar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {addAberto && (
        <div className="mb-4 rounded-cartao border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900 dark:bg-orange-950/20">
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
                      className="rounded-full border border-borda-forte bg-painel-cartao px-3 py-1 text-sm hover:border-orange-500"
                    >
                      {p.nome}{p.esporadico ? " · free" : ""}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <p className="mb-1 text-xs font-bold text-texto-fraco">Ou cadastrar um free novo</p>
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
              className="rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
            >
              Cadastrar e trazer
            </button>
          </div>
        </div>
      )}

      {/* 10% da noite: painel separado. Cada noite tem a data em que foi gerada e a
          semana em que é paga (padrão: a seguinte). A divisão usa quem trabalhou NAQUELA noite. */}
      <div className="mb-4 rounded-cartao border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 font-semibold"><Icone nome="noite" tamanho={15} /> 10% da noite</p>
            <p className="text-xs text-texto-suave">
              Digite o arrecadado de cada noite. Entra no acerto desta semana ({rotuloSemana(segunda)}) o que está marcado como <b>paga nesta semana</b> — normalmente as noites da semana passada.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={novaNoite} onChange={(e) => setNovaNoite(e.target.value)} className={inputCls} />
            <button onClick={addNoite} disabled={!novaNoite} className="rounded-controle bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
              + Adicionar noite
            </button>
          </div>
        </div>
        {dez.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhuma noite lançada. Adicione a data da noite e digite o valor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
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
                    <tr key={n.data} className={n.nestaSemana ? "bg-painel-cartao " : "opacity-70"}>
                      <td className="px-2 py-1 font-medium whitespace-nowrap">
                        {rotuloDia(n.data)}
                        {(n.data < dias[0] || n.data > dias[6]) && <span className="ml-1 text-mini text-texto-fraco">(outra semana)</span>}
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
                          className={`${inputCls}  ${n.nestaSemana ? "border-indigo-400 font-medium" : ""}`}
                        >
                          {opcoesPagar.map((s) => (
                            <option key={s} value={s}>
                              semana {rotuloSemana(s)}{s === segunda ? " (esta)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        {n.presentes > 0 ? <span className="inline-flex items-center gap-1">{n.presentes} <Icone nome="noite" tamanho={13} /></span> : n.pool > 0 ? <span className="text-red-600">ninguém marcado nessa noite</span> : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold">{n.presentes > 0 ? brl(n.unit) : "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <button onClick={() => removerNoite(n.data)} className="text-texto-fraco hover:text-red-600"><Icone nome="lixeira" tamanho={15} titulo="Apagar" /></button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-indigo-200 font-semibold dark:border-indigo-900">
                  <td className="px-2 py-1" colSpan={1}>Entra nesta semana</td>
                  <td className="px-2 py-1 text-right">{brl(calc.totalPool)}</td>
                  <td className="px-2 py-1 text-xs font-normal text-texto-suave" colSpan={4}>
                    {calc.noitesPagas.length} noite{calc.noitesPagas.length === 1 ? "" : "s"} · quem trabalhou nelas recebe no acerto desta semana, mesmo sem trabalhar agora
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modo === "grade" ? (
        <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="bg-superficie-suave text-xs text-texto-suave">
              <tr>
                <th className="sticky left-0 z-10 bg-superficie-suave px-3 py-2 text-left">Pessoa</th>
                {dias.map((d) => (
                  <th key={d} className={`px-1 py-2 text-center ${ehHoje(d) ? "text-orange-600" : ""}`}>{rotuloDia(d)}</th>
                ))}
                <th className="px-3 py-2 text-right">Semana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {calc.porPessoa.filter((x) => cabeNoFiltro(x.p)).map(({ p, nDias, nNoites, total, clt, cltDia, cltNoite }) => (
                <tr key={p.id} className="">
                  <td className="sticky left-0 z-10 bg-painel-cartao px-3 py-1.5">
                    <div className="font-medium text-texto">
                      {p.nome}
                      {p.esporadico && <span className="ml-1 rounded bg-amber-100 px-1 text-mini text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">free</span>}
                    </div>
                    <div className="text-mini text-texto-fraco">
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
                            className={`h-8 w-8 rounded-controle border text-base ${kd ? "border-yellow-500 bg-yellow-400 text-texto" : "border-borda text-zinc-300 hover:border-yellow-400 "}  ${mostraDia ? "" : "opacity-30"}`}
                          >
                            <Icone nome="dia" tamanho={17} titulo="Trabalhou de dia" />
                          </button>
                          <button
                            onClick={() => toggle(p, d, "noite")}
                            title="Trabalhou de noite"
                            className={`h-8 w-8 rounded-controle border text-base ${kn ? "border-indigo-600 bg-indigo-600 text-white" : "border-borda text-zinc-300 hover:border-indigo-400 "}  ${mostraNoite ? "" : "opacity-30"}`}
                          >
                            <Icone nome="noite" tamanho={17} titulo="Trabalhou de noite" />
                          </button>
                        </div>
                        {(() => {
                          // CLT trabalhando fora da escala = free (pago pelo "valor do free").
                          const dow = deYmd(d).getDay();
                          const fDia = kd && vinculoDoTurno(p, "dia") === "clt" && foraDaEscala(p, "dia", dow);
                          const fNoite = kn && vinculoDoTurno(p, "noite") === "clt" && foraDaEscala(p, "noite", dow);
                          if (!fDia && !fNoite) return null;
                          return <div className="mt-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400" title={p.valor_free ? `Free: ${brl(Number(p.valor_free))}` : "Free sem valor: preencha o valor do free no cadastro"}>free{p.valor_free ? "" : " ?"}</div>;
                        })()}
                        {(() => {
                          // Horários do relógio de ponto (migration 0221), primeiro e último de cada turno.
                          const faixa = (t: Turno) => {
                            const hs = horasPonto.get(`${p.id}|${d}|${t}`);
                            if (!hs?.length) return null;
                            return hs.length === 1 ? hs[0] : `${hs[0]}–${hs[hs.length - 1]}`;
                          };
                          const fd = faixa("dia"), fn = faixa("noite");
                          if (!fd && !fn) return null;
                          return (
                            <div className="mt-0.5 text-[10px] leading-tight text-texto-fraco" title="Batidas no relógio de ponto">
                              {fd && <div>{fd}</div>}
                              {fn && <div>{fn}</div>}
                            </div>
                          );
                        })()}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2 text-xs text-texto-suave">
                      <span className="inline-flex items-center gap-1">{nDias} <Icone nome="dia" tamanho={12} /></span>
                      <span className="inline-flex items-center gap-1">{nNoites} <Icone nome="noite" tamanho={12} /></span>
                    </div>
                    <div className="font-semibold text-texto">{brl(total)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          {/* Gasto por turno da semana */}
          <div className="grid gap-3 border-b border-borda bg-superficie-suave p-3 sm:grid-cols-3">
            <div className={`rounded-cartao border bg-painel-cartao p-3 ${turnoFiltro === "dia" ? "border-yellow-500" : "border-borda"}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-texto-suave"><Icone nome="dia" tamanho={13} /> Dia</div>
              <div className="text-lg font-semibold">{brl(calc.turnoDia.diarias + calc.turnoDia.extras)}</div>
              <div className="text-xs text-texto-suave">{calc.turnoDia.presencas} presença{calc.turnoDia.presencas === 1 ? "" : "s"} · diárias {brl(calc.turnoDia.diarias)}{calc.turnoDia.extras > 0 ? ` + extras ${brl(calc.turnoDia.extras)}` : ""} (CLT não entra)</div>
            </div>
            <div className={`rounded-cartao border bg-painel-cartao p-3 ${turnoFiltro === "noite" ? "border-indigo-500" : "border-borda"}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-texto-suave"><Icone nome="noite" tamanho={13} /> Noite</div>
              <div className="text-lg font-semibold">{brl(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)}</div>
              <div className="text-xs text-texto-suave">{calc.turnoNoite.presencas} presença{calc.turnoNoite.presencas === 1 ? "" : "s"} · diárias {brl(calc.turnoNoite.diarias)} + 10% {brl(calc.turnoNoite.dez)}{calc.turnoNoite.extras > 0 ? ` + extras ${brl(calc.turnoNoite.extras)}` : ""}</div>
            </div>
            <div className="rounded-cartao border border-borda bg-painel-cartao p-3">
              <div className="text-xs font-bold text-texto-suave">Semana</div>
              <div className="text-lg font-semibold">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras)}</div>
              <div className="text-xs text-texto-suave">diárias {brl(calc.totalDiarias)} + 10% {brl(calc.totalDez)}{calc.totalExtras > 0 ? ` + extras ${brl(calc.totalExtras)}` : ""}</div>
            </div>
          </div>
          {turnoFiltro === "todos" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2 text-sm">
              <span className="text-texto-suave">Dar um extra pra alguém que não está na lista (ex.: carteira assinada que fez algo a mais — não conta como dia):</span>
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
              Mostrando só o turno {turnoFiltro === "dia" ? "DIA" : "NOITE"}: os valores abaixo são só desse turno. Pra lançar o pagamento, volte em <b>Todos</b>.
            </div>
          )}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-superficie-suave text-left text-mini text-texto-suave">
              <tr>
                {turnoFiltro === "todos" && (() => {
                  // Marcar/desmarcar todo mundo que pode ser lançado (tem valor e ainda não foi pago).
                  const selecionaveis = calc.porPessoa.filter((x) => x.total > 0.005 && !pagoDe.has(x.p.id)).map((x) => x.p.id);
                  const todos = selecionaveis.length > 0 && selecionaveis.every((id) => !desmarcados.has(id));
                  const nenhum = selecionaveis.every((id) => desmarcados.has(id));
                  return (
                    <th className="px-2 py-3 text-center" title={todos ? "Desmarcar todos" : "Marcar todos"}>
                      <input
                        type="checkbox"
                        checked={todos}
                        ref={(el) => { if (el) el.indeterminate = !todos && !nenhum; }}
                        onChange={(e) => setDesmarcados(e.target.checked ? new Set() : new Set(selecionaveis))}
                      />
                    </th>
                  );
                })()}
                <th className="px-3 py-3">Pessoa</th>
                <th className="px-2 py-3 text-center" title="Presenças: dias e noites">Pres.</th>
                <th className="px-3 py-3 text-right">Diárias</th>
                {turnoFiltro !== "dia" && <th className="px-3 py-3 text-right">10%</th>}
                <th className="px-3 py-3 text-right" title="Algo que fez a mais nesta semana (conta no turno escolhido)">Extra</th>
                {turnoFiltro === "todos" && <th className="px-3 py-3 text-right" title="Atraso, falta… abate do total">Desconto</th>}
                <th className="px-4 py-3 text-right">Total a pagar</th>
                {turnoFiltro === "todos" && <th className="px-3 py-3 text-right" title="Adiantamento (sai por padrão) e compras internas em aberto (opcional descontar)">Adiant. / fiado</th>}
                {turnoFiltro === "todos" && <th className="px-4 py-3 text-right">Em mãos</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
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
                .map((x) => ({ ...x, totalM: turnoFiltro === "todos" ? x.total : x.diariasM + x.dezM + x.extraM }))
                .filter((x) => x.presM > 0 || x.dezM > 0.005 || x.extraM > 0.005 || (turnoFiltro === "todos" && (pagoDe.has(x.p.id) || soExtra.has(x.p.id) || !!extrasSem[x.p.id]?.motivo || x.descontoSem > 0)))
                .sort((a, b) => b.totalM - a.totalM)
                .map(({ p, nDias, nNoites, diariasM, dezM, extraM, totalM, total, rotuloVinculo }) => (
                  <tr key={p.id} className={`bg-painel-cartao ${pagoDe.has(p.id) ? "opacity-70" : ""}`}>
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
                      <div className="font-medium text-texto">{p.nome}</div>
                      <div className="text-mini text-texto-fraco">
                        {rotuloVinculo}{p.funcao ? ` · ${p.funcao}` : ""}
                        {pagoDe.has(p.id) && <span className="ml-1 text-green-600">· lançado no contas a pagar ({brl(Number(pagoDe.get(p.id)!.valor))}{pagoDe.get(p.id)!.n > 1 ? `, ${pagoDe.get(p.id)!.n} lançamentos` : ""})</span>}
                      </div>
                      {pagoDe.has(p.id) && total - pagoDe.get(p.id)!.valor > 0.005 && (
                        <button
                          type="button"
                          onClick={() => lancarDiferenca(p, Math.round((total - pagoDe.get(p.id)!.valor) * 100) / 100)}
                          disabled={pending}
                          className="mt-1 rounded-controle border border-amber-500 px-2 py-0.5 text-mini font-medium text-amber-700 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-400"
                          title="Esqueceu algo? Lança só a diferença entre o total de agora e o que já foi lançado."
                        >
                          + Lançar diferença {brl(total - pagoDe.get(p.id)!.valor)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center whitespace-nowrap text-texto-suave">
                      <span className="inline-flex items-center justify-center gap-2">
                          {turnoFiltro !== "noite" && <span className="inline-flex items-center gap-1">{nDias} <Icone nome="dia" tamanho={12} /></span>}
                          {turnoFiltro !== "dia" && <span className="inline-flex items-center gap-1">{nNoites} <Icone nome="noite" tamanho={12} /></span>}
                        </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(diariasM)}</td>
                    {turnoFiltro !== "dia" && <td className="px-3 py-2 text-right">{brl(dezM)}</td>}
                    <td className="px-3 py-2 text-right">
                      {turnoFiltro !== "todos" ? (
                        <span className={extraM > 0 ? "" : "text-zinc-300"}>{extraM > 0 ? brl(extraM) : "—"}</span>
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
                                <option value="dia">dia</option>
                                <option value="noite">noite</option>
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
                              className={`${inputCls} w-28 px-1 py-0.5 text-mini`}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    {turnoFiltro === "todos" && <td className="px-3 py-2 text-right">
                      {(
                        <div className="flex flex-col items-end gap-0.5">
                          <input
                            value={extraDe(p).desconto}
                            onChange={(e) => setExtrasSem((o) => ({ ...o, [p.id]: { ...extraDe(p), desconto: e.target.value } }))}
                            onBlur={() => salvarExtraDe(p)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            inputMode="decimal"
                            placeholder="0,00"
                            className={`${inputCls} w-20 text-right ${extraDe(p).desconto ? "border-red-400 text-red-700" : ""}`}
                          />
                          {(extraDe(p).desconto || extraDe(p).descMotivo) && (
                            <input
                              value={extraDe(p).descMotivo}
                              onChange={(e) => setExtrasSem((o) => ({ ...o, [p.id]: { ...extraDe(p), descMotivo: e.target.value } }))}
                              onBlur={() => salvarExtraDe(p)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              placeholder="motivo (ex.: atraso)"
                              className={`${inputCls} w-28 px-1 py-0.5 text-mini`}
                            />
                          )}
                        </div>
                      )}
                    </td>}
                    <td className="px-4 py-2 text-right font-semibold text-texto">{brl(totalM)}</td>
                    {turnoFiltro === "todos" && <td className="px-3 py-2 text-right whitespace-nowrap">
                      {pagoDe.has(p.id) ? (
                        Number(pagoDe.get(p.id)!.desconto) > 0 ? <span className="text-xs text-texto-suave">− {brl(Number(pagoDe.get(p.id)!.desconto))}</span> : <span className="text-zinc-300">—</span>
                      ) : (adiantPor[p.id]?.valor ?? 0) > 0.005 || (fiadoPor[p.id]?.valor ?? 0) > 0.005 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {(adiantPor[p.id]?.valor ?? 0) > 0.005 && (
                            <label className="flex cursor-pointer items-center justify-end gap-1 text-xs text-amber-700 dark:text-amber-400" title={`${adiantPor[p.id].n} adiantamento(s) em aberto — desmarque só se for descontar em outra semana`}>
                              <input
                                type="checkbox"
                                checked={descontarAdiant.has(p.id)}
                                onChange={(e) => setDescontarAdiant((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                              />
                              adiant. {brl(adiantPor[p.id].valor)}
                            </label>
                          )}
                          {(fiadoPor[p.id]?.valor ?? 0) > 0.005 && (
                            <div className="flex items-center justify-end gap-1.5 text-xs text-red-600">
                              <label className="flex cursor-pointer items-center gap-1" title={`${fiadoPor[p.id].n} compra(s) em aberto — marque pra descontar no acerto`}>
                                <input
                                  type="checkbox"
                                  checked={descontar.has(p.id)}
                                  onChange={(e) => setDescontar((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                                />
                                deve {brl(fiadoPor[p.id].valor)}
                              </label>
                              {/* Quanto descontar agora: vem cheio (o que couber) e pode ser diminuído — parte do fiado fica pra depois. */}
                              {descontar.has(p.id) && (
                                <input
                                  value={descontarValor[p.id] ?? fmtNum(fiadoDe(p.id, total, adiantDe(p.id, total)))}
                                  onChange={(e) => setDescontarValor((o) => ({ ...o, [p.id]: e.target.value }))}
                                  inputMode="decimal"
                                  title="Quanto do fiado descontar neste acerto (pode ser só uma parte)"
                                  className={`${inputCls} w-20 text-right text-red-700`}
                                />
                              )}
                            </div>
                          )}
                        </div>
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
                <tr className="bg-superficie-suave font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total da semana</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalDiarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalDez)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.totalExtras)}</td>
                  <td className="px-3 py-3 text-right text-red-600">{calc.totalDescontosSem > 0 ? `− ${brl(calc.totalDescontosSem)}` : ""}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras - calc.totalDescontosSem)}</td>
                  <td className="px-3 py-3 text-right text-red-600">{totalDesconto > 0 ? `− ${brl(totalDesconto)}` : ""}</td>
                  <td className="px-4 py-3 text-right text-green-700 dark:text-green-400">{brl(calc.totalDiarias + calc.totalDez + calc.totalExtras - calc.totalDescontosSem - totalDesconto)}</td>
                </tr>
              ) : turnoFiltro === "dia" ? (
                <tr className="bg-superficie-suave font-semibold">
                  <td className="px-4 py-3" colSpan={2}><span className="inline-flex items-center gap-1.5">Total do turno <Icone nome="dia" tamanho={13} /> Dia</span></td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoDia.diarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoDia.extras)}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.turnoDia.diarias + calc.turnoDia.extras)}</td>
                </tr>
              ) : (
                <tr className="bg-superficie-suave font-semibold">
                  <td className="px-4 py-3" colSpan={2}><span className="inline-flex items-center gap-1.5">Total do turno <Icone nome="noite" tamanho={13} /> Noite</span></td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.diarias)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.dez)}</td>
                  <td className="px-3 py-3 text-right">{brl(calc.turnoNoite.extras)}</td>
                  <td className="px-4 py-3 text-right">{brl(calc.turnoNoite.diarias + calc.turnoNoite.dez + calc.turnoNoite.extras)}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="border-t border-borda p-3 text-xs text-texto-suave">
            10% que entra neste acerto: <b>{brl(calc.totalPool)}</b> ({calc.noitesPagas.map((n) => rotuloDia(n.data)).join(", ") || "nenhuma noite"})
            {Math.abs(calc.totalPool - calc.totalDez) > 0.01 && (
              <span className="ml-2 text-amber-600">— {brl(calc.totalPool - calc.totalDez)} sem ninguém marcado pra receber.</span>
            )}
          </div>

          {/* Pagar → Contas a pagar (CMO Eventual / Diaristas) */}
          {turnoFiltro === "todos" && <div className="flex flex-wrap items-center gap-3 border-t border-borda bg-orange-50/60 p-3 text-sm dark:bg-orange-950/20">
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
              className="rounded-controle bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-40"
            >
              <Icone nome="dinheiro" tamanho={16} className="mr-1.5" /> Lançar {aLancar.length} pagamento{aLancar.length === 1 ? "" : "s"} · {brl(totalALancar)} no Contas a pagar
            </button>
            <span className="text-xs text-texto-suave">categoria: CMO Eventual / Diaristas · a conta entra com o valor cheio; o fiado só abate o que sai em mãos</span>
            {comFiado.length > 0 && (
              <button
                type="button"
                onClick={() => setDescontar((s) => (s.size >= comFiado.length ? new Set() : new Set(comFiado.map((x) => x.p.id))))}
                className="rounded-controle border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
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
