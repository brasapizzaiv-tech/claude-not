// Ferramentas do Ajudante sobre a EQUIPE (etapa 2): folgas, Semana e 10%,
// acerto da semana, ponto, ficha de trabalho do colaborador e fiado.
//
// Tudo só LÊ, pelo cliente da sessão. Os números saem da MESMA regra das telas:
//  - Semana e 10%: src/app/(painel)/colaboradores/semana (page.tsx + semana.tsx),
//    inclusive o 10% puxado do caixa (src/lib/dez-caixa.ts), que aqui é só
//    calculado em memória (a tela grava; o Ajudante nunca grava);
//  - ponto: src/lib/ponto-espelho.ts (o mesmo espelho dos relatórios);
//  - folgas: src/lib/folgas.ts; fiado: src/app/(painel)/retiradas.
// Nunca devolve CPF, RG, endereço, telefone, e-mail, PIN, código, token,
// chave Pix, dados bancários nem nascimento.

import { buscarTodas } from "@/lib/supabase/todas";
import { diasDaSemana, rotuloDia, rotuloSemana, segundaDe, somarDias, vinculoDoTurno } from "@/lib/equipe";
import { repartirDez } from "@/lib/dez-repartir";
import { GRUPOS, TURNO, gruposDe, haQuantoTempo, type Funcionario, type GrupoKey } from "@/lib/folgas";
import { espelhoDaPessoa, espelhosDoPeriodo, type EspelhoPessoa } from "@/lib/ponto-espelho";
import { duracao, hhmm } from "@/lib/ponto-relatorio-core";
import { periodo, r2, type ContextoFerramenta, type Db, type Ferramenta } from "./tipos";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_NOME = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Texto de busca por nome: mínimo 2 letras, curinga do ilike escapado. */
function busca(args: Record<string, unknown>, campo = "nome", obrigatorio = false): string | null {
  const t = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (!t) {
    if (obrigatorio) throw new Error("Diga o nome (pelo menos 2 letras).");
    return null;
  }
  if (t.length < 2) throw new Error("Pra buscar pelo nome, use pelo menos 2 letras.");
  return `%${t.slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Segunda-feira da semana pedida (padrão: a semana de hoje). Semana que ainda não começou não vale. */
function semanaPedida(args: Record<string, unknown>, ctx: ContextoFerramenta): string {
  const d = typeof args.data === "string" && DATA.test(args.data) ? args.data : ctx.hoje;
  const segunda = segundaDe(d);
  if (segunda > ctx.hoje) throw new Error("Essa semana ainda não começou.");
  return segunda;
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;

// ======================= SEMANA E 10% =======================

type PessoaSemana = {
  id: string;
  nome: string;
  turno: "dia" | "noite" | "ambos" | "proprietario";
  vinculo: "clt" | "freelance";
  vinculo_noite: "clt" | "freelance" | null;
  bate_ponto: boolean | null;
  funcao: string | null;
  valor_dia: number | null;
  valor_noite: number | null;
  valor_free: number | null;
  dias_dia: number[] | null;
  dias_noite: number[] | null;
  recebe_10: boolean;
  peso_10: number | null;
  esporadico: boolean;
};
type Presenca = { colaborador_id: string; data: string; turno: "dia" | "noite" };
type DezNoite = { data: string; valor: number; pagar_em: string; origem?: string | null; desconto_pct?: number | null; divisao?: Record<string, number> | null };

/**
 * O 10% das noites encerradas que a tela Semana e 10% puxaria do caixa ao abrir
 * (mesma regra de sincronizarDezDoCaixa em src/lib/dez-caixa.ts), só que SEM
 * gravar: devolve as linhas que a tela gravaria.
 */
async function dezDoCaixaSemGravar(db: Db, ctx: ContextoFerramenta, segunda: string, fim: string): Promise<DezNoite[]> {
  const deCaixa = somarDias(segunda, -14);
  const { data: servRows } = await db.rpc("servico_noites", { p_de: deCaixa, p_ate: fim });
  const servicoCaixa: Record<string, number> = {};
  for (const r of (servRows as { noite: string; servico: number }[] | null) ?? []) servicoCaixa[String(r.noite).slice(0, 10)] = Number(r.servico) || 0;
  const agora = Date.now();
  const encerradas = Object.keys(servicoCaixa).filter((d) => agora >= new Date(`${somarDias(d, 1)}T06:00:00-03:00`).getTime());
  if (encerradas.length === 0) return [];

  const [{ data: jaDez }, { data: lancados }, { data: cfg }] = await Promise.all([
    db.from("dez_por_cento_noites").select("data, valor, pagar_em, origem, desconto_pct").eq("empresa_id", ctx.empresaId).in("data", encerradas),
    db.from("semana_pagamentos").select("segunda").eq("empresa_id", ctx.empresaId).not("lancamento_id", "is", null).gte("segunda", deCaixa),
    db.from("pdv_config").select("valor").eq("empresa_id", ctx.empresaId).eq("chave", "dez_desconto_pct").maybeSingle(),
  ]);
  const acertos = new Map<string, number>();
  for (const x of (lancados as { segunda: string }[] | null) ?? []) {
    const k = String(x.segunda).slice(0, 10);
    acertos.set(k, (acertos.get(k) ?? 0) + 1);
  }
  const existente = new Map(((jaDez as DezNoite[] | null) ?? []).map((x) => [String(x.data).slice(0, 10), x]));
  const pctLido = Number((cfg as { valor: string | null } | null)?.valor);
  const pctNovas = Number.isFinite(pctLido) && pctLido >= 0 ? pctLido : 0;

  const gravaria: DezNoite[] = [];
  for (const d of encerradas) {
    const e = existente.get(d);
    const pagarEm = e?.pagar_em ? String(e.pagar_em).slice(0, 10) : somarDias(segundaDe(d), 7);
    if ((acertos.get(pagarEm) ?? 0) > 3) continue;
    const v = servicoCaixa[d];
    const atualiza = !e || !(Number(e.valor) > 0) || (e.origem === "caixa" && Math.abs(Number(e.valor) - v) > 0.009);
    if (atualiza) gravaria.push({ data: d, valor: v, pagar_em: pagarEm, origem: "caixa", desconto_pct: e ? Number(e.desconto_pct) || 0 : pctNovas });
  }
  return gravaria;
}

/** Monta a semana exatamente como a tela Semana e 10% (page.tsx + o cálculo do semana.tsx). */
async function calcularSemana(db: Db, ctx: ContextoFerramenta, segunda: string) {
  const dias = diasDaSemana(segunda);
  const fim = somarDias(segunda, 6);
  const emp = ctx.empresaId;

  const caixa = await dezDoCaixaSemGravar(db, ctx, segunda, fim);
  const [{ data: colabs, error: errColabs }, { data: dezLidas }, { data: pagos }, fiado, { data: extras }, { data: adiantamentos }] = await Promise.all([
    // Diária e 10%: pela visão que só abre pra quem tem Colaboradores (SEC-04), igual à tela.
    db.from("colaboradores_dados")
      .select("id, nome, turno, vinculo, vinculo_noite, funcao, valor_dia, valor_noite, valor_free, dias_dia, dias_noite, recebe_10, peso_10, esporadico, ativo, bate_ponto")
      .eq("empresa_id", emp).eq("ativo", true).order("nome"),
    db.from("dez_por_cento_noites")
      .select("data, valor, pagar_em, origem, desconto_pct, divisao")
      .eq("empresa_id", emp)
      .or(`pagar_em.eq.${segunda},and(data.gte.${segunda},data.lte.${fim})`)
      .order("data"),
    db.from("semana_pagamentos").select("colaborador_id, valor, lancamento_id, desconto").eq("empresa_id", emp).eq("segunda", segunda),
    buscarTodas<{ colaborador_id: string | null; valor: number }>((de, ate) =>
      db.from("retiradas").select("colaborador_id, valor").eq("empresa_id", emp).eq("status", "aberto").order("id").range(de, ate)),
    db.from("semana_extras").select("colaborador_id, valor, turno, desconto").eq("empresa_id", emp).eq("segunda", segunda),
    db.from("adiantamentos").select("colaborador_id, valor, data").eq("empresa_id", emp).eq("status", "aberto").order("data"),
  ]);
  if (errColabs) throw new Error("Não consegui ler a equipe agora. Confira a internet e tente de novo.");

  // As noites que a tela teria acabado de gravar do caixa entram como se já estivessem lá.
  const dez: DezNoite[] = ((dezLidas as DezNoite[] | null) ?? []).map((d) => ({ ...d, data: String(d.data).slice(0, 10), pagar_em: String(d.pagar_em).slice(0, 10) }));
  for (const g of caixa) {
    const i = dez.findIndex((d) => d.data === g.data);
    if (i >= 0) dez[i] = { ...dez[i], valor: g.valor, pagar_em: g.pagar_em, origem: g.origem, desconto_pct: g.desconto_pct };
    else if (g.pagar_em === segunda || (g.data >= segunda && g.data <= fim)) dez.push({ ...g, divisao: null });
  }
  dez.sort((a, b) => (a.data < b.data ? -1 : 1));

  const datasExtras = dez.map((d) => d.data).filter((d) => d < segunda || d > fim);
  const [{ data: presSemana }, { data: presExtras }] = await Promise.all([
    db.from("presencas").select("colaborador_id, data, turno").eq("empresa_id", emp).gte("data", segunda).lte("data", fim),
    datasExtras.length
      ? db.from("presencas").select("colaborador_id, data, turno").eq("empresa_id", emp).in("data", datasExtras)
      : Promise.resolve({ data: [] as Presenca[] }),
  ]);
  const presencas = ([...((presSemana as Presenca[] | null) ?? []), ...((presExtras as Presenca[] | null) ?? [])]).map((p) => ({ ...p, data: String(p.data).slice(0, 10) }));

  // Desativado que trabalhou numa noite de 10% continua na divisão daquela noite.
  const noites10 = new Set(dez.map((d) => d.data));
  const ativos = new Set(((colabs as { id: string }[] | null) ?? []).map((c) => c.id));
  const idsInativos = [...new Set(presencas.filter((p) => p.turno === "noite" && noites10.has(p.data) && !ativos.has(p.colaborador_id)).map((p) => p.colaborador_id))];
  // Divisão congelada no 1º acerto da semana (EQP-02); cadastrado depois entra com a configuração de hoje.
  const { data: primeiroAcerto } = await db.from("semana_pagamentos").select("criado_em")
    .eq("empresa_id", emp).eq("segunda", segunda).order("criado_em").limit(1).maybeSingle();
  const congeladoEm = (primeiroAcerto as { criado_em?: string } | null)?.criado_em ?? null;
  const idsPresentes = [...new Set(presencas.map((p) => p.colaborador_id))].filter((id) => !ativos.has(id));
  const [{ data: novosRows }, { data: inativosRows }, { data: cfgPonto }] = await Promise.all([
    congeladoEm
      ? db.from("colaboradores").select("id").eq("empresa_id", emp).eq("recebe_10", true).gt("criado_em", congeladoEm)
      : Promise.resolve({ data: [] as { id: string }[] }),
    idsPresentes.length
      ? db.from("colaboradores").select("id, nome, peso_10, recebe_10").in("id", idsPresentes)
      : Promise.resolve({ data: [] as { id: string; nome: string; peso_10: number | null; recebe_10: boolean }[] }),
    db.from("assiduidade_config").select("inicio").eq("empresa_id", emp).maybeSingle(),
  ]);
  const novos10 = new Set(((novosRows as { id: string }[] | null) ?? []).map((r) => r.id));
  const outros = (inativosRows as { id: string; nome: string; peso_10: number | null; recebe_10: boolean }[] | null) ?? [];
  const inativos10 = outros.filter((o) => o.recebe_10 && idsInativos.includes(o.id));

  // "Bate ponto" = carteira assinada, a partir da semana em que o ponto começou.
  const inicioPonto = String((cfgPonto as { inicio: string | null } | null)?.inicio ?? "9999-12-31").slice(0, 10);
  const pessoas = ((colabs as PessoaSemana[] | null) ?? []).map((c) => ({ ...c, bate_ponto: !!c.bate_ponto && fim >= inicioPonto }));
  const nomeDe = new Map<string, string>([...pessoas.map((p) => [p.id, p.nome] as [string, string]), ...outros.map((o) => [o.id, `${o.nome} (desativado)`] as [string, string])]);

  const marcadas = new Set(presencas.map((p) => `${p.colaborador_id}|${p.data}|${p.turno}`));
  const marcada = (id: string, d: string, t: "dia" | "noite") => marcadas.has(`${id}|${d}|${t}`);
  const extraDe = new Map(((extras as { colaborador_id: string; valor: number; turno: string; desconto: number | null }[] | null) ?? []).map((e) => [e.colaborador_id, e]));

  // Quem aparece na grade: fixos (não esporádicos, não proprietários) + esporádicos com presença ou extra.
  const comPresenca = new Set(presencas.map((p) => p.colaborador_id));
  for (const e of extraDe.values()) if (Number(e.valor) > 0) comPresenca.add(e.colaborador_id);
  const naGrade = pessoas.filter((p) => p.turno !== "proprietario" && (!p.esporadico || comPresenca.has(p.id)));

  const porNoite = dez.map((e) => {
    const arrecadado = r2(Number(e.valor) || 0);
    const pct = Number(e.desconto_pct) || 0;
    const custo = Math.round(arrecadado * pct) / 100;
    const pool = Math.round((arrecadado - custo) * 100) / 100;
    const congelada = e.divisao && typeof e.divisao === "object" ? e.divisao : null;
    const presentes: { id: string; peso: number }[] = congelada
      ? [
          ...Object.entries(congelada).filter(([id]) => marcada(id, e.data, "noite")).map(([id, peso]) => ({ id, peso: Number(peso) || 1 })),
          ...pessoas
            .filter((p) => p.recebe_10 && novos10.has(p.id) && !(p.id in congelada) && marcada(p.id, e.data, "noite"))
            .map((p) => ({ id: p.id, peso: Number(p.peso_10) || 1 })),
        ]
      : [...pessoas.filter((p) => p.recebe_10), ...inativos10]
          .filter((p) => marcada(p.id, e.data, "noite"))
          .map((p) => ({ id: p.id, peso: Number(p.peso_10) || 1 }));
    const pesoTotal = presentes.reduce((s, p) => s + p.peso, 0);
    return {
      data: e.data, pagar_em: e.pagar_em, arrecadado, custo, pct, pool, presentes: presentes.length, pesoTotal,
      unit: pesoTotal > 0 ? pool / pesoTotal : 0, parteDe: repartirDez(pool, presentes), nestaSemana: e.pagar_em === segunda,
      origem: e.origem ?? "manual",
    };
  });
  const noitesPagas = porNoite.filter((n) => n.nestaSemana);

  const porPessoa = naGrade.map((p) => {
    let nDias = 0, nNoites = 0, dez10 = 0, freeDia = 0, freeNoite = 0;
    const fora = (t: "dia" | "noite", dow: number) => {
      const escala = (t === "dia" ? p.dias_dia : p.dias_noite) ?? [];
      return escala.length > 0 && !escala.includes(dow);
    };
    for (const d of dias) {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (marcada(p.id, d, "dia")) { nDias++; if (fora("dia", dow)) freeDia++; }
      if (marcada(p.id, d, "noite")) { nNoites++; if (fora("noite", dow)) freeNoite++; }
    }
    for (const n of noitesPagas) dez10 += n.parteDe.get(p.id) ?? 0;
    dez10 = Math.round(dez10 * 100) / 100;
    const cltDia = vinculoDoTurno(p, "dia") === "clt";
    const cltNoite = vinculoDoTurno(p, "noite") === "clt";
    const diariasDia = cltDia ? freeDia * (Number(p.valor_free) || 0) : nDias * (Number(p.valor_dia) || 0);
    const diariasNoite = cltNoite ? freeNoite * (Number(p.valor_free) || 0) : nNoites * (Number(p.valor_noite) || 0);
    const diarias = diariasDia + diariasNoite;
    const vinculo = cltDia && cltNoite ? "CLT (só o 10%)" : !cltDia && !cltNoite ? "free" : cltDia ? "CLT de dia, free de noite" : "free de dia, CLT de noite";
    const ex = extraDe.get(p.id);
    const extra = r2(Number(ex?.valor) || 0);
    const extraTurno = ex?.turno === "dia" || (!ex && p.turno === "dia") ? "dia" : "noite";
    const descontoSem = r2(Number(ex?.desconto) || 0);
    const bruto = diarias + dez10 + extra;
    const total = Math.max(0, bruto - descontoSem);
    return { p, nDias, nNoites, diarias, diariasDia, diariasNoite, dez10, extra, extraDia: extraTurno === "dia" ? extra : 0, extraNoite: extraTurno === "noite" ? extra : 0, descontoSem: Math.min(descontoSem, bruto), total, vinculo };
  });

  const pagoDe = new Map<string, { valor: number; desconto: number }>();
  for (const x of (pagos as { colaborador_id: string; valor: number; desconto: number | null }[] | null) ?? []) {
    const a = pagoDe.get(x.colaborador_id) ?? { valor: 0, desconto: 0 };
    a.valor = r2(a.valor + Number(x.valor));
    a.desconto = r2(a.desconto + Number(x.desconto || 0));
    pagoDe.set(x.colaborador_id, a);
  }
  const fiadoDe = new Map<string, number>();
  for (const f of fiado) if (f.colaborador_id) fiadoDe.set(f.colaborador_id, (fiadoDe.get(f.colaborador_id) ?? 0) + (Number(f.valor) || 0));
  const adiantDe = new Map<string, number>();
  for (const a of (adiantamentos as { colaborador_id: string; valor: number }[] | null) ?? []) adiantDe.set(a.colaborador_id, (adiantDe.get(a.colaborador_id) ?? 0) + (Number(a.valor) || 0));

  return { segunda, fim, dias, presencas, nomeDe, porNoite, noitesPagas, porPessoa, pagoDe, fiadoDe, adiantDe };
}

const semanaPresenca10: Ferramenta = {
  nome: "semana_presenca_e_10",
  descricao:
    "Semana e 10%: quem trabalhou em cada dia da semana (turno do dia e da noite, como marcado na grade da tela Semana e 10%) e o 10% de cada noite: quanto o caixa arrecadou, a parte da casa (custo de nota e cartão), quanto foi dividido, entre quantas pessoas e o valor por pessoa. " +
    "Use para 'quem trabalhou sábado à noite?', 'quantos vieram na terça?', 'quanto deu o 10% de sexta?', 'quanto cada um ganhou de 10% no sábado?'. " +
    "Recebe um dia qualquer da semana (segunda a domingo); sem data, a semana de hoje. As noites listadas são as da semana e as da semana anterior que são pagas neste acerto. Valores em reais.",
  telas: ["/colaboradores/semana"],
  parametros: {
    type: "object",
    properties: {
      data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Um dia da semana desejada, AAAA-MM-DD. Sem ele: semana de hoje." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const segunda = semanaPedida(args, ctx);
    const s = await calcularSemana(db, ctx, segunda);
    const nomes = (d: string, t: "dia" | "noite") =>
      s.presencas.filter((p) => p.data === d && p.turno === t).map((p) => s.nomeDe.get(p.colaborador_id) ?? "?").sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      semana: rotuloSemana(segunda),
      dias: s.dias.map((d) => {
        const dia = nomes(d, "dia"), noite = nomes(d, "noite");
        return { dia: rotuloDia(d), turno_dia: dia.length ? `${dia.length}: ${dia.join(", ")}` : "ninguém marcado", noite: noite.length ? `${noite.length}: ${noite.join(", ")}` : "ninguém marcado" };
      }),
      noites_10: s.porNoite.map((n) => ({
        noite: rotuloDia(n.data),
        arrecadado: n.arrecadado,
        casa_pct: n.pct,
        casa_valor: r2(n.custo),
        dividido: n.pool,
        pessoas_na_divisao: n.presentes,
        por_pessoa: r2(n.unit),
        pago_no_acerto_da_semana: rotuloSemana(n.pagar_em),
        veio_do: n.origem === "caixa" ? "caixa" : "digitado",
      })),
      obs: s.porNoite.some((n) => n.presentes === 0 && n.pool > 0)
        ? "Noite com 10% e ninguém marcado pra receber: falta marcar a presença da noite."
        : "Por pessoa = dividido ÷ pessoas (peso 1); os centavos que sobram vão pra alguns.",
    };
  },
};

const acertoSemana: Ferramenta = {
  nome: "acerto_da_semana",
  descricao:
    "Acerto da semana da tela Semana e 10%: total de diárias (só de quem é free; CLT só recebe o 'free' fora da escala), 10% (das noites pagas neste acerto, em geral as da semana anterior), extras e descontos, por turno e por pessoa (nome, dias, noites e valores), quanto já foi lançado no contas a pagar, quanto falta lançar e diferenças a lançar; mais adiantamentos e fiado em aberto de cada um (que podem sair do valor em mãos). " +
    "Use para 'quanto vai dar o acerto desta semana?', 'quanto o João recebe?', 'já lancei a semana?', 'quanto falta lançar?'. " +
    "Recebe um dia qualquer da semana; sem data, a semana de hoje. Não traz dados bancários.",
  telas: ["/colaboradores/semana"],
  parametros: {
    type: "object",
    properties: {
      data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Um dia da semana do acerto, AAAA-MM-DD. Sem ele: semana de hoje." },
      nome: { type: "string", minLength: 2, description: "Opcional: só a pessoa com esse nome (pelo menos 2 letras)." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const segunda = semanaPedida(args, ctx);
    const filtro = typeof args.nome === "string" && args.nome.trim() ? args.nome.trim().toLocaleLowerCase("pt-BR") : null;
    if (filtro !== null && filtro.length < 2) throw new Error("Pra buscar pelo nome, use pelo menos 2 letras.");
    const s = await calcularSemana(db, ctx, segunda);
    const sum = <T,>(l: T[], f: (x: T) => number) => r2(l.reduce((a, x) => a + f(x), 0));
    const pp = s.porPessoa;
    const totalPool = sum(s.noitesPagas, (n) => n.pool);
    const totalDez = sum(pp, (x) => x.dez10);
    const aLancar = pp.filter((x) => x.total > 0.005 && !s.pagoDe.has(x.p.id));
    const diferencas = pp.filter((x) => s.pagoDe.has(x.p.id) && x.total - s.pagoDe.get(x.p.id)!.valor > 0.005);
    // Lançado pra quem hoje não aparece na grade (esporádico sem presença marcada): a tela não lista, mas o dinheiro saiu.
    const naGrade = new Set(pp.map((x) => x.p.id));
    const foraDaGrade = [...s.pagoDe].filter(([id]) => !naGrade.has(id)).map(([id, v]) => ({ nome: s.nomeDe.get(id) ?? "(sem cadastro ativo)", valor: v.valor }));
    const linhas = pp
      .filter((x) => x.total > 0.005 || s.pagoDe.has(x.p.id))
      .filter((x) => !filtro || x.p.nome.toLocaleLowerCase("pt-BR").includes(filtro))
      .sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"))
      .map((x) => {
        const pago = s.pagoDe.get(x.p.id);
        const o: Record<string, unknown> = { nome: x.p.nome, vinculo: x.vinculo, dias: x.nDias, noites: x.nNoites, diarias: r2(x.diarias), dez: r2(x.dez10) };
        if (x.extra) o.extra = x.extra;
        if (x.descontoSem) o.desconto = r2(x.descontoSem);
        o.total = r2(x.total);
        o.situacao = !pago ? (x.total > 0.005 ? "a lançar" : "—")
          : x.total - pago.valor > 0.005 ? `lançado ${r2(pago.valor)}, falta a diferença ${r2(x.total - pago.valor)}` : "lançado";
        if (pago?.desconto) o.descontado_no_lancamento = pago.desconto;
        const ad = s.adiantDe.get(x.p.id), fi = s.fiadoDe.get(x.p.id);
        if (ad) o.adiantamento_aberto = r2(ad);
        if (fi) o.fiado_aberto = r2(fi);
        return o;
      });
    if (filtro && !linhas.length) {
      const naSemana = pp.find((x) => x.p.nome.toLocaleLowerCase("pt-BR").includes(filtro));
      return { semana: rotuloSemana(segunda), aviso: naSemana ? `${naSemana.p.nome} não tem nada a receber nesta semana.` : "Ninguém com esse nome na semana (só aparecem colaboradores ativos)." };
    }
    return {
      semana: rotuloSemana(segunda),
      totais: {
        diarias: sum(pp, (x) => x.diarias),
        dez: totalDez,
        extras: sum(pp, (x) => x.extra),
        descontos: sum(pp, (x) => x.descontoSem),
        total: r2(sum(pp, (x) => x.diarias) + totalDez + sum(pp, (x) => x.extra) - sum(pp, (x) => x.descontoSem)),
        turno_dia: { presencas: pp.reduce((a, x) => a + x.nDias, 0), valor: r2(sum(pp, (x) => x.diariasDia) + sum(pp, (x) => x.extraDia)) },
        turno_noite: { presencas: pp.reduce((a, x) => a + x.nNoites, 0), diarias: sum(pp, (x) => x.diariasNoite), dez: totalDez, extras: sum(pp, (x) => x.extraNoite) },
        noites_10_neste_acerto: s.noitesPagas.map((n) => rotuloDia(n.data)).join(", ") || "nenhuma",
        ...(Math.abs(totalPool - totalDez) > 0.01 ? { dez_sem_ninguem_marcado: r2(totalPool - totalDez) } : {}),
      },
      lancamento: {
        ja_lancado: { pessoas: s.pagoDe.size, valor: r2([...s.pagoDe.values()].reduce((a, v) => a + v.valor, 0)) },
        falta_lancar: { pessoas: aLancar.length, valor: sum(aLancar, (x) => x.total) },
        diferencas_a_lancar: diferencas.map((x) => ({ nome: x.p.nome, valor: r2(x.total - s.pagoDe.get(x.p.id)!.valor) })),
        ...(foraDaGrade.length ? { lancado_sem_presenca_na_semana: foraDaGrade } : {}),
        adiantamentos_abertos: r2([...s.adiantDe.values()].reduce((a, v) => a + v, 0)),
      },
      pessoas: linhas.slice(0, 40),
      ...(linhas.length > 40 ? { obs: `Mais ${linhas.length - 40} pessoas não listadas; peça por nome.` } : {}),
    };
  },
};

// ======================= FOLGAS =======================

type PedidoFolga = { id: number; funcionario_id: number; data: string; status: string; grupo_alvo: string | null; criado_em: string | null };
type FuncFolga = Pick<Funcionario, "id" | "nome" | "grupo" | "grupo2" | "funcao" | "ativo">;

function turnoDaFolga(p: PedidoFolga, f: FuncFolga | undefined) {
  if (!f) return "";
  const grupos = gruposDe(f as Funcionario);
  if (p.grupo_alvo) return `${GRUPOS[p.grupo_alvo as GrupoKey]?.nome ?? p.grupo_alvo}, ${(TURNO[p.grupo_alvo] ?? "").toLowerCase()}`;
  if (grupos.length > 1) return "dia inteiro";
  return `${GRUPOS[f.grupo]?.nome ?? f.grupo}, ${(TURNO[f.grupo] ?? "").toLowerCase()}`;
}

const folgasPeriodo: Ferramenta = {
  nome: "folgas_do_periodo",
  descricao:
    "Folgas da equipe (tela Folgas): para cada dia do período, quem está de folga APROVADA (nome, grupo e turno), e os pedidos de folga que ainda esperam resposta (nome, data, turno e há quanto tempo pediu). " +
    "Use para 'quem está de folga sábado?', 'quem folga semana que vem?', 'tem pedido de folga esperando?', 'quando a Ana folga este mês?'. " +
    "Aceita datas futuras (até 1 ano) e passadas; no máximo 62 dias por consulta. Sem datas: hoje. Pode filtrar por nome.",
  telas: ["/folgas"],
  parametros: {
    type: "object",
    properties: {
      de: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Primeiro dia, AAAA-MM-DD. Sem ele: hoje." },
      ate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Último dia, AAAA-MM-DD. Sem ele: o mesmo dia do início." },
      nome: { type: "string", minLength: 2, description: "Opcional: só as folgas de quem tem esse nome (pelo menos 2 letras)." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    // Folga é quase sempre no futuro: o limite de "hoje" do periodo() vira hoje + 1 ano.
    const deTxt = typeof args.de === "string" && DATA.test(args.de) ? args.de : ctx.hoje;
    const { de, ate } = periodo({ de: deTxt, ate: args.ate }, { ...ctx, hoje: somarDias(ctx.hoje, 366) }, 62);
    const pat = busca(args);
    let idsNome: number[] | null = null;
    if (pat) {
      const { data } = await db.from("folgas_funcionarios").select("id").eq("empresa_id", ctx.empresaId).ilike("nome", pat).limit(20);
      idsNome = ((data as { id: number }[] | null) ?? []).map((f) => f.id);
      if (!idsNome.length) return { periodo: { de, ate }, aviso: "Ninguém com esse nome nas folgas." };
    }
    const cols = "id, funcionario_id, data, status, grupo_alvo, criado_em";
    const pedidos = (opcoes?: { count: "exact" }) => {
      const q = db.from("folgas_pedidos").select(cols, opcoes).eq("empresa_id", ctx.empresaId);
      return idsNome ? q.in("funcionario_id", idsNome) : q;
    };
    const [noPeriodo, { data: pend, count: nPend }] = await Promise.all([
      buscarTodas<PedidoFolga>((a, b) => pedidos().gte("data", de).lte("data", ate).neq("status", "Negado").order("data").order("id").range(a, b), 5000),
      pedidos({ count: "exact" }).eq("status", "Pendente").order("data").order("id").limit(20),
    ]);
    const pendentes = (pend as PedidoFolga[] | null) ?? [];
    const ids = [...new Set([...noPeriodo, ...pendentes].map((p) => p.funcionario_id))];
    const { data: funcs } = ids.length
      ? await db.from("folgas_funcionarios").select("id, nome, grupo, grupo2, funcao, ativo").in("id", ids)
      : { data: [] as FuncFolga[] };
    const byId = new Map(((funcs as FuncFolga[] | null) ?? []).map((f) => [f.id, f]));

    const porDia = new Map<string, string[]>();
    const pendNoPeriodo: string[] = [];
    for (const p of noPeriodo) {
      const f = byId.get(p.funcionario_id);
      const txt = `${f?.nome ?? "?"} (${turnoDaFolga(p, f)})`;
      if (p.status === "Aprovado") porDia.set(p.data, [...(porDia.get(p.data) ?? []), txt]);
    }
    const dias = [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, l]) => ({ dia: rotuloDia(d), de_folga: l.join("; ") }));
    for (const p of pendentes) if (p.data >= de && p.data <= ate) pendNoPeriodo.push(p.data);
    return {
      periodo: { de, ate },
      folgas_aprovadas: dias.length ? dias.slice(0, 40) : "Ninguém de folga aprovada no período.",
      pedidos_esperando_resposta: {
        total: nPend ?? pendentes.length,
        no_periodo: pendNoPeriodo.length,
        lista: pendentes.map((p) => {
          const f = byId.get(p.funcionario_id);
          return { nome: f?.nome ?? "?", dia: rotuloDia(p.data), turno: turnoDaFolga(p, f), pediu: haQuantoTempo(p.criado_em, ctx.hoje) || "—", ...(p.data < ctx.hoje ? { obs: "data já passou" } : {}) };
        }),
      },
    };
  },
};

// ======================= PONTO =======================

const pontoAtrasos: Ferramenta = {
  nome: "ponto_atrasos_e_faltas",
  descricao:
    "Relógio de ponto (quem bate ponto, carteira assinada): por pessoa no período, dias trabalhados, faltas (dias sem batida e sem justificativa, com as datas), quantos dias chegou atrasado e o total de atraso, falta e atraso somados, hora extra, batidas faltando e justificativas (atestado, férias...). Mesmo cálculo do espelho e dos relatórios de ponto. " +
    "Use para 'quem faltou essa semana?', 'a Maria atrasou quanto este mês?', 'quantas horas extras o Pedro fez?'. Com nome, traz também o detalhe dos dias com problema. " +
    "Período de no máximo 62 dias, até hoje (o ciclo da folha vai do dia 21 ao 20). Tempos no formato 2h15.",
  telas: ["/colaboradores/ponto"],
  parametros: {
    type: "object",
    properties: {
      de: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Primeiro dia, AAAA-MM-DD. Sem ele: hoje." },
      ate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Último dia, AAAA-MM-DD (no máximo hoje). Sem ele: o mesmo dia do início." },
      nome: { type: "string", minLength: 2, description: "Opcional: só a pessoa com esse nome (pelo menos 2 letras)." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const { de, ate } = periodo(args, ctx, 62);
    const pat = busca(args);
    let espelhos: EspelhoPessoa[];
    if (pat) {
      const { data } = await db.from("colaboradores").select("id").eq("empresa_id", ctx.empresaId).eq("bate_ponto", true).ilike("nome", pat).order("nome").limit(3);
      const ids = ((data as { id: string }[] | null) ?? []).map((c) => c.id);
      if (!ids.length) return { periodo: { de, ate }, aviso: "Ninguém com esse nome bate ponto." };
      espelhos = (await Promise.all(ids.map((id) => espelhoDaPessoa(db, id, de, ate)))).filter((e): e is EspelhoPessoa => !!e);
    } else {
      espelhos = await espelhosDoPeriodo(db, de, ate);
    }
    const detalhar = espelhos.length === 1;
    const pessoas = espelhos.map((e) => {
      const t = e.totais;
      const faltas = e.linhas.filter((l) => l.situacao === "falta").map((l) => rotuloDia(l.dia));
      const comAtraso = e.linhas.filter((l) => l.atrasoMin > 0);
      const justificados: Record<string, number> = {};
      for (const l of e.linhas) {
        if (l.situacao !== "atestado" && l.situacao !== "abono") continue;
        const n = (l.justificativa ?? (l.situacao === "atestado" ? "Atestado" : "Abonado")).split(" · ")[0];
        justificados[n] = (justificados[n] ?? 0) + 1;
      }
      const o: Record<string, unknown> = {
        nome: e.pessoa.nome,
        dias_trabalhados: t.diasTrabalhados,
        faltas: t.faltas,
        ...(faltas.length ? { dias_de_falta: faltas.slice(0, 20).join(", ") } : {}),
        dias_com_atraso: comAtraso.length,
        atraso: duracao(t.atraso),
        falta_e_atraso: duracao(t.faltante),
        extra: duracao(t.extra),
        batidas_faltando: t.incompletos,
        ...(Object.keys(justificados).length ? { justificados } : {}),
      };
      if (detalhar) {
        o.dias_com_problema = e.linhas
          .filter((l) => l.situacao === "falta" || l.situacao === "incompleto" || l.atrasoMin > 0 || (l.faltaMin > 0 && l.situacao === "ok"))
          .slice(0, 25)
          .map((l) => ({ dia: rotuloDia(l.dia), situacao: l.situacao, horario: l.horario || "—", batidas: l.batidas.map(hhmm).join(" ") || "—", atraso: duracao(l.atrasoMin), falta: duracao(l.faltaMin) }));
      }
      return o;
    });
    return {
      periodo: { de, ate },
      ...(ate >= ctx.hoje ? { aviso: "O período inclui hoje: os números ainda vão mudar." } : {}),
      pessoas: pessoas.length ? pessoas.slice(0, 30) : "Ninguém bate ponto nesse período.",
    };
  },
};

// ======================= COLABORADOR =======================

type FichaTrabalho = {
  id: string; nome: string; ativo: boolean; funcao: string | null; turno: string | null; vinculo: string | null; vinculo_noite: string | null;
  bate_ponto: boolean | null; recebe_10: boolean | null; peso_10: number | null; esporadico: boolean | null;
  dias_dia: number[] | null; dias_noite: number[] | null; admissao: string | null; desligado_em: string | null;
  faz_contagem: boolean | null; faz_etiquetas: boolean | null; faz_contas: boolean | null; faz_garcom: boolean | null;
  faz_cardapio: boolean | null; faz_cofre: boolean | null; faz_recepcao: boolean | null; checklist_setores: string[] | null;
};
const TURNO_NOME: Record<string, string> = { dia: "dia", noite: "noite", ambos: "dia e noite", proprietario: "proprietário" };
const diasTxt = (l: number[] | null | undefined) => ((l ?? []).length ? [...(l ?? [])].sort().map((d) => DIAS_NOME[d]).join(", ") : null);

const buscarColaborador: Ferramenta = {
  nome: "buscar_colaborador",
  descricao:
    "Ficha de trabalho de um colaborador pelo nome (tela Colaboradores): função, turno, escala (dias de dia e de noite), vínculo (CLT ou free, por turno), se bate ponto, se recebe 10% (e o peso), se é esporádico, admissão, grupo nas folgas, horário do ponto e o que pode fazer no app da equipe (contagem, etiquetas, contas, garçom, cardápio, cofre, recepção, checklists). " +
    "Use para 'o Lucas é CLT?', 'a Bia recebe 10%?', 'quem faz contagem?', 'em que dias o Rui trabalha?'. Não traz dados pessoais nem valores de salário. Até 8 pessoas por busca.",
  telas: ["/colaboradores"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, description: "Nome ou parte dele (pelo menos 2 letras)." },
      incluir_desligados: { type: "boolean", description: "Opcional: true pra incluir quem já saiu. Padrão: só os ativos." },
    },
    required: ["nome"],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const pat = busca(args, "nome", true) as string;
    let q = db.from("colaboradores")
      .select("id, nome, ativo, funcao, turno, vinculo, vinculo_noite, bate_ponto, recebe_10, peso_10, esporadico, dias_dia, dias_noite, admissao, desligado_em, faz_contagem, faz_etiquetas, faz_contas, faz_garcom, faz_cardapio, faz_cofre, faz_recepcao, checklist_setores")
      .eq("empresa_id", ctx.empresaId).ilike("nome", pat).order("ativo", { ascending: false }).order("nome").limit(8);
    if (args.incluir_desligados !== true) q = q.eq("ativo", true);
    const { data, error } = await q;
    if (error) throw new Error("Não consegui ler os colaboradores agora. Confira a internet e tente de novo.");
    const fichas = (data as FichaTrabalho[] | null) ?? [];
    if (!fichas.length) return { aviso: args.incluir_desligados === true ? "Ninguém com esse nome." : "Ninguém ativo com esse nome (peça incluindo desligados, se for o caso)." };
    const ids = fichas.map((f) => f.id);
    const setores = [...new Set(fichas.flatMap((f) => f.checklist_setores ?? []))];
    const [{ data: folgas }, { data: vincs }, { data: hors }, { data: sets }] = await Promise.all([
      db.from("folgas_funcionarios").select("colaborador_id, grupo, grupo2, gerente").in("colaborador_id", ids).eq("ativo", true),
      db.from("colaborador_horarios").select("colaborador_id, horario_id, de, ate").in("colaborador_id", ids).lte("de", ctx.hoje),
      db.from("ponto_horarios").select("id, nome").eq("empresa_id", ctx.empresaId),
      setores.length ? db.from("checklist_setores").select("id, nome").in("id", setores) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ]);
    const folgaDe = new Map(((folgas as { colaborador_id: string; grupo: GrupoKey; grupo2: GrupoKey | null; gerente: boolean }[] | null) ?? []).map((f) => [f.colaborador_id, f]));
    const nomeHorario = new Map(((hors as { id: string; nome: string }[] | null) ?? []).map((h) => [h.id, h.nome]));
    // Igual à tela: o vínculo mais recente que ainda vale hoje.
    const horarioHoje = new Map<string, string>();
    for (const v of ((vincs as { colaborador_id: string; horario_id: string; de: string; ate: string | null }[] | null) ?? []).sort((a, b) => String(a.de).localeCompare(String(b.de)))) {
      if (!v.ate || String(v.ate).slice(0, 10) >= ctx.hoje) horarioHoje.set(v.colaborador_id, v.horario_id);
    }
    const nomeSetor = new Map(((sets as { id: string; nome: string }[] | null) ?? []).map((s) => [s.id, s.nome]));
    return {
      pessoas: fichas.map((c) => {
        const vDia = vinculoDoTurno(c, "dia") === "clt" ? "CLT" : "free";
        const vNoite = vinculoDoTurno(c, "noite") === "clt" ? "CLT" : "free";
        const vinculo = c.turno === "proprietario" ? "sócio" : c.turno === "ambos" && vDia !== vNoite ? `${vDia} de dia, ${vNoite} de noite` : c.turno === "noite" ? vNoite : vDia;
        const app = [
          c.faz_contagem && "contagem", c.faz_etiquetas && "etiquetas", c.faz_contas && "contas a pagar", c.faz_garcom && "garçom",
          c.faz_cardapio && "cardápio do dia", c.faz_cofre && "cofre", c.faz_recepcao && "recepção",
        ].filter(Boolean) as string[];
        const ck = (c.checklist_setores ?? []).map((id) => nomeSetor.get(id) ?? "setor").join(", ");
        const f = folgaDe.get(c.id);
        const h = horarioHoje.get(c.id);
        return {
          nome: c.nome,
          ...(c.ativo ? {} : { desligado: c.desligado_em ? String(c.desligado_em).slice(0, 10) : "sim" }),
          funcao: c.funcao ?? "—",
          turno: TURNO_NOME[c.turno ?? ""] ?? "—",
          vinculo,
          bate_ponto: !!c.bate_ponto,
          ...(diasTxt(c.dias_dia) ? { escala_dia: diasTxt(c.dias_dia) } : {}),
          ...(diasTxt(c.dias_noite) ? { escala_noite: diasTxt(c.dias_noite) } : {}),
          recebe_10: c.recebe_10 ? (Number(c.peso_10) && Number(c.peso_10) !== 1 ? `sim (peso ${c.peso_10})` : "sim") : "não",
          ...(c.esporadico ? { esporadico: true } : {}),
          ...(c.admissao ? { admissao: String(c.admissao).slice(0, 10) } : {}),
          ...(f ? { grupo_folgas: [f.grupo, f.grupo2].filter(Boolean).map((g) => GRUPOS[g as GrupoKey]?.nome ?? g).join(" + ") + (f.gerente ? " (gerente)" : "") } : {}),
          ...(h ? { horario_ponto: nomeHorario.get(h) ?? "—" } : {}),
          app_da_equipe: [...app, ...(ck ? [`checklists: ${ck}`] : [])].join(", ") || "nada além do básico",
        };
      }),
    };
  },
};

// ======================= FIADO (COMPRAS INTERNAS) =======================

const fiadoAberto: Ferramenta = {
  nome: "fiado_em_aberto",
  descricao:
    "Compras internas (fiado da equipe, tela Compras internas): quanto cada pessoa deve em aberto, quantas compras e a mais antiga; com nome, também a lista das compras em aberto (data, item, valor). " +
    "Use para 'quanto a equipe deve de fiado?', 'quanto o Paulo está devendo?', 'quem mais deve?'. Mostra só o que está em aberto (o pago não entra). Valores em reais.",
  telas: ["/retiradas"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, description: "Opcional: só quem tem esse nome (pelo menos 2 letras)." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const pat = busca(args);
    type Ret = { id: string; colaborador_id: string | null; nome: string; item: string | null; valor: number; data: string };
    const rets = await buscarTodas<Ret>((a, b) => {
      let q = db.from("retiradas").select("id, colaborador_id, nome, item, valor, data").eq("empresa_id", ctx.empresaId).eq("status", "aberto");
      if (pat) q = q.ilike("nome", pat);
      return q.order("data").order("id").range(a, b);
    });
    // Mesmo agrupamento da tela: pela pessoa ligada, ou pelo nome escrito.
    const m = new Map<string, { nome: string; aberto: number; compras: number; desde: string }>();
    for (const r of rets) {
      const k = r.colaborador_id ?? `nome:${r.nome}`;
      const cur = m.get(k) ?? { nome: r.nome, aberto: 0, compras: 0, desde: String(r.data).slice(0, 10) };
      cur.aberto += Number(r.valor) || 0;
      cur.compras++;
      m.set(k, cur);
    }
    const pessoas = [...m.values()].sort((a, b) => b.aberto - a.aberto);
    if (!pessoas.length) return { aviso: pat ? "Ninguém com esse nome tem fiado em aberto." : "Nenhum fiado em aberto." };
    const fmtD = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    return {
      total_em_aberto: r2(rets.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
      pessoas_devendo: pessoas.length,
      pessoas: pessoas.slice(0, 30).map((p) => ({ nome: p.nome, em_aberto: r2(p.aberto), compras: p.compras, desde: fmtD(p.desde) })),
      ...(pessoas.length > 30 ? { obs: `Mais ${pessoas.length - 30} pessoas com valor menor.` } : {}),
      ...(pat && pessoas.length <= 2
        ? { compras: rets.slice(-25).map((r) => ({ nome: primeiroNome(r.nome), data: fmtD(String(r.data).slice(0, 10)), item: r.item ?? "—", valor: r2(r.valor) })) }
        : {}),
    };
  },
};

export const FERRAMENTAS_EQUIPE: Ferramenta[] = [folgasPeriodo, semanaPresenca10, acertoSemana, pontoAtrasos, buscarColaborador, fiadoAberto];
