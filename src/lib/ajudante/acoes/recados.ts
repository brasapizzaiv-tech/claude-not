// Ações do Ajudante (etapa 3) de RECADOS E LEMBRETES:
//  - lembrete pra equipe (tela /lembretes → salvarLembrete);
//  - recado na TV da cozinha (tela /cozinha/recados → salvarRecadoTv);
//  - feriado ou evento marcado (tela /feriados → criarFeriado / decidirFeriado
//    e salvarEvento).
//
// `preparar` só LÊ (cliente da sessão): acha setores e pessoas pelo nome no
// banco (ilike, nunca a tabela inteira na memória), confere datas e horas e
// monta o cartão de conferência. `executar` chama a MESMA server action da
// tela, com as mesmas travas e permissões; a regra mora lá, não aqui.

import { salvarLembrete } from "@/app/(painel)/lembretes/actions";
import { salvarRecadoTv } from "@/app/(painel)/cozinha/recados/actions";
import { criarFeriado, decidirFeriado } from "@/app/(painel)/feriados/actions";
import { salvarEvento } from "@/app/(painel)/feriados/eventos-actions";
import { createClient } from "@/lib/supabase/server";
import { NOME_DIA, valeNoDia, type Repeticao } from "@/lib/lembretes-core";
import { SITUACAO, type SituacaoFeriado } from "@/lib/feriados";
import type { ContextoFerramenta, Db } from "../ferramentas/tipos";
import { dataCurta, formData, texto, type Acao } from "./tipos";

// ======================= AJUDAS =======================

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Data AAAA-MM-DD que existe no calendário (31/02 não passa). */
function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !RE_DATA.test(v.trim())) return null;
  const s = v.trim();
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function dataObrigatoria(args: Record<string, unknown>, campo: string, rotulo: string): string {
  if (args[campo] == null || args[campo] === "") throw new Error(`Falta informar ${rotulo}.`);
  const d = dataValida(args[campo]);
  if (!d) throw new Error(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} precisa ser uma data de verdade no formato AAAA-MM-DD.`);
  return d;
}

function dataOpcional(args: Record<string, unknown>, campo: string, rotulo: string): string | null {
  if (args[campo] == null || args[campo] === "") return null;
  const d = dataValida(args[campo]);
  if (!d) throw new Error(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} precisa ser uma data de verdade no formato AAAA-MM-DD.`);
  return d;
}

function horaOpcional(args: Record<string, unknown>, campo = "hora"): string | null {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (!v) return null;
  if (!RE_HORA.test(v)) throw new Error("A hora precisa estar no formato HH:MM (ex.: 15:30).");
  return v;
}

/** Texto opcional, com tamanho máximo (passou disso: erro, pra ninguém perder o fim sem saber). */
function textoOpcional(args: Record<string, unknown>, campo: string, maximo: number, rotulo: string): string | null {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (!v) return null;
  if (v.length > maximo) throw new Error(`${rotulo} está comprido demais: no máximo ${maximo} letras.`);
  return v;
}

function textoObrigatorio(args: Record<string, unknown>, campo: string, maximo: number, rotulo: string, minimo = 2): string {
  const v = texto(args, campo, 1);
  if (v.length < minimo) throw new Error(`${rotulo} está curto demais.`);
  if (v.length > maximo) throw new Error(`${rotulo} está comprido demais: no máximo ${maximo} letras.`);
  return v;
}

function listaDeTextos(args: Record<string, unknown>, campo: string): string[] {
  const v = args[campo];
  const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(lista.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))];
}

/** Padrão do ilike com os curingas escapados. */
const padrao = (t: string) => `%${t.slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Achado = { id: string; nome: string };

/**
 * Nome → id, buscando no banco (ilike). Um só: pronto. Vários: se um bate
 * exato, é ele; senão erro com até 5 sugestões. Nenhum: erro com sugestões
 * parecidas (pelas primeiras letras).
 */
async function acharPorNome(
  db: Db,
  tabela: "colaboradores" | "checklist_setores",
  nome: string,
  ctx: ContextoFerramenta,
  oQue: { um: string; varios: string },
): Promise<Achado> {
  if (nome.length < 2) throw new Error(`Pra achar ${oQue.um}, use pelo menos 2 letras do nome.`);
  const consulta = (p: string) =>
    db.from(tabela).select("id, nome").eq("empresa_id", ctx.empresaId).eq("ativo", true).ilike("nome", p).order("nome").limit(6);
  const { data, error } = await consulta(padrao(nome));
  if (error) throw new Error(`Não consegui procurar ${oQue.varios} agora. Confira a internet e tente de novo.`);
  const achados = (data as Achado[] | null) ?? [];
  if (achados.length === 1) return achados[0];
  if (achados.length > 1) {
    const exato = achados.filter((a) => semAcento(a.nome) === semAcento(nome));
    if (exato.length === 1) return exato[0];
    throw new Error(`Tem mais de ${oQue.um} com "${nome}": ${achados.slice(0, 5).map((a) => a.nome).join(", ")}${achados.length > 5 ? "…" : ""}. Qual?`);
  }
  // Nenhum: sugere pelos primeiros pedaços do nome.
  const pedaco = nome.split(/\s+/)[0].slice(0, 3);
  const { data: parecidos } = pedaco.length >= 2 ? await consulta(padrao(pedaco)) : { data: [] };
  const sugestoes = ((parecidos as Achado[] | null) ?? []).slice(0, 5).map((a) => a.nome);
  throw new Error(
    `Não achei ${oQue.um} com "${nome}" entre os ativos.${sugestoes.length ? ` Parecidos: ${sugestoes.join(", ")}.` : ""}`,
  );
}

const brData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ======================= 1. LEMBRETE PRA EQUIPE =======================

const REPETICOES: Repeticao[] = ["uma_vez", "diario", "semanal", "mensal"];

const acaoCriarLembrete: Acao = {
  nome: "acao_criar_lembrete",
  descricao:
    "Prepara um LEMBRETE PRA EQUIPE (igual à tela Lembretes): aparece no app de cada pessoa no dia marcado com um botão " +
    "\"Visto\" (aviso) ou \"Feito\" (tarefa), e a gestão vê quem ainda não confirmou. Pode ser pra todos, pra setores " +
    "(caixa, salão, cozinha… os setores dos checklists) ou pra pessoas escolhidas pelo nome. Pode ser de uma vez, todo dia, " +
    "em dias da semana ou num dia do mês, com hora opcional. Se o lembrete vale HOJE, o celular de quem usa o app da " +
    "equipe recebe um aviso logo que for criado; nos outros dias ele entra no resumo da manhã do celular. " +
    "Antes de chamar, tenha: o texto do lembrete, pra quem é e quando (dia, ou a partir de quando e a repetição). Se faltar " +
    "algum desses, PERGUNTE (não invente data nem destinatário). \"Hoje\"/\"amanhã\" você converte pra AAAA-MM-DD. " +
    "Nada é gravado agora: a pessoa vê o resumo e confirma no botão antes.",
  telas: ["/lembretes"],
  parametros: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "O lembrete, curto (até 120 letras). Ex.: \"Limpar a coifa\"." },
      texto: { type: "string", description: "Explicação opcional (até 1000 letras)." },
      tipo: { type: "string", enum: ["aviso", "tarefa"], description: "aviso = a pessoa marca Visto; tarefa = marca Feito. Padrão: aviso." },
      para: { type: "string", enum: ["todos", "setores", "pessoas"], description: "Pra quem. Padrão: todos." },
      setores: { type: "array", items: { type: "string" }, description: "Nomes dos setores (quando para = setores)." },
      pessoas: { type: "array", items: { type: "string" }, description: "Nomes das pessoas da equipe (quando para = pessoas)." },
      repeticao: { type: "string", enum: REPETICOES, description: "uma_vez (padrão), diario, semanal ou mensal." },
      data: { type: "string", description: "AAAA-MM-DD. Uma vez: o dia. Repetido: a partir de quando." },
      ate: { type: "string", description: "AAAA-MM-DD, opcional, só pra repetidos: último dia." },
      dias_semana: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 6 },
        description: "Só no semanal: dias da semana, 0 = domingo … 6 = sábado.",
      },
      dia_mes: { type: "integer", minimum: 1, maximum: 31, description: "Só no mensal: o dia do mês (1 a 31)." },
      hora: { type: "string", description: "HH:MM, opcional." },
    },
    required: ["titulo", "data"],
    additionalProperties: false,
  },

  async preparar(db, args, ctx) {
    const titulo = textoObrigatorio(args, "titulo", 120, "O lembrete");
    const textoLivre = textoOpcional(args, "texto", 1000, "A explicação");
    const tipo = args.tipo === "tarefa" ? "tarefa" : "aviso";
    const para = args.para === "setores" ? "setores" : args.para === "pessoas" ? "pessoas" : "todos";
    const repeticao: Repeticao = REPETICOES.includes(args.repeticao as Repeticao) ? (args.repeticao as Repeticao) : "uma_vez";
    const data = dataObrigatoria(args, "data", repeticao === "uma_vez" ? "o dia do lembrete" : "a partir de quando");
    if (repeticao === "uma_vez" && data < ctx.hoje) throw new Error(`O dia ${brData(data)} já passou. Qual dia?`);
    const ate = repeticao === "uma_vez" ? null : dataOpcional(args, "ate", "o \"até\"");
    if (ate && ate < data) throw new Error("O \"até\" é antes do começo.");
    if (ate && ate < ctx.hoje) throw new Error(`O "até" (${brData(ate)}) já passou: o lembrete nunca apareceria.`);
    const hora = horaOpcional(args);

    let dias: number[] = [];
    if (repeticao === "semanal") {
      const lidos = Array.isArray(args.dias_semana) ? args.dias_semana : [];
      dias = [...new Set(lidos.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
      if (dias.length === 0) throw new Error("Falta dizer em quais dias da semana.");
    }
    let diaMes: number | null = null;
    if (repeticao === "mensal") {
      diaMes = Number(args.dia_mes);
      if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) throw new Error("Falta o dia do mês (1 a 31).");
    }

    // Destinatários: nome → id, sempre no banco.
    let setores: Achado[] = [];
    let pessoas: Achado[] = [];
    if (para === "setores") {
      const nomes = listaDeTextos(args, "setores");
      if (nomes.length === 0) throw new Error("Falta dizer pra qual setor.");
      if (nomes.length > 10) throw new Error("São setores demais de uma vez (no máximo 10).");
      setores = await Promise.all(nomes.map((n) => acharPorNome(db, "checklist_setores", n, ctx, { um: "um setor", varios: "os setores" })));
    }
    if (para === "pessoas") {
      const nomes = listaDeTextos(args, "pessoas");
      if (nomes.length === 0) throw new Error("Falta dizer pra quem.");
      if (nomes.length > 30) throw new Error("São pessoas demais pra escolher pelo nome (no máximo 30). Que tal por setor ou pra todos?");
      pessoas = await Promise.all(nomes.map((n) => acharPorNome(db, "colaboradores", n, ctx, { um: "uma pessoa", varios: "a equipe" })));
    }
    const unicos = <T extends Achado>(l: T[]) => [...new Map(l.map((x) => [x.id, x])).values()];
    setores = unicos(setores);
    pessoas = unicos(pessoas);

    const quando =
      repeticao === "uma_vez" ? dataCurta(data)
        : repeticao === "diario" ? `todo dia, a partir de ${dataCurta(data)}`
          : repeticao === "semanal"
            ? `toda ${[...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => NOME_DIA[d]).join(", ")}, a partir de ${dataCurta(data)}`
            : `todo dia ${diaMes} do mês, a partir de ${dataCurta(data)}`;
    const quandoCompleto = `${quando}${hora ? ` às ${hora}` : ""}${ate ? ` até ${dataCurta(ate)}` : ""}`;
    const paraTexto =
      para === "todos" ? "toda a equipe"
        : para === "setores" ? `setor${setores.length > 1 ? "es" : ""} ${setores.map((s) => s.nome).join(", ")}`
          : pessoas.map((p) => p.nome).join(", ");

    const valeHoje = valeNoDia({ repeticao, data, ate, dias, diaMes, ativo: true }, ctx.hoje);
    const aviso = valeHoje
      ? "Vale hoje: ao confirmar, manda um aviso agora no celular de quem usa o app da equipe."
      : "Não vale hoje: nada vai pro celular agora; no dia, entra no app e no resumo da manhã do celular.";

    // Lembrete ativo com o mesmo título: provável repetição.
    const { data: iguais } = await db.from("lembretes").select("id").eq("empresa_id", ctx.empresaId).eq("ativo", true)
      .ilike("titulo", titulo.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);

    const detalhes = [
      `Lembrete: "${titulo}"${textoLivre ? ` — ${textoLivre.length > 140 ? `${textoLivre.slice(0, 140)}…` : textoLivre}` : ""}`,
      `Tipo: ${tipo === "tarefa" ? "tarefa (a pessoa marca Feito)" : "aviso (a pessoa marca Visto)"}`,
      `Para: ${paraTexto}`,
      `Quando: ${quandoCompleto}`,
      aviso,
    ];
    if (((iguais as unknown[] | null) ?? []).length) detalhes.push("Atenção: já existe um lembrete ativo com esse mesmo título.");

    return {
      resumo: `Criar o ${tipo === "tarefa" ? "lembrete-tarefa" : "lembrete"} "${titulo}" pra ${paraTexto}, ${quandoCompleto}.${valeHoje ? " Avisa no celular agora." : ""}`,
      detalhes,
      dados: {
        titulo,
        texto: textoLivre,
        tipo,
        para,
        setor_ids: setores.map((s) => s.id),
        colaborador_ids: pessoas.map((p) => p.id),
        repeticao,
        data,
        ate,
        dias,
        dia_mes: diaMes,
        hora,
        resumo_para: paraTexto,
        resumo_quando: quandoCompleto,
      },
    };
  },

  async executar(d) {
    const r = await salvarLembrete(formData({
      titulo: String(d.titulo ?? ""),
      texto: (d.texto as string | null) ?? null,
      tipo: String(d.tipo ?? "aviso"),
      para: String(d.para ?? "todos"),
      setor_ids: ((d.setor_ids as string[] | undefined) ?? []).map(String),
      colaborador_ids: ((d.colaborador_ids as string[] | undefined) ?? []).map(String),
      repeticao: String(d.repeticao ?? "uma_vez"),
      data: String(d.data ?? ""),
      ate: (d.ate as string | null) ?? null,
      dias: ((d.dias as number[] | undefined) ?? []).map(String),
      dia_mes: d.dia_mes == null ? null : Number(d.dia_mes),
      hora: (d.hora as string | null) ?? null,
    }));
    if (!r.ok) throw new Error(r.erro);
    return `Lembrete "${String(d.titulo)}" criado pra ${String(d.resumo_para)}, ${String(d.resumo_quando)}.`;
  },
};

// ======================= 2. RECADO NA TV DA COZINHA =======================

/** A TV mostra no máximo 5 recados ativos (src/lib/rodizio-server.ts → recadosTv). */
const MAX_TV = 5;

const acaoRecadoTv: Acao = {
  nome: "acao_recado_tv",
  descricao:
    "Prepara um RECADO NA TV DA COZINHA (tela Recados da TV): quando não tem pedido do rodízio na fila, a TV mostra relógio, " +
    "data e até 5 recados ativos. Recado curto (até 200 letras). Pode ter uma data \"até\" (o recado some sozinho depois dela). " +
    "Não manda nada pro celular de ninguém. Se a pessoa não disse o texto, pergunte. Se ela disser algo como \"até sexta\", " +
    "converta pra AAAA-MM-DD. Nada é gravado agora: a pessoa vê o resumo e confirma no botão antes.",
  telas: ["/cozinha/recados"],
  parametros: {
    type: "object",
    properties: {
      texto: { type: "string", description: "O recado, como vai aparecer na TV (até 200 letras)." },
      ate: { type: "string", description: "AAAA-MM-DD, opcional: último dia em que o recado aparece." },
    },
    required: ["texto"],
    additionalProperties: false,
  },

  async preparar(db, args, ctx) {
    const recado = textoObrigatorio(args, "texto", 200, "O recado");
    const ate = dataOpcional(args, "ate", "o \"até\"");
    if (ate && ate < ctx.hoje) throw new Error(`O "até" (${brData(ate)}) já passou: o recado nem apareceria.`);

    const { data: ativos, error } = await db.from("tv_recados").select("texto").eq("empresa_id", ctx.empresaId)
      .eq("ativo", true).or(`ate.is.null,ate.gte.${ctx.hoje}`).order("ordem").order("criado_em").limit(50);
    if (error) throw new Error("Não consegui ler os recados da TV agora. Confira a internet e tente de novo.");
    const lista = (ativos as { texto: string }[] | null) ?? [];

    const detalhes = [
      `Recado: "${recado}"`,
      ate ? `Aparece até ${dataCurta(ate)} e depois some sozinho.` : "Fica na TV até alguém desligar.",
      "Só na TV da cozinha (quando não tem pedido do rodízio). Não avisa no celular de ninguém.",
      `Recados ligados agora: ${lista.length}.`,
    ];
    if (lista.length >= MAX_TV) {
      detalhes.push(`Atenção: a TV mostra só ${MAX_TV}. Com ${lista.length} ligados, este novo só aparece se desligar algum na tela Recados da TV.`);
    }
    if (lista.some((r) => semAcento(r.texto) === semAcento(recado))) detalhes.push("Atenção: já tem um recado ligado com esse mesmo texto.");

    return {
      resumo: `Pôr na TV da cozinha o recado "${recado}"${ate ? ` até ${dataCurta(ate)}` : ""}.`,
      detalhes,
      dados: { texto: recado, ate },
    };
  },

  async executar(d) {
    const r = await salvarRecadoTv({ texto: String(d.texto ?? ""), ate: (d.ate as string | null) ?? null });
    if (!r.ok) throw new Error(r.mensagem);
    return `Recado posto na TV da cozinha: "${String(d.texto)}"${d.ate ? ` (até ${dataCurta(String(d.ate))})` : ""}.`;
  },
};

// ======================= 3. FERIADO OU EVENTO MARCADO =======================

const SITUACOES: SituacaoFeriado[] = ["indefinido", "abre", "fecha", "especial"];
/** As mesmas opções do campo "Onde" da aba Eventos (feriados/eventos-client.tsx). */
const LUGARES = ["Salão", "Deck", "Área kids", "Casa toda"];

/** "20:00" → "20h", "19:30" → "19h30" (o jeito que a tela de eventos escreve). */
const horaDoEvento = (h: string) => (h.endsWith(":00") ? `${Number(h.slice(0, 2))}h` : `${Number(h.slice(0, 2))}h${h.slice(3)}`);

const acaoFeriadoOuEvento: Acao = {
  nome: "acao_feriado_ou_evento",
  descricao:
    "Prepara, na tela Feriados e eventos, UMA de duas coisas (campo tipo):\n" +
    "• tipo = feriado: uma data especial (feriado da cidade, emenda, férias coletivas com data_fim) e o que a casa faz: " +
    "abre (abre normal), fecha (fechado), especial (abre diferente — aí use detalhe pro turno/horário, ex.: \"só almoço\", " +
    "\"fecha à noite\") ou indefinido (ainda não decidido). Aparece na TV da cozinha e no mural.\n" +
    "• tipo = evento: um evento marcado (aniversário, confraternização) com data, hora, quantas pessoas (0 = a combinar), " +
    "lugar (Salão, Deck, Área kids ou Casa toda), de quem é e o combinado de comida. Aparece na TV e no mural.\n" +
    "Se faltar a data, o nome/título ou (no feriado) se a casa abre ou fecha, PERGUNTE. Não manda nada pro celular. " +
    "Nada é gravado agora: a pessoa vê o resumo e confirma no botão antes.",
  telas: ["/feriados"],
  parametros: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["feriado", "evento"], description: "feriado ou evento." },
      data: { type: "string", description: "AAAA-MM-DD: o dia (no feriado de vários dias, o primeiro)." },
      // Feriado
      data_fim: { type: "string", description: "Feriado: AAAA-MM-DD do último dia, só se durar vários dias." },
      nome: { type: "string", description: "Feriado: o que é a data (até 80 letras). Ex.: \"Aniversário de Ivoti\"." },
      situacao: { type: "string", enum: SITUACOES, description: "Feriado: abre, fecha, especial (abre diferente) ou indefinido." },
      detalhe: { type: "string", description: "Feriado: turno/horário quando abre diferente (até 120 letras). Ex.: \"só almoço\"." },
      // Evento
      titulo: { type: "string", description: "Evento: o que é (até 120 letras). Ex.: \"Aniversário de 15 anos da Ana\"." },
      hora: { type: "string", description: "Evento: HH:MM, opcional." },
      pessoas: { type: "integer", minimum: 0, maximum: 2000, description: "Evento: quantas pessoas (0 = a combinar)." },
      lugar: { type: "string", enum: LUGARES, description: "Evento: onde. Deixe de fora se não foi combinado." },
      contato: { type: "string", description: "Evento: de quem é (nome, até 80 letras), opcional." },
      telefone: { type: "string", description: "Evento: telefone do contato, opcional (só se a pessoa disse)." },
      cardapio: { type: "string", description: "Evento: o combinado de comida (até 1000 letras), opcional." },
      observacao: { type: "string", description: "Evento: outras combinações (até 1000 letras), opcional." },
    },
    required: ["tipo", "data"],
    additionalProperties: false,
  },

  async preparar(db, args, ctx) {
    const tipo = args.tipo === "evento" ? "evento" : args.tipo === "feriado" ? "feriado" : null;
    if (!tipo) throw new Error("Diga se é um feriado (a casa abre ou fecha) ou um evento marcado.");
    const data = dataObrigatoria(args, "data", tipo === "feriado" ? "a data" : "a data do evento");
    if (data < ctx.hoje) throw new Error(`O dia ${brData(data)} já passou. Qual data?`);

    if (tipo === "feriado") {
      const nome = textoObrigatorio(args, "nome", 80, "O nome da data");
      const fim = dataOpcional(args, "data_fim", "o último dia");
      if (fim && fim < data) throw new Error("O último dia não pode ser antes do primeiro.");
      const dataFim = fim && fim > data ? fim : null;
      if (dataFim && (Date.parse(dataFim) - Date.parse(data)) / 86400000 > 60) throw new Error("Período comprido demais (mais de 60 dias). Confira as datas.");
      if (typeof args.situacao !== "string" || !SITUACOES.includes(args.situacao as SituacaoFeriado)) {
        throw new Error("Falta dizer o que a casa faz nesse dia: abre normal, fecha, abre diferente (qual turno) ou ainda não decidido.");
      }
      const situacao = args.situacao as SituacaoFeriado;
      const detalhe = textoOpcional(args, "detalhe", 120, "O detalhe");

      // A data é única por empresa: repetir é engano (a tela recusaria).
      const { data: ja, error } = await db.from("feriados").select("nome, situacao").eq("empresa_id", ctx.empresaId).eq("data", data).limit(1);
      if (error) throw new Error("Não consegui ler os feriados agora. Confira a internet e tente de novo.");
      const existente = ((ja as { nome: string; situacao: SituacaoFeriado }[] | null) ?? [])[0];
      if (existente) {
        throw new Error(`Já existe "${existente.nome}" em ${dataCurta(data)} (${SITUACAO[existente.situacao]?.longo ?? existente.situacao}). Pra mudar, use a tela Feriados e eventos.`);
      }

      const quando = dataFim ? `de ${dataCurta(data)} a ${dataCurta(dataFim)}` : dataCurta(data);
      const casa = `${SITUACAO[situacao].longo}${detalhe ? ` · ${detalhe}` : ""}`;
      return {
        resumo: `Cadastrar o feriado "${nome}" (${quando}): ${casa}.`,
        detalhes: [
          `Data: ${quando}`,
          `O que é: ${nome}`,
          `A casa: ${casa}`,
          "Aparece na TV da cozinha e no mural do escritório. Não avisa no celular de ninguém.",
        ],
        dados: { tipo, data, data_fim: dataFim, nome, situacao, detalhe },
      };
    }

    // Evento marcado
    const titulo = textoObrigatorio(args, "titulo", 120, "O título do evento");
    const hora = horaOpcional(args);
    const pessoasN = args.pessoas == null || args.pessoas === "" ? 0 : Number(args.pessoas);
    if (!Number.isInteger(pessoasN) || pessoasN < 0 || pessoasN > 2000) throw new Error("Quantas pessoas: um número de 0 a 2000 (0 = a combinar).");
    let lugar: string | null = null;
    if (typeof args.lugar === "string" && args.lugar.trim()) {
      lugar = LUGARES.find((l) => semAcento(l) === semAcento(args.lugar as string)) ?? null;
      if (!lugar) throw new Error(`Lugar tem que ser um destes: ${LUGARES.join(", ")} (ou deixar a combinar).`);
    }
    const contato = textoOpcional(args, "contato", 80, "O nome do contato");
    const telefone = textoOpcional(args, "telefone", 20, "O telefone");
    if (telefone && !/^[\d\s()+-]{8,20}$/.test(telefone)) throw new Error("O telefone está estranho: só números, espaço, parênteses, + e -.");
    const cardapio = textoOpcional(args, "cardapio", 1000, "O combinado de comida");
    const observacao = textoOpcional(args, "observacao", 1000, "A observação");

    // Outros eventos e feriado no mesmo dia: só pra conferência.
    const [{ data: noDia }, { data: feriadoNoDia }] = await Promise.all([
      db.from("eventos").select("titulo, status").eq("empresa_id", ctx.empresaId).eq("data", data).neq("status", "cancelado").limit(5),
      db.from("feriados").select("nome, situacao").eq("empresa_id", ctx.empresaId).lte("data", data)
        .or(`data.eq.${data},data_fim.gte.${data}`).limit(1),
    ]);
    const horaTela = hora ? horaDoEvento(hora) : null;
    const detalhes = [
      `Data: ${dataCurta(data)}${horaTela ? ` às ${horaTela}` : ""}`,
      `Evento: ${titulo}`,
      `Pessoas: ${pessoasN > 0 ? pessoasN : "a combinar"} · Onde: ${lugar ?? "a combinar"}`,
    ];
    if (contato || telefone) detalhes.push(`De quem é: ${[contato, telefone].filter(Boolean).join(" · ")}`);
    if (cardapio) detalhes.push(`Combinado: ${cardapio.length > 160 ? `${cardapio.slice(0, 160)}…` : cardapio}`);
    if (observacao) detalhes.push(`Obs.: ${observacao.length > 120 ? `${observacao.slice(0, 120)}…` : observacao}`);
    const outros = (noDia as { titulo: string }[] | null) ?? [];
    if (outros.length) detalhes.push(`Atenção: nesse dia já tem ${outros.map((e) => `"${e.titulo}"`).join(", ")}.`);
    const fer = ((feriadoNoDia as { nome: string; situacao: SituacaoFeriado }[] | null) ?? [])[0];
    if (fer) detalhes.push(`Atenção: nesse dia tem o feriado "${fer.nome}" (${SITUACAO[fer.situacao]?.longo ?? fer.situacao}).`);
    detalhes.push("Entra como \"Marcado\"; aparece na TV da cozinha e no mural.");

    return {
      resumo: `Marcar o evento "${titulo}" em ${dataCurta(data)}${horaTela ? ` às ${horaTela}` : ""}${pessoasN > 0 ? `, ${pessoasN} pessoas` : ""}${lugar ? `, ${lugar}` : ""}.`,
      detalhes,
      dados: { tipo, data, hora: horaTela, titulo, pessoas: pessoasN, lugar, contato, telefone, cardapio, observacao },
    };
  },

  async executar(d, ctx) {
    if (d.tipo === "feriado") {
      const situacao = String(d.situacao ?? "indefinido");
      const r = await criarFeriado(formData({
        data: String(d.data ?? ""),
        data_fim: (d.data_fim as string | null) ?? null,
        nome: String(d.nome ?? ""),
        situacao,
      }));
      if (!r.ok) throw new Error(r.erro);
      const quando = d.data_fim ? `de ${dataCurta(String(d.data))} a ${dataCurta(String(d.data_fim))}` : dataCurta(String(d.data));
      // O detalhe (turno) não vai no cadastro: na tela ele é escrito depois,
      // na própria linha do feriado (decidirFeriado). Aqui é igual.
      const detalhe = typeof d.detalhe === "string" ? d.detalhe : "";
      if (detalhe) {
        const supabase = await createClient();
        const { data: linha } = await supabase.from("feriados").select("id").eq("empresa_id", ctx.empresaId).eq("data", String(d.data)).maybeSingle();
        const id = (linha as { id: string } | null)?.id;
        const r2 = id ? await decidirFeriado(id, situacao, detalhe) : { ok: false as const, erro: "não achei a data recém-criada" };
        if (!r2.ok) {
          throw new Error(`O feriado "${String(d.nome)}" foi criado, mas o detalhe do turno não ficou salvo (${r2.erro}). Escreva o detalhe na tela Feriados e eventos.`);
        }
      }
      return `Feriado "${String(d.nome)}" cadastrado (${quando}): ${SITUACAO[situacao as SituacaoFeriado]?.longo ?? situacao}${detalhe ? ` · ${detalhe}` : ""}.`;
    }

    const r = await salvarEvento(formData({
      data: String(d.data ?? ""),
      hora: (d.hora as string | null) ?? null,
      titulo: String(d.titulo ?? ""),
      pessoas: Number(d.pessoas) || 0,
      lugar: (d.lugar as string | null) ?? null,
      contato: (d.contato as string | null) ?? null,
      telefone: (d.telefone as string | null) ?? null,
      cardapio: (d.cardapio as string | null) ?? null,
      observacao: (d.observacao as string | null) ?? null,
    }));
    if (!r.ok) throw new Error(r.erro);
    return `Evento "${String(d.titulo)}" marcado pra ${dataCurta(String(d.data))}${d.hora ? ` às ${String(d.hora)}` : ""}.`;
  },
};

export const ACOES_RECADOS: Acao[] = [acaoCriarLembrete, acaoRecadoTv, acaoFeriadoOuEvento];
