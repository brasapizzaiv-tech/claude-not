// Ferramentas do Ajudante: VENDAS E FATURAMENTO. Cada uma refaz a MESMA conta
// de uma tela do painel (ver o comentário de cada uma), só que devolvendo um
// resumo pequeno pra IA. Só leitura, cliente da sessão (o RLS prende na empresa).
import { faturamentoPorDia, notasPorDia, somarFaturamento } from "@/lib/faturamento";
import { buscarPorLotes, buscarTodas } from "@/lib/supabase/todas";
import { tipoDe, type FormaOpcao } from "@/lib/formas-pagamento";
import { analisarDias, somar, limiteQueda, segundaDe, DELTAS, type PratoBuffet } from "@/lib/buffet-analise-core";
import { periodo, intervaloUtc, r2, type Db, type Ferramenta } from "./tipos";

const TZ = "America/Sao_Paulo";
const RE_DATA = "^\\d{4}-\\d{2}-\\d{2}$";
const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const paramPeriodo = (maxDias: number) => ({
  de: { type: "string", pattern: RE_DATA, description: "Primeiro dia, AAAA-MM-DD (horário de Brasília). Sem ele, hoje." },
  ate: { type: "string", pattern: RE_DATA, description: `Último dia, AAAA-MM-DD, incluído. Sem ele, igual a "de". No máximo ${maxDias} dias no período.` },
});

const diaSemana = (dia: string) => DIA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const horaMin = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

function opcao<T extends string>(v: unknown, ops: readonly T[], padrao: T): T {
  return ops.includes(v as T) ? (v as T) : padrao;
}
function limiteDe(v: unknown, padrao = 15, max = 30) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : padrao;
}

/** Agrupa as formas de pagamento como a tela de Fechamentos (pelo TIPO da forma). */
function grupoDaForma(nome: string | null, formas: FormaOpcao[]): "dinheiro" | "cartao" | "pix" | "outros" {
  const t = tipoDe(nome, formas);
  if (t === "dinheiro") return "dinheiro";
  if (t === "credito" || t === "debito" || t === "cartao") return "cartao";
  if (t === "pix" || t === "pix_maquina") return "pix";
  return "outros";
}

async function formasCadastradas(db: Db): Promise<FormaOpcao[]> {
  const { data } = await db.from("formas_pagamento").select("nome, tipo");
  return ((data as FormaOpcao[] | null) ?? []).map((f) => ({ nome: f.nome, tipo: f.tipo }));
}

type Mov = {
  caixa_id: string; tipo: string; forma_pagamento: string | null; valor: number;
  comanda_id: string | null; comanda_ids: string[] | null; recebe_fiado: boolean | null;
};

/** Movimentos de vários caixas: lotes de 60 caixas, páginas de 1000 (igual Fechamentos). */
async function movsDosCaixas(db: Db, ids: string[]): Promise<Mov[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) lotes.push(ids.slice(i, i + 60));
  const porLote = await Promise.all(lotes.map((lote) => buscarTodas<Mov>((a, b) =>
    db.from("pdv_caixa_mov")
      .select("caixa_id, tipo, forma_pagamento, valor, comanda_id, comanda_ids, recebe_fiado")
      .in("caixa_id", lote).order("id").range(a, b),
  )));
  return porLote.flat();
}

// ---------------------------------------------------------------------------
// 1) Faturamento — src/lib/faturamento.ts (Notas × Faturamento, DRE, CMV).
const faturamentoPeriodo: Ferramenta = {
  nome: "faturamento_periodo",
  descricao:
    "Faturamento oficial do restaurante num período: total, almoço e noite, média por dia, e a lista por dia " +
    "(ou por semana, se o período passar de 31 dias), com a fonte de cada dia (planilha importada ou caixa do sistema). " +
    "Traz também as notas fiscais de venda (NFC-e) emitidas no período. É a mesma conta do DRE e da tela Notas × Faturamento. " +
    "Use para 'quanto vendemos ontem', 'faturamento do mês', 'como foi o almoço de sábado', 'comparar duas semanas'.",
  telas: ["/financeiro/vendas"],
  parametros: { type: "object", properties: paramPeriodo(93), required: [], additionalProperties: false },
  executar: async (db, args, ctx) => {
    const { de, ate } = periodo(args, ctx, 93);
    const [dias, notas] = await Promise.all([faturamentoPorDia(db, de, ate), notasPorDia(db, de, ate)]);
    const soma = somarFaturamento(dias);
    const comVenda = dias.filter((d) => d.total > 0).length;
    const fonte = (f: string) => (f === "planilha" ? "planilha" : "caixa");

    let lista: Record<string, unknown>;
    if (dias.length <= 31) {
      lista = { por_dia: dias.map((d) => ({ dia: d.dia, semana: diaSemana(d.dia), almoco: d.almoco, noite: d.noite, total: d.total, fonte: fonte(d.fonte) })) };
    } else {
      const sem = new Map<string, { semana_de: string; dias: number; almoco: number; noite: number; total: number }>();
      for (const d of dias) {
        const k = segundaDe(d.dia);
        const s = sem.get(k) ?? { semana_de: k, dias: 0, almoco: 0, noite: 0, total: 0 };
        s.dias++; s.almoco = r2(s.almoco + d.almoco); s.noite = r2(s.noite + d.noite); s.total = r2(s.total + d.total);
        sem.set(k, s);
      }
      lista = { por_semana: [...sem.values()].sort((a, b) => a.semana_de.localeCompare(b.semana_de)) };
    }

    const obs = ["Dia sem venda registrada não aparece na lista."];
    if (soma.diasSistema > 0) {
      obs.push(
        `${soma.diasSistema} dia(s) vêm do caixa do sistema (almoço = vendas antes das 16h, noite = depois; acerto de fiado não conta). ` +
        "Noite zerada num dia 'caixa' pode ser só porque a noite ainda não passava pelo caixa (até meados de out/2026 ela rodava fora); importar a planilha do dia substitui o número.",
      );
    }
    if (soma.diasPlanilha > 0) obs.push(`${soma.diasPlanilha} dia(s) vêm da planilha de faturamento importada (número fechado, almoço e noite).`);
    obs.push("Notas emitidas = NFC-e de venda autorizadas (importadas do sistema antigo + as que o sistema emite desde 07/09/2026); nem toda venda tem nota.");

    return {
      de, ate,
      total: soma.total, almoco: soma.almoco, noite: soma.noite,
      dias_com_venda: comVenda,
      media_por_dia: comVenda ? r2(soma.total / comVenda) : 0,
      notas_emitidas: { quantidade: notas.reduce((s, d) => s + d.notas, 0), valor: r2(notas.reduce((s, d) => s + d.valor, 0)) },
      ...lista,
      observacao: obs.join(" "),
    };
  },
};

// ---------------------------------------------------------------------------
// 2) Vendas por forma de pagamento — tela Caixa > Fechamentos
//    (src/app/(painel)/salao/caixa/fechamentos/page.tsx).
const vendasPorForma: Ferramenta = {
  nome: "vendas_por_forma_pagamento",
  descricao:
    "Vendas que passaram pelos caixas do sistema num período, separadas por forma de pagamento (cada forma e o grupo " +
    "dinheiro/cartão/Pix/outros), com número de comandas, ticket médio, 10% de serviço, sangrias, suprimentos e quebra de caixa. " +
    "Mesma conta da tela Caixa > Fechamentos (o caixa entra no dia e turno em que ABRIU: antes das 16h = almoço). " +
    "Use para 'quanto entrou em Pix ontem', 'quanto foi no cartão na semana', 'ticket médio do almoço'. " +
    "Para o faturamento oficial use faturamento_periodo.",
  telas: ["/salao/caixa/fechamentos"],
  parametros: {
    type: "object",
    properties: {
      ...paramPeriodo(93),
      turno: { type: "string", enum: ["todos", "almoco", "noite"], description: "Só os caixas do almoço, da noite, ou todos (padrão)." },
    },
    required: [],
    additionalProperties: false,
  },
  executar: async (db, args, ctx) => {
    const { de, ate } = periodo(args, ctx, 93);
    const turno = opcao(args.turno, ["todos", "almoco", "noite"] as const, "todos");
    const { ini, fim } = intervaloUtc(de, ate);
    const horaNum = (iso: string) => Number(new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));

    const { data: cxRows, error } = await db
      .from("pdv_caixas").select("id, nome, status, aberto_em, fechado_em, quebra, dinheiro_contado, dinheiro_esperado, obs")
      .gte("aberto_em", ini).lte("aberto_em", fim)
      .order("aberto_em", { ascending: false }).limit(500);
    if (error) throw new Error("Não consegui ler os caixas agora. Tente de novo.");
    type Cx = {
      id: string; nome: string | null; status: string | null; aberto_em: string; fechado_em: string | null;
      quebra: number | null; dinheiro_contado: number | null; dinheiro_esperado: number | null; obs: string | null;
    };
    const caixas = ((cxRows as Cx[]) ?? [])
      .filter((c) => turno === "todos" || (horaNum(c.aberto_em) < 16 ? "almoco" : "noite") === turno);
    const [movs, formas] = await Promise.all([movsDosCaixas(db, caixas.map((c) => c.id)), formasCadastradas(db)]);

    // Comandas pagas em cada caixa (dividida em vários pagamentos conta uma vez por caixa).
    const comandasDoCaixa = new Map<string, Set<string>>();
    for (const m of movs) {
      if (m.tipo !== "venda") continue;
      const s = comandasDoCaixa.get(m.caixa_id) ?? new Set<string>();
      for (const id of m.comanda_ids?.length ? m.comanda_ids : m.comanda_id ? [m.comanda_id] : []) s.add(id);
      comandasDoCaixa.set(m.caixa_id, s);
    }
    const todas = [...new Set([...comandasDoCaixa.values()].flatMap((s) => [...s]))];
    const coms = await buscarPorLotes<{ id: string; servico: number | null }>(todas, (lote) =>
      db.from("pdv_comandas").select("id, servico").in("id", lote),
    );
    const servicoDe = new Map(coms.map((c) => [c.id, Number(c.servico) || 0]));

    const grupos = { dinheiro: 0, cartao: 0, pix: 0, outros: 0 };
    const porForma = new Map<string, number>();
    let vendas = 0, sangrias = 0, suprimentos = 0, fiado = 0, semDinheiro = 0;
    for (const m of movs) {
      const v = Number(m.valor) || 0;
      if (m.tipo === "sangria") sangrias += v;
      else if (m.tipo === "suprimento") suprimentos += v;
      else if (m.tipo === "cortesia" || m.tipo === "vale_presente") semDinheiro += v;
      else if (m.tipo === "venda") {
        vendas += v;
        grupos[grupoDaForma(m.forma_pagamento, formas)] += v;
        const f = m.forma_pagamento || "Outros";
        porForma.set(f, (porForma.get(f) ?? 0) + v);
        if (m.recebe_fiado) fiado += v;
      }
    }
    let comandas = 0, servico = 0;
    for (const s of comandasDoCaixa.values()) {
      comandas += s.size;
      for (const id of s) servico += servicoDe.get(id) ?? 0;
    }
    const quebra = caixas.reduce((s, c) => s + (Number(c.quebra) || 0), 0);
    // Fechamento de cada caixa: quebra = contado − esperado (positiva = SOBROU dinheiro, negativa = FALTOU).
    const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);
    const fechamentos = caixas.slice(0, 15).map((c) => {
      const q = r2(Number(c.quebra) || 0);
      return {
        caixa: c.nome ?? "Caixa",
        situacao: c.status === "fechado" ? "fechado" : "aberto",
        abriu: hora(c.aberto_em),
        fechou: hora(c.fechado_em),
        dinheiro_esperado: c.dinheiro_esperado == null ? null : r2(Number(c.dinheiro_esperado)),
        dinheiro_contado: c.dinheiro_contado == null ? null : r2(Number(c.dinheiro_contado)),
        quebra: q,
        resultado: c.status !== "fechado" ? "ainda aberto" : Math.abs(q) < 0.01 ? "bateu certinho" : q > 0 ? `sobrou R$ ${q.toFixed(2)}` : `faltou R$ ${Math.abs(q).toFixed(2)}`,
        observacao_do_fechamento: c.obs?.trim() ? c.obs.trim().slice(0, 200) : null,
      };
    });

    const obs = ["Vendas = tudo que entrou nos caixas como venda (com o 10%)."];
    if (fiado >= 0.01) obs.push(`Inclui ${r2(fiado).toFixed(2)} de acerto de fiado recebido no caixa (não é venda nova e fica fora do faturamento oficial).`);
    if (semDinheiro >= 0.01) obs.push("Cortesias e vales-presente fecham conta sem dinheiro e ficam fora (campo cortesias_e_vales).");
    if (caixas.length === 500) obs.push("Passou de 500 caixas: o período foi cortado, peça um período menor.");

    return {
      de, ate, turno,
      caixas: caixas.length,
      total_vendas: r2(vendas),
      comandas,
      ticket_medio: comandas ? r2(vendas / comandas) : 0,
      servico_10: r2(servico),
      por_grupo: { dinheiro: r2(grupos.dinheiro), cartao: r2(grupos.cartao), pix: r2(grupos.pix), outros: r2(grupos.outros) },
      por_forma: [...porForma.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
        .map(([forma, v]) => ({ forma, grupo: grupoDaForma(forma, formas), valor: r2(v), pct: pct(v, vendas) })),
      fiado_recebido: r2(fiado),
      cortesias_e_vales: r2(semDinheiro),
      sangrias: r2(sangrias),
      suprimentos: r2(suprimentos),
      quebra: r2(quebra),
      quebra_explicada: "quebra = dinheiro contado − esperado: positiva é sobra, negativa é falta",
      fechamentos,
      observacao: obs.join(" "),
    };
  },
};

// ---------------------------------------------------------------------------
// 3) Produtos vendidos — tela Financeiro > Produtos vendidos
//    (src/app/(painel)/financeiro/vendidos/page.tsx).
const VIRADA_NOITE = 17;
type ItemRow = {
  id: string; comanda_id: string; item_id: string | null; descricao: string; qtd: number; preco_unit: number | null;
  criado_em: string; pago: boolean; criado_por: string | null; criado_colab_id: string | null;
};
type ComandaRow = { id: string; status: string; forma_pagamento: string | null; valor_buffet: number | null; aberta_em: string; livre: boolean | null; mesa: string | null };
const AGRUPAR = ["produto", "categoria", "turno", "forma", "garcom", "origem"] as const;

const produtosVendidos: Ferramenta = {
  nome: "produtos_mais_vendidos",
  descricao:
    "Ranking do que foi vendido num período, pelo que foi lançado nas comandas (salão, balcão, balança e delivery): " +
    "top N com quantidade, valor e % do total. Pode agrupar por produto (padrão), categoria, turno, forma de pagamento, " +
    "garçom ou origem. Buffet entra como 'Buffet livre' e 'Buffet a kg' (1 por prato). Traz também o total cancelado. " +
    "Mesma conta da tela Financeiro > Produtos vendidos (noite a partir das 17h). " +
    "Use para 'qual pizza mais vendeu', 'quantas coca vendemos', 'quanto vendeu cada garçom'. Não é o faturamento oficial.",
  telas: ["/financeiro/vendidos"],
  parametros: {
    type: "object",
    properties: {
      ...paramPeriodo(62),
      agrupar: { type: "string", enum: [...AGRUPAR], description: "Como agrupar. Padrão: produto." },
      turno: { type: "string", enum: ["todos", "dia", "noite"], description: "Dia (antes das 17h), noite ou todos (padrão)." },
      ordenar: { type: "string", enum: ["valor", "quantidade"], description: "Ordem do ranking. Padrão: valor." },
      so_pagos: { type: "boolean", description: "true = só itens já pagos. Padrão: false (tudo que foi lançado)." },
      limite: { type: "integer", minimum: 1, maximum: 30, description: "Quantas linhas devolver (1 a 30, padrão 15)." },
    },
    required: [],
    additionalProperties: false,
  },
  executar: async (db, args, ctx) => {
    const { de, ate } = periodo(args, ctx, 62);
    const agrupar = opcao(args.agrupar, AGRUPAR, "produto");
    const turno = opcao(args.turno, ["todos", "dia", "noite"] as const, "todos");
    const ordenar = opcao(args.ordenar, ["valor", "quantidade"] as const, "valor");
    const soPagos = args.so_pagos === true;
    const limite = limiteDe(args.limite);
    const { ini, fim } = intervaloUtc(de, ate);
    // Igual à tela (en-US com hour12:false: meia-noite sai "24" e conta como noite).
    const horaSP = (iso: string) => Number(new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }));

    const itens = await buscarTodas<ItemRow>((a, b) =>
      db.from("pdv_comanda_itens")
        .select("id, comanda_id, item_id, descricao, qtd, preco_unit, criado_em, pago, criado_por, criado_colab_id")
        .gte("criado_em", ini).lte("criado_em", fim)
        .order("criado_em").order("id").range(a, b),
      60000,
    );
    const comIds = [...new Set(itens.map((i) => i.comanda_id))];
    const [comsItens, comsBuffet, cancel, excl, pdvItens, delivs] = await Promise.all([
      buscarPorLotes<ComandaRow>(comIds, (lote) =>
        db.from("pdv_comandas").select("id, status, forma_pagamento, valor_buffet, aberta_em, livre, mesa").in("id", lote),
      ),
      buscarTodas<ComandaRow & { buffet_pago: boolean | null }>((a, b) =>
        db.from("pdv_comandas").select("id, status, forma_pagamento, valor_buffet, aberta_em, livre, mesa, buffet_pago")
          .gt("valor_buffet", 0).gte("aberta_em", ini).lte("aberta_em", fim).order("aberta_em").order("id").range(a, b),
      ),
      buscarTodas<{ qtd: number; valor: number }>((a, b) =>
        db.from("pdv_itens_cancelados").select("id, qtd, valor").gte("cancelado_em", ini).lte("cancelado_em", fim).order("id").range(a, b),
      ),
      buscarTodas<{ valor: number }>((a, b) =>
        db.from("pdv_comandas_excluidas").select("id, valor").gte("excluido_em", ini).lte("excluido_em", fim).order("id").range(a, b),
      ),
      buscarTodas<{ id: string; nome: string; categoria: string | null; por_kg: boolean | null }>((a, b) =>
        db.from("pdv_itens").select("id, nome, categoria, por_kg").order("id").range(a, b),
      ),
      buscarTodas<{ comanda_id: string | null }>((a, b) =>
        db.from("delivery_pedidos").select("id, comanda_id").gte("criado_em", ini).lte("criado_em", fim).order("id").range(a, b),
      ),
    ]);
    const comMap = new Map(comsItens.map((c) => [c.id, c]));
    const catDe = new Map(pdvItens.map((p) => [p.id, p.categoria || "Outros"]));
    const nomeItemDe = new Map(pdvItens.map((p) => [p.id, p.nome]));
    const deliveryComandas = new Set(delivs.map((d) => d.comanda_id).filter(Boolean) as string[]);

    // Nome de quem lançou: só se for agrupar por garçom (são da equipe, não clientes).
    const nomeDe = new Map<string, string>();
    if (agrupar === "garcom") {
      const uids = [...new Set(itens.map((i) => i.criado_por).filter(Boolean))] as string[];
      const cids = [...new Set(itens.map((i) => i.criado_colab_id).filter(Boolean))] as string[];
      const [profs, colabs] = await Promise.all([
        buscarPorLotes<{ id: string; nome: string }>(uids, (l) => db.from("profiles").select("id, nome").in("id", l)),
        buscarPorLotes<{ id: string; nome: string }>(cids, (l) => db.from("colaboradores").select("id, nome").in("id", l)),
      ]);
      for (const p of [...profs, ...colabs]) nomeDe.set(p.id, p.nome);
    }

    const origemDe = (c: ComandaRow | undefined) => {
      if (!c) return "Salão";
      if (deliveryComandas.has(c.id)) return "Delivery";
      const m = (c.mesa || "").toLowerCase();
      if (m.startsWith("balcão") || m.startsWith("balcao")) return "Balcão";
      if (m.startsWith("balança") || m.startsWith("balanca")) return "Balança";
      return "Salão";
    };

    type Cru = Record<(typeof AGRUPAR)[number], string> & { qtd: number; valor: number };
    const crus: Cru[] = [];
    let buffetPratos = 0, buffetValor = 0;
    for (const it of itens) {
      const c = comMap.get(it.comanda_id);
      if (c?.status === "excluida") continue;
      const t = horaSP(it.criado_em) >= VIRADA_NOITE ? "noite" : "dia";
      if (turno !== "todos" && t !== turno) continue;
      if (soPagos && !it.pago) continue;
      const valor = Math.round(Number(it.qtd) * Number(it.preco_unit ?? 0) * 100) / 100;
      const nome = (it.item_id && nomeItemDe.get(it.item_id)) || (it.descricao || "Item").split("\n")[0].trim();
      crus.push({
        produto: it.item_id ? nome : nome.slice(0, 80),
        categoria: it.item_id ? catDe.get(it.item_id) ?? "Outros" : "Pizzas",
        turno: t === "dia" ? "Dia" : "Noite",
        forma: c?.forma_pagamento || (it.pago ? "(não informada)" : "(em aberto)"),
        garcom: (it.criado_por && nomeDe.get(it.criado_por)) || (it.criado_colab_id && nomeDe.get(it.criado_colab_id)) || "—",
        origem: origemDe(c),
        qtd: Number(it.qtd),
        valor,
      });
    }
    for (const c of comsBuffet) {
      if (c.status === "excluida") continue;
      const t = horaSP(c.aberta_em) >= VIRADA_NOITE ? "noite" : "dia";
      if (turno !== "todos" && t !== turno) continue;
      if (soPagos && !c.buffet_pago) continue;
      const v = Number(c.valor_buffet) || 0;
      buffetPratos++; buffetValor += v;
      crus.push({
        produto: c.livre ? "Buffet livre" : "Buffet a kg",
        categoria: "Buffet",
        turno: t === "dia" ? "Dia" : "Noite",
        forma: c.forma_pagamento || (c.buffet_pago ? "(não informada)" : "(em aberto)"),
        garcom: "Balança",
        origem: origemDe(c),
        qtd: 1,
        valor: v,
      });
    }

    const grupos = new Map<string, { nome: string; categoria?: string; qtd: number; valor: number }>();
    for (const r of crus) {
      const chave = r[agrupar];
      const g = grupos.get(chave) ?? { nome: chave, ...(agrupar === "produto" ? { categoria: r.categoria } : {}), qtd: 0, valor: 0 };
      g.qtd = Math.round((g.qtd + r.qtd) * 1000) / 1000;
      g.valor = r2(g.valor + r.valor);
      grupos.set(chave, g);
    }
    const totalValor = r2(crus.reduce((s, r) => s + r.valor, 0));
    const totalQtd = Math.round(crus.reduce((s, r) => s + r.qtd, 0) * 1000) / 1000;
    const ordenadas = [...grupos.values()].sort((a, b) => (ordenar === "quantidade" ? b.qtd - a.qtd : b.valor - a.valor));
    const linhas = ordenadas.slice(0, limite).map((g) => ({ ...g, pct_valor: pct(g.valor, totalValor) }));
    const resto = ordenadas.slice(limite);

    return {
      de, ate, agrupar, turno, so_pagos: soPagos,
      valor_total: totalValor,
      quantidade_total: totalQtd,
      buffet: { pratos: buffetPratos, valor: r2(buffetValor) },
      cancelados: {
        valor: r2(cancel.reduce((s, c) => s + Number(c.valor), 0) + excl.reduce((s, c) => s + Number(c.valor), 0)),
        itens: cancel.reduce((s, c) => s + Number(c.qtd), 0),
        comandas_excluidas: excl.length,
      },
      grupos_no_total: grupos.size,
      linhas,
      ...(resto.length ? { demais: { grupos: resto.length, qtd: Math.round(resto.reduce((s, g) => s + g.qtd, 0) * 1000) / 1000, valor: r2(resto.reduce((s, g) => s + g.valor, 0)) } } : {}),
      observacao:
        "Valor = quantidade × preço lançado na comanda (sem 10% e sem desconto); não é o faturamento oficial (use faturamento_periodo). " +
        "Item por quilo conta a quantidade em kg. Pizza sem item do cardápio entra pela descrição, na categoria Pizzas. Comandas excluídas ficam fora.",
    };
  },
};

// ---------------------------------------------------------------------------
// 4) Buffet livre × quilo — tela Financeiro > Buffet (src/lib/buffet-analise-core.ts).
const buffetLivreQuilo: Ferramenta = {
  nome: "buffet_livre_quilo",
  descricao:
    "Análise do buffet do almoço num período: pratos no livre e no quilo, peso médio do prato, quanto cada um paga, " +
    "quanto daria se fosse tudo por quilo, o efeito de subir o livre em R$ 3/5/10 e até quanto o livre pode cair antes " +
    "do 'só quilo' render menos. Lista por semana. Mesma conta da tela Financeiro > Buffet: livre × quilo. " +
    "Use para 'vale a pena acabar com o livre?', 'quanto pesa o prato do livre', 'e se o livre subir 5 reais'.",
  telas: ["/financeiro/buffet"],
  parametros: { type: "object", properties: paramPeriodo(186), required: [], additionalProperties: false },
  executar: async (db, args, ctx) => {
    const { de, ate } = periodo(args, ctx, 186);
    const { ini } = intervaloUtc(de, ate);
    const [{ data: pratosJson, error }, { data: cfgRows }] = await Promise.all([
      db.rpc("buffet_pratos", { p_de: ini }),
      db.from("pdv_config").select("chave, valor"),
    ]);
    if (error) throw new Error("Não consegui ler as pesagens do buffet agora. Tente de novo.");
    const cfg: Record<string, string> = {};
    for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) cfg[r.chave] = r.valor;
    const precoPadrao = (dow: number) => ({
      kg: Number(cfg[`preco_kg_${dow}`] || cfg.preco_kg || 0),
      livre: Number(cfg[`buffet_livre_${dow}`] || cfg.buffet_livre || 0),
    });
    const pratos: PratoBuffet[] = ((pratosJson as [string, boolean, number, number][] | null) ?? [])
      .filter(([dia]) => dia <= ate)
      .map(([dia, livre, peso, valor]) => ({ dia, livre: !!livre, peso: Number(peso) || 0, valor: Number(valor) || 0 }));
    const dias = analisarDias(pratos, precoPadrao);
    if (!dias.length) return { de, ate, dias: 0, observacao: "Nenhum prato pesado no almoço neste período." };
    const t = somar(dias);
    const pratosTotal = t.kgPratos + t.livrePratos;
    const g = (kg: number) => Math.round(kg * 1000);
    const faixa = (p: number[]) => { const s = [...p].sort((a, b) => a - b); return s[0] === s[s.length - 1] ? r2(s[0]) : `${r2(s[0])} a ${r2(s[s.length - 1])}`; };
    const extra = (s: typeof t) => Object.fromEntries(DELTAS.map((d) => [`livre_mais_${d}`, r2(s.extra[d] ?? 0)]));

    const porSemana = new Map<string, typeof dias>();
    for (const d of dias) { const s = segundaDe(d.dia); porSemana.set(s, [...(porSemana.get(s) ?? []), d]); }

    return {
      de, ate,
      almocos: t.dias,
      faturamento_buffet: r2(t.valor),
      livre: {
        pratos: t.livrePratos, pct_dos_pratos: pct(t.livrePratos, pratosTotal), sem_pesar: t.livreDiretos,
        prato_medio_g: t.livrePesou && t.livrePratos ? g(t.livrePeso / t.livrePratos) : null,
        paga_por_pessoa: t.livrePratos ? r2(t.livreValor / t.livrePratos) : null,
        sai_por_kg: t.livrePeso ? r2(t.livreValor / t.livrePeso) : null,
        valor: r2(t.livreValor), preco: faixa(t.precosLivre),
      },
      quilo: {
        pratos: t.kgPratos,
        prato_medio_g: t.kgPratos ? g(t.kgPeso / t.kgPratos) : null,
        paga_por_pessoa: t.kgPratos ? r2(t.kgValor / t.kgPratos) : null,
        sai_por_kg: t.kgPeso ? r2(t.kgValor / t.kgPeso) : null,
        valor: r2(t.kgValor), preco_kg: faixa(t.precosKg),
      },
      se_tudo_por_quilo: { faturamento: r2(t.soKg), diferenca: r2(t.soKg - t.valor), pct: pct(t.soKg - t.valor, t.valor) },
      a_mais_com_livre_mais_caro: extra(t),
      livre_pode_cair_ate_pct: Math.round(limiteQueda(t) * 1000) / 10,
      por_semana: [...porSemana].sort(([a], [b]) => a.localeCompare(b)).map(([seg, ds]) => {
        const s = somar(ds);
        return {
          semana_de: seg, almocos: s.dias, livre_pratos: s.livrePratos, quilo_pratos: s.kgPratos,
          faturamento_buffet: r2(s.valor), se_tudo_por_quilo: r2(s.soKg), ...extra(s),
        };
      }),
      observacao:
        "Só o almoço (pratos antes das 16h), sem as marmitas. Quem aperta 'Livre' sem pesar entra com a média de quem pesou no dia. " +
        "As simulações supõem que todo mundo continua comendo igual. 'livre_pode_cair_ate_pct': se o que o livre rende cair mais que isso, o só-quilo passa a render menos que hoje.",
    };
  },
};

// ---------------------------------------------------------------------------
// 5) Delivery — tela Delivery > Relatórios (src/app/(painel)/delivery/relatorios/page.tsx).
const ORIGEM: Record<string, string> = { app: "App", whatsapp: "WhatsApp", instagram: "Instagram", telefone: "Telefone", balcao: "Balcão", convenio: "Convênio" };
const STATUS: Record<string, string> = { pendente: "Pendente", aceito: "Aceito", em_preparo: "Em preparo", pronto: "Pronto", saiu: "Saiu pra entrega", entregue: "Entregue", cancelado: "Cancelado" };

const deliveryResumo: Ferramenta = {
  nome: "delivery_resumo",
  descricao:
    "Resumo do delivery num período: número de pedidos, faturamento, ticket médio, pedidos a receber e cancelados, " +
    "e a divisão por origem (app, WhatsApp, telefone...), forma de pagamento, entrega × retirada, status, bairro (top 10) e entregador. " +
    "Mesma conta da tela Delivery > Relatórios. Use para 'quantos pedidos de delivery ontem', 'ticket médio do app', " +
    "'quanto veio pelo WhatsApp'. Não traz dados de clientes.",
  telas: ["/delivery"],
  parametros: { type: "object", properties: paramPeriodo(93), required: [], additionalProperties: false },
  executar: async (db, args, ctx) => {
    const { de, ate } = periodo(args, ctx, 93);
    const { ini, fim } = intervaloUtc(de, ate);
    type Ped = {
      comanda_id: string | null; tipo: string; status: string; origem: string; forma_pagamento: string | null;
      pago: boolean; taxa_entrega: number; desconto: number; bairro: string | null; entregador_id: string | null;
    };
    const [peds, { data: entregadores }] = await Promise.all([
      buscarTodas<Ped>((a, b) =>
        db.from("delivery_pedidos")
          .select("id, comanda_id, tipo, status, origem, forma_pagamento, pago, taxa_entrega, desconto, bairro, entregador_id")
          .gte("criado_em", ini).lte("criado_em", fim).order("criado_em").order("id").range(a, b),
      ),
      db.from("entregadores").select("id, nome"),
    ]);
    const comandaIds = [...new Set(peds.map((p) => p.comanda_id).filter(Boolean))] as string[];
    const itens = await buscarPorLotes<{ comanda_id: string; qtd: number; preco_unit: number | null }>(comandaIds, (lote) =>
      db.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", lote), 100,
    );
    const somaDe = new Map<string, number>();
    for (const it of itens) somaDe.set(it.comanda_id, (somaDe.get(it.comanda_id) ?? 0) + Number(it.qtd) * Number(it.preco_unit || 0));
    const entrNome = new Map(((entregadores as { id: string; nome: string }[]) ?? []).map((e) => [e.id, e.nome]));

    const totalDe = (p: Ped) =>
      Math.round(((somaDe.get(p.comanda_id ?? "") ?? 0) + (p.tipo === "retirada" ? 0 : Number(p.taxa_entrega)) - Number(p.desconto)) * 100) / 100;
    const validos = peds.filter((p) => p.status !== "cancelado");
    const faturamento = r2(validos.reduce((s, p) => s + totalDe(p), 0));

    const agrupar = (chave: (p: Ped) => string | null, max = 15) => {
      const m = new Map<string, { qtd: number; valor: number }>();
      for (const p of validos) {
        const k = chave(p);
        if (k == null || k === "") continue;
        const cur = m.get(k) ?? { qtd: 0, valor: 0 };
        cur.qtd += 1; cur.valor += totalDe(p);
        m.set(k, cur);
      }
      return [...m.entries()].map(([k, v]) => ({ nome: k, pedidos: v.qtd, valor: r2(v.valor) })).sort((a, b) => b.valor - a.valor).slice(0, max);
    };
    const porStatus = new Map<string, number>();
    for (const p of peds) porStatus.set(STATUS[p.status] ?? p.status, (porStatus.get(STATUS[p.status] ?? p.status) ?? 0) + 1);

    return {
      de, ate,
      pedidos: validos.length,
      faturamento,
      ticket_medio: validos.length ? r2(faturamento / validos.length) : 0,
      a_receber: validos.filter((p) => !p.pago).length,
      cancelados: peds.length - validos.length,
      taxas_de_entrega: r2(validos.reduce((s, p) => s + (p.tipo === "retirada" ? 0 : Number(p.taxa_entrega) || 0), 0)),
      descontos: r2(validos.reduce((s, p) => s + (Number(p.desconto) || 0), 0)),
      por_origem: agrupar((p) => ORIGEM[p.origem] ?? p.origem),
      por_forma: agrupar((p) => p.forma_pagamento),
      por_tipo: agrupar((p) => (p.tipo === "retirada" ? "Retirada" : "Entrega")),
      por_status: Object.fromEntries(porStatus),
      por_bairro_top10: agrupar((p) => p.bairro, 10),
      por_entregador: agrupar((p) => (p.tipo === "entrega" ? (p.entregador_id ? entrNome.get(p.entregador_id) ?? "?" : "Sem entregador") : null)),
      observacao:
        "Valor do pedido = itens da comanda + taxa de entrega (só entrega) − desconto. Cancelados ficam fora das somas. " +
        "Dia pelo horário em que o pedido foi criado (Brasília).",
    };
  },
};

// ---------------------------------------------------------------------------
// 6) Caixa de hoje — tela Salão > Caixa (resumo do caixa aberto) + caixas abertos hoje.
const caixaHoje: Ferramenta = {
  nome: "caixa_hoje",
  descricao:
    "Situação do caixa agora: se há caixa aberto, desde que horas, saldo inicial, vendas por forma de pagamento, " +
    "suprimentos, sangrias, total recebido e o dinheiro que deve ter na gaveta (mesma conta do 'Resumo do caixa' na tela Caixa). " +
    "Traz também os caixas abertos hoje (abertos e fechados) com o total vendido em cada um. " +
    "Use para 'o caixa está aberto?', 'quanto tem de dinheiro no caixa', 'quanto entrou hoje até agora'. Para outros dias use vendas_por_forma_pagamento.",
  telas: ["/salao/caixa"],
  parametros: { type: "object", properties: {}, required: [], additionalProperties: false },
  executar: async (db, _args, ctx) => {
    const { ini } = intervaloUtc(ctx.hoje, ctx.hoje);
    const [{ data: aberto }, { data: deHoje }] = await Promise.all([
      db.from("pdv_caixas").select("id, nome, saldo_inicial, aberto_em, status")
        .eq("status", "aberto").order("aberto_em", { ascending: false }).limit(1).maybeSingle(),
      db.from("pdv_caixas").select("id, nome, aberto_em, fechado_em, status")
        .gte("aberto_em", ini).order("aberto_em").limit(30),
    ]);
    type Cx = { id: string; nome: string; aberto_em: string; fechado_em?: string | null; status: string; saldo_inicial?: number };
    const cxAberto = aberto as Cx | null;
    const hoje = (deHoje as Cx[] | null) ?? [];
    const ids = [...new Set([...hoje.map((c) => c.id), ...(cxAberto ? [cxAberto.id] : [])])];
    const movs = await movsDosCaixas(db, ids);

    let resumoAberto: Record<string, unknown> | null = null;
    if (cxAberto) {
      const porForma = new Map<string, number>();
      const semDinheiro = new Map<string, number>();
      let suprimentos = 0, sangrias = 0, fiado = 0;
      for (const m of movs) {
        if (m.caixa_id !== cxAberto.id) continue;
        const v = Number(m.valor);
        if (m.tipo === "venda") {
          const f = m.forma_pagamento || "Outros";
          porForma.set(f, (porForma.get(f) || 0) + v);
          if (m.recebe_fiado) fiado += v;
        } else if (m.tipo === "suprimento") suprimentos += v;
        else if (m.tipo === "sangria") sangrias += v;
        else if (m.tipo === "cortesia" || m.tipo === "vale_presente") {
          const f = m.forma_pagamento || (m.tipo === "cortesia" ? "Cortesia" : "Vale-presente");
          semDinheiro.set(f, (semDinheiro.get(f) || 0) + v);
        }
      }
      const total = [...porForma.values()].reduce((s, v) => s + v, 0);
      const saldo = Number(cxAberto.saldo_inicial) || 0;
      resumoAberto = {
        nome: cxAberto.nome,
        aberto_em: `${diaSP(cxAberto.aberto_em)} ${horaMin(cxAberto.aberto_em)}`,
        saldo_inicial: r2(saldo),
        vendas_por_forma: [...porForma.entries()].sort((a, b) => b[1] - a[1]).map(([forma, v]) => ({ forma, valor: r2(v) })),
        total_recebido: r2(total),
        acerto_de_fiado_incluido: r2(fiado),
        suprimentos: r2(suprimentos),
        sangrias: r2(sangrias),
        dinheiro_no_caixa: r2(saldo + (porForma.get("Dinheiro") || 0) + suprimentos - sangrias),
        sem_dinheiro: [...semDinheiro.entries()].map(([forma, v]) => ({ forma, valor: r2(v) })),
      };
    }

    const vendasDe = (id: string) => r2(movs.filter((m) => m.caixa_id === id && m.tipo === "venda").reduce((s, m) => s + (Number(m.valor) || 0), 0));
    return {
      hoje: ctx.hoje,
      caixa_aberto: resumoAberto,
      caixas_de_hoje: hoje.map((c) => ({
        nome: c.nome, status: c.status, abriu: horaMin(c.aberto_em), fechou: c.fechado_em ? horaMin(c.fechado_em) : null, vendas: vendasDe(c.id),
      })),
      observacao:
        "Total recebido inclui acerto de fiado (não é venda nova). Dinheiro no caixa = saldo inicial + vendas em 'Dinheiro' + suprimentos − sangrias. " +
        "Cortesias e vales-presente fecham conta sem dinheiro (sem_dinheiro) e não entram no caixa." +
        (cxAberto ? "" : " Nenhum caixa aberto agora."),
    };
  },
};

export const FERRAMENTAS_VENDAS: Ferramenta[] = [
  faturamentoPeriodo,
  vendasPorForma,
  produtosVendidos,
  buffetLivreQuilo,
  deliveryResumo,
  caixaHoje,
];
