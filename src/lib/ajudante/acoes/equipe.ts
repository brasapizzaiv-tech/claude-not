// AÇÕES do Ajudante sobre a EQUIPE (etapa 3): responder pedido de folga,
// marcar/tirar presença e lançar extra/desconto na Semana e 10%.
//
// `preparar` só LÊ (cliente da sessão) e monta o cartão de confirmação.
// `executar` chama a MESMA server action da tela, com os mesmos argumentos:
//  - folgas: decidirPedido (src/app/(painel)/folgas/actions.ts, como em gestao-folgas.tsx);
//  - semana: marcarPresenca e salvarExtra (src/app/(painel)/colaboradores/semana/actions.ts,
//    como em semana.tsx).
// Nada de dinheiro de caixa/contas nem dado pessoal (CPF, telefone, endereço...).

import { decidirPedido } from "@/app/(painel)/folgas/actions";
import { marcarPresenca, salvarExtra } from "@/app/(painel)/colaboradores/semana/actions";
import { createClient } from "@/lib/supabase/server";
import { brl, rotuloSemana, segundaDe, vinculoDoTurno } from "@/lib/equipe";
import {
  GRUPOS, TURNO, alvosDe, contar, gruposDe, haQuantoTempo, limiteDe,
  type Ajustes, type Funcionario, type GrupoKey, type Limites, type Pedido,
} from "@/lib/folgas";
import type { ContextoFerramenta, Db } from "../ferramentas/tipos";
import { dataCurta, texto, type Acao } from "./tipos";

// ======================= AJUDANTES =======================

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ERRO_LER = "Não consegui ler os dados agora. Confira a internet e tente de novo.";
const MAX_VALOR = 3000;

/** Dias entre duas datas AAAA-MM-DD (b − a). */
const difDias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Data AAAA-MM-DD dos argumentos: formato, dia que existe e dentro da janela permitida. */
function dataArg(
  args: Record<string, unknown>,
  campo: string,
  ctx: ContextoFerramenta,
  janela: { passado: number; futuro: number },
): string | null {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (!v) return null;
  if (!DATA.test(v)) throw new Error("Data inválida: use AAAA-MM-DD (ex.: 2026-11-22).");
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Error(`A data ${v} não existe no calendário.`);
  const dif = difDias(ctx.hoje, v);
  if (dif < -janela.passado) throw new Error(`Data muito antiga: dá pra mexer só até ${janela.passado} dias atrás.`);
  if (dif > janela.futuro) throw new Error(`Data muito longe: dá pra mexer só até ${janela.futuro} dias pra frente.`);
  return v;
}

/** Texto opcional, aparado e com tamanho máximo. */
function textoOpcional(args: Record<string, unknown>, campo: string, maximo: number): string {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim().replace(/\s+/g, " ") : "";
  if (v.length > maximo) throw new Error(`Texto longo demais em ${campo.replace(/_/g, " ")}: no máximo ${maximo} letras.`);
  return v;
}

function turnoArg(args: Record<string, unknown>, obrigatorio: boolean): "dia" | "noite" | null {
  const v = args.turno;
  if (v === "dia" || v === "noite") return v;
  if (v != null && v !== "") throw new Error('Turno inválido: use "dia" ou "noite".');
  if (obrigatorio) throw new Error("Falta dizer o turno: dia ou noite.");
  return null;
}

/** Tira acento e caixa, pra comparar nomes. */
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const escaparIlike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Acha UMA pessoa ativa pelo nome (busca no banco com ilike). Nome igual ganha;
 * se sobra mais de uma, ou nenhuma, lança Error com até 5 nomes parecidos.
 */
async function acharPessoa<T extends { nome: string }>(
  db: Db,
  ctx: ContextoFerramenta,
  tabela: "colaboradores" | "folgas_funcionarios",
  colunas: string,
  nomeTxt: string,
): Promise<T> {
  const termo = nomeTxt.trim().replace(/\s+/g, " ").slice(0, 60);
  if (termo.length < 2) throw new Error("Diga o nome da pessoa (pelo menos 2 letras).");
  const consulta = (pat: string) =>
    db.from(tabela).select(colunas).eq("empresa_id", ctx.empresaId).eq("ativo", true).ilike("nome", pat).order("nome").limit(20);

  const { data, error } = await consulta(`%${escaparIlike(termo)}%`);
  if (error) throw new Error(ERRO_LER);
  let lista = (data as unknown as T[] | null) ?? [];

  if (!lista.length) {
    // Sem acento ("Joao" × "João"): vogais e ç viram curinga no banco e a conferência é feita aqui.
    const solto = `%${escaparIlike(termo).replace(/[aeioucáàâãéêíóôõúüç]/gi, "_")}%`;
    const { data: d2 } = await consulta(solto);
    const achados = (d2 as unknown as T[] | null) ?? [];
    lista = achados.filter((p) => normal(p.nome).includes(normal(termo)));
    if (!lista.length) {
      let parecidos = achados.map((p) => p.nome);
      if (!parecidos.length) {
        const inicio = normal(termo).split(" ")[0].slice(0, 3);
        const { data: d3 } = inicio.length >= 2 ? await consulta(`%${escaparIlike(inicio)}%`) : { data: [] };
        parecidos = ((d3 as unknown as T[] | null) ?? []).map((p) => p.nome);
      }
      throw new Error(
        parecidos.length
          ? `Não achei ninguém ativo chamado "${termo}". Parecidos: ${parecidos.slice(0, 5).join(", ")}. Qual é?`
          : `Não achei ninguém ativo chamado "${termo}". Confira o nome.`,
      );
    }
  }
  if (lista.length === 1) return lista[0];

  const alvo = normal(termo);
  const igual = lista.filter((p) => normal(p.nome) === alvo);
  if (igual.length === 1) return igual[0];
  // "Ana" com "Ana Paula" e "Mariana": vale quem tem a(s) PALAVRA(S) inteira(s), se for só um.
  const palavra = lista.filter((p) => ` ${normal(p.nome)} `.includes(` ${alvo} `));
  if (palavra.length === 1) return palavra[0];
  const nomes = lista.slice(0, 5).map((p) => p.nome).join(", ");
  throw new Error(`Achei mais de uma pessoa com "${termo}": ${nomes}${lista.length > 5 ? "..." : ""}. Qual delas?`);
}

/** Chama a server action e transforma {erro}/{ok:false}/exceção em Error com frase. */
async function chamar<R extends { ok?: boolean; erro?: string; mensagem?: string }>(fn: () => Promise<R>): Promise<R> {
  let r: R;
  try {
    r = await fn();
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "";
    throw new Error(msg || "Não deu certo. Confira a internet e tente de novo.");
  }
  if (r?.erro) throw new Error(r.erro);
  if (r?.ok === false) throw new Error(r.mensagem || "Não deu certo. Tente de novo.");
  return r;
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const turnoTxt = (t: "dia" | "noite") => (t === "dia" ? "turno do dia" : "turno da noite");

// ======================= FOLGAS =======================

type FuncFolga = { id: number; nome: string; grupo: GrupoKey; grupo2: GrupoKey | null; gerente: boolean; ativo: boolean };
type PedidoLido = { id: number; funcionario_id: number; data: string; status: "Pendente" | "Aprovado" | "Negado"; grupo_alvo: string | null; motivo: string | null; criado_em: string | null };

function turnoDoPedido(p: { grupo_alvo: string | null }, f: FuncFolga): string {
  if (p.grupo_alvo) return `${GRUPOS[p.grupo_alvo as GrupoKey]?.nome ?? p.grupo_alvo}, ${(TURNO[p.grupo_alvo] ?? "").toLowerCase()}`;
  const grupos = gruposDe(f as unknown as Funcionario);
  if (grupos.length > 1) return "dia inteiro";
  return `${GRUPOS[f.grupo]?.nome ?? f.grupo}, ${(TURNO[f.grupo] ?? "").toLowerCase()}`;
}

/** A mesma conta da tela: o grupo mais apertado do pedido e quantas folgas já aprovadas nele. */
async function linhaDoLimite(db: Db, ctx: ContextoFerramenta, p: PedidoLido, f: FuncFolga): Promise<string[]> {
  const [{ data: lims }, { data: ajs }, { data: doDia }, { data: trava }] = await Promise.all([
    db.from("folgas_limites").select("grupo, dia_semana, limite").eq("empresa_id", ctx.empresaId),
    db.from("folgas_ajustes").select("data, grupo, limite").eq("empresa_id", ctx.empresaId).eq("data", p.data),
    db.from("folgas_pedidos").select("id, funcionario_id, data, status, grupo_alvo").eq("empresa_id", ctx.empresaId).eq("data", p.data).neq("status", "Negado").limit(500),
    db.from("folgas_bloqueios").select("motivo").eq("empresa_id", ctx.empresaId).eq("data", p.data).maybeSingle(),
  ]);
  const limites: Limites = {};
  for (const l of (lims as { grupo: string; dia_semana: number; limite: number | null }[] | null) ?? []) (limites[l.grupo] ??= {})[l.dia_semana] = l.limite;
  const ajustes: Ajustes = {};
  for (const a of (ajs as { data: string; grupo: string; limite: number }[] | null) ?? []) (ajustes[String(a.data).slice(0, 10)] ??= {})[a.grupo] = a.limite;
  const pedidos = ((doDia as Pedido[] | null) ?? []).map((x) => ({ ...x, data: String(x.data).slice(0, 10) }));
  const ids = [...new Set([...pedidos.map((x) => x.funcionario_id), f.id])];
  const { data: funcs } = await db.from("folgas_funcionarios").select("id, grupo, grupo2").in("id", ids);
  const byId = new Map(((funcs as Funcionario[] | null) ?? []).map((x) => [x.id, x]));
  byId.set(f.id, f as unknown as Funcionario);

  const pedido = p as unknown as Pedido;
  let lim: number | null = null;
  let aprov = 0;
  let apertado: GrupoKey = alvosDe(pedido, byId)[0] || f.grupo;
  for (const g of alvosDe(pedido, byId)) {
    const l = limiteDe(p.data, g, limites, ajustes);
    if (l === null || l === undefined) continue;
    const a = contar(pedidos, p.data, g, false, byId);
    if (lim === null || l - a < lim - aprov) { lim = l; aprov = a; apertado = g; }
  }
  const linhas: string[] = [];
  if (lim === null) linhas.push("Limite: o grupo não tem operação nesse dia.");
  else if (aprov >= lim) linhas.push(`ATENÇÃO: ${aprov} de ${lim} já aprovadas em ${GRUPOS[apertado].nome.toLowerCase()}. Aprovar passa do limite.`);
  else linhas.push(`Limite: ${aprov} de ${lim} já aprovadas em ${GRUPOS[apertado].nome.toLowerCase()}.`);
  const motivoTrava = (trava as { motivo: string } | null)?.motivo;
  if (motivoTrava) linhas.push(`Data travada pra folgas: ${motivoTrava}`);
  return linhas;
}

const responderFolga: Acao = {
  nome: "acao_responder_folga",
  descricao:
    "Aprova ou nega um pedido de folga que está ESPERANDO RESPOSTA (tela Folgas, botões Aprovar/Negar). " +
    "Precisa do nome da pessoa e da decisão. Se ela tiver só um pedido esperando, a data pode ficar de fora; se tiver vários, pergunte qual data. " +
    "Pra NEGAR, pergunte o motivo antes (a pessoa vai ler no app). Se a pessoa faz dois turnos e pediu os dois no mesmo dia, informe o turno. " +
    "Não serve pra lançar folga nova nem mudar uma já aprovada/negada. Nada acontece até a pessoa confirmar no cartão.",
  telas: ["/folgas"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, maxLength: 60, description: "Nome (ou parte) de quem pediu a folga." },
      decisao: { type: "string", enum: ["aprovar", "negar"], description: "aprovar ou negar." },
      data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Dia da folga pedida, AAAA-MM-DD. Opcional se ela só tem um pedido esperando." },
      turno: { type: "string", enum: ["dia", "noite"], description: "Opcional: só quando há dois pedidos da mesma pessoa no mesmo dia (um de dia e um de noite)." },
      motivo_negativa: { type: "string", maxLength: 200, description: "Obrigatório pra negar: o motivo que a pessoa vai ler." },
    },
    required: ["nome", "decisao"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const decisao = args.decisao;
    if (decisao !== "aprovar" && decisao !== "negar") throw new Error("Diga se é pra aprovar ou negar.");
    const aprovar = decisao === "aprovar";
    const motivo = textoOpcional(args, "motivo_negativa", 200);
    if (!aprovar && motivo.length < 3) throw new Error("Pra negar, preciso do motivo (a pessoa vai ler no app).");
    const data = dataArg(args, "data", ctx, { passado: 60, futuro: 400 });
    const turno = turnoArg(args, false);

    const f = await acharPessoa<FuncFolga>(db, ctx, "folgas_funcionarios", "id, nome, grupo, grupo2, gerente, ativo", texto(args, "nome", 2));
    const cols = "id, funcionario_id, data, status, grupo_alvo, motivo, criado_em";
    let q = db.from("folgas_pedidos").select(cols).eq("empresa_id", ctx.empresaId).eq("funcionario_id", f.id);
    q = data ? q.eq("data", data) : q.eq("status", "Pendente");
    const { data: rows, error } = await q.order("data").order("id").limit(30);
    if (error) throw new Error(ERRO_LER);
    const doPedido = ((rows as PedidoLido[] | null) ?? []).map((p) => ({ ...p, data: String(p.data).slice(0, 10) }));
    let pend = doPedido.filter((p) => p.status === "Pendente");
    if (turno) pend = pend.filter((p) => !p.grupo_alvo || (TURNO[p.grupo_alvo] ?? "").toLowerCase() === turno);

    if (!pend.length) {
      if (turno && doPedido.some((p) => p.status === "Pendente")) {
        throw new Error(`O pedido de ${f.nome} esperando resposta${data ? ` em ${dataCurta(data)}` : ""} não é do ${turnoTxt(turno)}.`);
      }
      if (data && doPedido.length) {
        const st = [...new Set(doPedido.map((p) => p.status.toLowerCase()))].join(" e ");
        throw new Error(`O pedido de ${f.nome} em ${dataCurta(data)} não está esperando resposta: já foi ${st}. Pra mudar, use a tela Folgas.`);
      }
      if (data) {
        const { data: outros } = await db.from("folgas_pedidos").select("data").eq("empresa_id", ctx.empresaId).eq("funcionario_id", f.id).eq("status", "Pendente").order("data").limit(5);
        const datas = ((outros as { data: string }[] | null) ?? []).map((o) => dataCurta(String(o.data).slice(0, 10)));
        throw new Error(`${f.nome} não pediu folga em ${dataCurta(data)}.${datas.length ? ` Pedidos esperando resposta: ${datas.join("; ")}.` : ""}`);
      }
      throw new Error(`${f.nome} não tem pedido de folga esperando resposta.`);
    }
    if (pend.length > 1) {
      const lista = pend.slice(0, 6).map((p) => `${dataCurta(p.data)} (${turnoDoPedido(p, f)})`).join("; ");
      throw new Error(`${f.nome} tem ${pend.length} pedidos esperando resposta: ${lista}. Diga qual${data ? " turno" : " data"}.`);
    }
    const p = pend[0];

    const detalhes = [
      `Pessoa: ${f.nome}`,
      `Folga: ${dataCurta(p.data)} · ${turnoDoPedido(p, f)}`,
    ];
    if (p.motivo) detalhes.push(`Motivo do pedido: ${p.motivo.slice(0, 120)}`);
    if (p.criado_em) detalhes.push(`Pediu: ${haQuantoTempo(p.criado_em, ctx.hoje) || dataCurta(String(p.criado_em).slice(0, 10))}`);
    if (aprovar) detalhes.push(...(await linhaDoLimite(db, ctx, p, f)));
    else detalhes.push(`Motivo da negativa (ela vai ler): ${motivo}`);
    if (p.data < ctx.hoje) detalhes.push("Obs.: essa data já passou.");

    return {
      resumo: aprovar
        ? `Aprovar a folga de ${f.nome} em ${dataCurta(p.data)}.`
        : `Negar a folga de ${f.nome} em ${dataCurta(p.data)}.`,
      detalhes,
      dados: { pedidoId: p.id, aprovar, motivo: aprovar ? "" : motivo, nome: f.nome, data: p.data },
    };
  },
  async executar(dados, ctx) {
    const pedidoId = Number(dados.pedidoId);
    const aprovar = dados.aprovar === true;
    const motivo = typeof dados.motivo === "string" ? dados.motivo : "";
    const nome = String(dados.nome ?? "");
    const data = String(dados.data ?? "");
    if (!Number.isInteger(pedidoId) || pedidoId <= 0 || !DATA.test(data)) throw new Error("Pedido inválido. Peça de novo.");
    // Alguém pode ter respondido pela tela enquanto o cartão esperava.
    const sessao = await createClient();
    const { data: atual } = await sessao.from("folgas_pedidos").select("status").eq("empresa_id", ctx.empresaId).eq("id", pedidoId).maybeSingle();
    const status = (atual as { status: string } | null)?.status;
    if (!status) throw new Error("Esse pedido de folga não existe mais.");
    if (status !== "Pendente") throw new Error(`Esse pedido já foi respondido (${status.toLowerCase()}). Nada mudou.`);
    await chamar(() => decidirPedido(pedidoId, aprovar, aprovar ? undefined : motivo));
    return `Folga de ${primeiroNome(nome)} em ${dataCurta(data)} ${aprovar ? "aprovada" : "negada"}.`;
  },
};

// ======================= SEMANA E 10% =======================

type Colab = {
  id: string;
  nome: string;
  turno: "dia" | "noite" | "ambos" | "proprietario" | null;
  vinculo: string | null;
  vinculo_noite: string | null;
  bate_ponto: boolean | null;
  esporadico: boolean | null;
  dias_dia: number[] | null;
  dias_noite: number[] | null;
};
const COLS_COLAB = "id, nome, turno, vinculo, vinculo_noite, bate_ponto, esporadico, dias_dia, dias_noite";

async function acharColaborador(db: Db, ctx: ContextoFerramenta, args: Record<string, unknown>): Promise<Colab> {
  const c = await acharPessoa<Colab>(db, ctx, "colaboradores", COLS_COLAB, texto(args, "nome", 2));
  if (c.turno === "proprietario") throw new Error(`${c.nome} está como proprietário(a): não entra na Semana e 10%.`);
  return c;
}

/** Semana já lançada no Contas a pagar pra essa pessoa? (mudança vira diferença a lançar na tela) */
async function semanaLancada(db: Db, ctx: ContextoFerramenta, segunda: string, colaboradorId: string): Promise<boolean> {
  const { data } = await db.from("semana_pagamentos").select("colaborador_id")
    .eq("empresa_id", ctx.empresaId).eq("segunda", segunda).eq("colaborador_id", colaboradorId)
    .not("lancamento_id", "is", null).limit(1);
  return ((data as unknown[] | null) ?? []).length > 0;
}
const AVISO_LANCADA = "ATENÇÃO: o acerto dessa semana já foi lançado no Contas a pagar pra essa pessoa; a diferença aparece na tela pra lançar.";

const marcarPresencaAcao: Acao = {
  nome: "acao_marcar_presenca",
  descricao:
    "Marca ou tira a presença de uma pessoa num dia, de DIA ou de NOITE, na Semana e 10% (o quadrinho de sol/lua da tela). " +
    "A presença gera a diária e, de noite, entra na divisão do 10%. Tirar a presença também faz o 'Preencher com a escala fixa' não trazer a pessoa de volta nesse dia. " +
    "Precisa de: nome, data, turno (dia ou noite: se não disserem, PERGUNTE) e se trabalhou (presente true) ou não (false). " +
    "Um dia/turno por vez. Nada acontece até a pessoa confirmar no cartão.",
  telas: ["/colaboradores"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, maxLength: 60, description: "Nome (ou parte) da pessoa." },
      data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Dia trabalhado, AAAA-MM-DD." },
      turno: { type: "string", enum: ["dia", "noite"], description: "dia ou noite." },
      presente: { type: "boolean", description: "true = marcar que trabalhou; false = tirar a presença." },
    },
    required: ["nome", "data", "turno", "presente"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const data = dataArg(args, "data", ctx, { passado: 62, futuro: 14 });
    if (!data) throw new Error("Falta a data (AAAA-MM-DD).");
    const turno = turnoArg(args, true) as "dia" | "noite";
    if (typeof args.presente !== "boolean") throw new Error("Diga se é pra marcar (trabalhou) ou tirar a presença.");
    const presente = args.presente;
    const c = await acharColaborador(db, ctx, args);

    const { data: ja, error } = await db.from("presencas").select("colaborador_id")
      .eq("empresa_id", ctx.empresaId).eq("colaborador_id", c.id).eq("data", data).eq("turno", turno).limit(1);
    if (error) throw new Error(ERRO_LER);
    const marcada = ((ja as unknown[] | null) ?? []).length > 0;
    if (presente && marcada) throw new Error(`${c.nome} já está marcado(a) de ${turno} em ${dataCurta(data)}. Nada a fazer.`);
    if (!presente && !marcada) throw new Error(`${c.nome} não está marcado(a) de ${turno} em ${dataCurta(data)}. Nada a tirar.`);

    const segunda = segundaDe(data);
    const detalhes = [
      `Pessoa: ${c.nome}`,
      `Dia: ${dataCurta(data)} · ${turnoTxt(turno)}`,
      `Semana: ${rotuloSemana(segunda)}`,
      presente ? "Vai marcar: trabalhou" : "Vai tirar a presença (e a escala fixa não traz de volta nesse dia)",
    ];
    if (presente) {
      if ((c.turno === "dia" && turno === "noite") || (c.turno === "noite" && turno === "dia")) detalhes.push(`Obs.: no cadastro ${primeiroNome(c.nome)} é só do ${turnoTxt(c.turno)}.`);
      const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
      const escala = turno === "dia" ? c.dias_dia : c.dias_noite;
      if (vinculoDoTurno(c, turno) === "clt" && !(escala ?? []).includes(dow)) detalhes.push("Obs.: fora da escala fixa; pra carteira assinada conta como free.");
      // Folga aprovada no mesmo dia (tela Folgas)?
      const { data: ff } = await db.from("folgas_funcionarios").select("id").eq("empresa_id", ctx.empresaId).eq("colaborador_id", c.id).limit(3);
      const idsFolga = ((ff as { id: number }[] | null) ?? []).map((x) => x.id);
      if (idsFolga.length) {
        const { data: fol } = await db.from("folgas_pedidos").select("id").eq("empresa_id", ctx.empresaId).in("funcionario_id", idsFolga).eq("data", data).eq("status", "Aprovado").limit(1);
        if (((fol as unknown[] | null) ?? []).length) detalhes.push("Obs.: tem folga aprovada nesse dia.");
      }
    }
    if (await semanaLancada(db, ctx, segunda, c.id)) detalhes.push(AVISO_LANCADA);

    return {
      resumo: presente
        ? `Marcar que ${c.nome} trabalhou de ${turno} em ${dataCurta(data)}.`
        : `Tirar a presença de ${c.nome} de ${turno} em ${dataCurta(data)}.`,
      detalhes,
      dados: { colaboradorId: c.id, nome: c.nome, data, turno, presente },
    };
  },
  async executar(dados) {
    const id = String(dados.colaboradorId ?? "");
    const data = String(dados.data ?? "");
    const turno = dados.turno === "dia" ? "dia" : dados.turno === "noite" ? "noite" : null;
    if (!id || !DATA.test(data) || !turno || typeof dados.presente !== "boolean") throw new Error("Pedido inválido. Peça de novo.");
    const presente = dados.presente;
    await chamar(() => marcarPresenca(id, data, turno, presente));
    const quem = primeiroNome(String(dados.nome ?? ""));
    return presente
      ? `Presença de ${quem} de ${turno} em ${dataCurta(data)} marcada.`
      : `Presença de ${quem} de ${turno} em ${dataCurta(data)} tirada.`;
  },
};

type ExtraLido = { valor: number | null; motivo: string | null; turno: string | null; desconto: number | null; desconto_motivo: string | null };
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const extraSemana: Acao = {
  nome: "acao_extra_semana",
  descricao:
    "Lança, troca ou zera o EXTRA (algo que a pessoa fez a mais, ex.: hora extra) ou o DESCONTO (ex.: atraso, quebra) da semana de uma pessoa na Semana e 10%, " +
    "como as colunas Extra e Desconto da tela. Cada pessoa tem UM extra e UM desconto por semana: o valor informado SUBSTITUI o atual " +
    "(use somar_ao_atual=true pra somar ao que já tem; valor 0 zera). " +
    "Precisa de: nome, tipo (extra ou desconto), valor e motivo (pergunte se faltar). No extra, o turno (dia ou noite) diz em que turno ele conta: " +
    "se a pessoa trabalha nos dois turnos e não disseram, PERGUNTE. A semana é a da data informada (padrão: semana de hoje). " +
    "Não paga nada: só muda o valor da semana. Nada acontece até a pessoa confirmar no cartão.",
  telas: ["/colaboradores"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, maxLength: 60, description: "Nome (ou parte) da pessoa." },
      tipo: { type: "string", enum: ["extra", "desconto"], description: "extra (a mais) ou desconto (a menos)." },
      valor: { type: "number", minimum: 0, maximum: MAX_VALOR, description: `Valor em reais (0 zera). Máximo R$ ${MAX_VALOR}.` },
      motivo: { type: "string", maxLength: 120, description: "Motivo curto (ex.: hora extra sábado, atraso). Obrigatório quando o valor é maior que zero." },
      turno: { type: "string", enum: ["dia", "noite"], description: "Só no extra: em que turno ele conta." },
      data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Qualquer dia da semana desejada, AAAA-MM-DD. Padrão: hoje." },
      somar_ao_atual: { type: "boolean", description: "true = soma ao extra/desconto que já existe na semana. Padrão: substitui." },
    },
    required: ["nome", "tipo", "valor"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const tipo = args.tipo;
    if (tipo !== "extra" && tipo !== "desconto") throw new Error("Diga se é extra ou desconto.");
    const valorBruto = typeof args.valor === "number" ? args.valor : Number(args.valor);
    if (!Number.isFinite(valorBruto) || valorBruto < 0) throw new Error("Valor inválido: use um número em reais, zero ou mais.");
    if (valorBruto > MAX_VALOR) throw new Error(`Valor alto demais pra lançar por aqui (máximo R$ ${MAX_VALOR}). Use a tela.`);
    const valor = r2(valorBruto);
    const somar = args.somar_ao_atual === true;
    if (somar && valor <= 0) throw new Error("Pra somar, diga um valor maior que zero.");
    const motivoNovo = textoOpcional(args, "motivo", 120);
    const turnoPedido = turnoArg(args, false);
    const data = dataArg(args, "data", ctx, { passado: 63, futuro: 7 }) ?? ctx.hoje;
    const segunda = segundaDe(data);
    const c = await acharColaborador(db, ctx, args);

    const { data: linha, error } = await db.from("semana_extras").select("valor, motivo, turno, desconto, desconto_motivo")
      .eq("empresa_id", ctx.empresaId).eq("segunda", segunda).eq("colaborador_id", c.id).maybeSingle();
    if (error) throw new Error(ERRO_LER);
    const atualRow = linha as ExtraLido | null;
    const ehExtra = tipo === "extra";
    const atual = r2(Number(ehExtra ? atualRow?.valor : atualRow?.desconto) || 0);
    const motivoAtual = (ehExtra ? atualRow?.motivo : atualRow?.desconto_motivo) ?? "";
    const novo = r2(somar ? atual + valor : valor);
    if (novo > MAX_VALOR) throw new Error(`Com a soma fica R$ ${novo}: alto demais pra lançar por aqui (máximo R$ ${MAX_VALOR}). Use a tela.`);

    const motivo = novo > 0 ? (motivoNovo || motivoAtual) : "";
    if (novo > 0 && motivo.length < 3) throw new Error(`Falta o motivo do ${tipo} (ex.: ${ehExtra ? "hora extra sábado" : "atraso"}).`);

    // Turno do extra: o pedido; senão o que já está lançado; senão o da pessoa (quem faz os dois: perguntar).
    const turnoPessoa: "dia" | "noite" = c.turno === "dia" ? "dia" : "noite";
    let turno: "dia" | "noite" = turnoPessoa;
    if (ehExtra) {
      if (turnoPedido) turno = turnoPedido;
      else if (atualRow && (Number(atualRow.valor) > 0 || atualRow.motivo)) turno = atualRow.turno === "dia" ? "dia" : "noite";
      else if (novo > 0 && c.turno === "ambos") throw new Error(`${c.nome} trabalha de dia e de noite: o extra conta no turno do dia ou da noite?`);
    }
    if (novo === atual && motivo === motivoAtual && (!ehExtra || novo === 0 || turno === (atualRow?.turno === "dia" ? "dia" : "noite"))) {
      throw new Error(`O ${tipo} de ${c.nome} nessa semana já está ${novo > 0 ? `${brl(novo)} (${motivo})` : "zerado"}. Nada a mudar.`);
    }

    const detalhes = [
      `Pessoa: ${c.nome}`,
      `Semana: ${rotuloSemana(segunda)}`,
      `${ehExtra ? "Extra" : "Desconto"}: ${novo > 0 ? brl(novo) : "zerado"}${atual > 0 ? ` (hoje está ${brl(atual)})` : ""}`,
    ];
    if (novo > 0) detalhes.push(`Motivo: ${motivo}`);
    if (ehExtra && novo > 0) detalhes.push(`Conta no ${turnoTxt(turno)}`);
    const outro = r2(Number(ehExtra ? atualRow?.desconto : atualRow?.valor) || 0);
    if (outro > 0) detalhes.push(`${ehExtra ? "Desconto" : "Extra"} da semana continua ${brl(outro)}`);
    if (await semanaLancada(db, ctx, segunda, c.id)) detalhes.push(AVISO_LANCADA);

    const semana = rotuloSemana(segunda);
    const resumo = novo > 0
      ? `${atual > 0 ? "Trocar" : "Lançar"} ${ehExtra ? "extra" : "desconto"} de ${brl(novo)} pra ${c.nome} na semana ${semana} (${motivo}).`
      : `Zerar o ${tipo} de ${c.nome} na semana ${semana}.`;

    return {
      resumo,
      detalhes,
      dados: { colaboradorId: c.id, nome: c.nome, segunda, tipo, valor: novo, motivo, turno, turnoPadrao: turnoPessoa },
    };
  },
  async executar(dados, ctx) {
    const id = String(dados.colaboradorId ?? "");
    const segunda = String(dados.segunda ?? "");
    const tipo = dados.tipo === "extra" ? "extra" : dados.tipo === "desconto" ? "desconto" : null;
    const valor = Number(dados.valor);
    const motivo = typeof dados.motivo === "string" ? dados.motivo : "";
    const turno: "dia" | "noite" = dados.turno === "dia" ? "dia" : "noite";
    const turnoPadrao: "dia" | "noite" = dados.turnoPadrao === "dia" ? "dia" : "noite";
    if (!id || !DATA.test(segunda) || !tipo || !Number.isFinite(valor) || valor < 0 || valor > MAX_VALOR) throw new Error("Pedido inválido. Peça de novo.");

    // A tela grava extra e desconto juntos: relê a outra metade AGORA pra não apagar
    // o que alguém mexeu na tela enquanto o cartão esperava.
    const sessao = await createClient();
    const { data: linha, error } = await sessao.from("semana_extras").select("valor, motivo, turno, desconto, desconto_motivo")
      .eq("empresa_id", ctx.empresaId).eq("segunda", segunda).eq("colaborador_id", id).maybeSingle();
    if (error) throw new Error(ERRO_LER);
    const r = linha as ExtraLido | null;
    if (tipo === "extra") {
      await chamar(() => salvarExtra(segunda, id, valor, motivo, turno, Number(r?.desconto) || 0, r?.desconto_motivo ?? ""));
    } else {
      const turnoExtra: "dia" | "noite" = r?.turno === "dia" ? "dia" : r?.turno === "noite" ? "noite" : turnoPadrao;
      await chamar(() => salvarExtra(segunda, id, Number(r?.valor) || 0, r?.motivo ?? "", turnoExtra, valor, motivo));
    }
    const quem = primeiroNome(String(dados.nome ?? ""));
    const semana = rotuloSemana(segunda);
    return valor > 0
      ? `${tipo === "extra" ? "Extra" : "Desconto"} de ${brl(valor)} lançado pra ${quem} na semana ${semana}.`
      : `${tipo === "extra" ? "Extra" : "Desconto"} de ${quem} zerado na semana ${semana}.`;
  },
};

export const ACOES_EQUIPE: Acao[] = [responderFolga, marcarPresencaAcao, extraSemana];
