import { semCuringa } from "@/lib/format";
import { buscarPorLotes, buscarTodas } from "@/lib/supabase/todas";
import { periodo, r2, type ContextoFerramenta, type Db, type Ferramenta } from "./tipos";

// Ferramentas do Ajudante: ESTOQUE E COMPRAS. Mesmas regras das telas:
//  - Produto/contagem: /produtos, /contagens, /contagens/consumo (consumo_periodos).
//  - Compra: notas de entrada pela data de EMISSÃO, sem as canceladas, sem item
//    pra sócios/funcionário (destino) — igual ao CMV. Quantidade na unidade do
//    produto = qtd × fator; preço por unidade do produto = valor_unit ÷ fator
//    (a mesma conta do preço de referência quando a nota é lançada).
//  - Cotação: aberta com prazo de resposta vencido conta como fechada (a tela
//    fecha sozinha ao abrir; aqui só lê).
//  - Pedido: dia da entrega = pedido_dia_entrega; "Chegou" da equipe
//    (conf_colab_em), "Não veio", conferência do painel — igual a /conferencia e ao mural.
// Fornecedor sai só pelo nome (nada de CNPJ, telefone, e-mail).

type Obj = Record<string, unknown>;

const somaDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** periodo() com padrão: sem datas = os últimos `dias` até hoje; só `ate` = os `dias` até ele; só `de` = de até hoje. */
function periodoPadrao(args: Obj, ctx: ContextoFerramenta, dias: number, maxDias: number) {
  const ate = typeof args.ate === "string" && DATA.test(args.ate) ? args.ate : ctx.hoje;
  const de = typeof args.de === "string" && DATA.test(args.de) ? args.de : somaDias(ate < ctx.hoje ? ate : ctx.hoje, -(dias - 1));
  return periodo({ de, ate }, ctx, maxDias);
}

/** Texto de busca: 2 a 60 letras. `null` quando não veio e não é obrigatório. */
function termo(args: Obj, campo: string, obrigatorio: boolean): string | null {
  const v = typeof args[campo] === "string" ? (args[campo] as string).trim() : "";
  if (!v) {
    if (obrigatorio) throw new Error(`Falta o nome (${campo}) pra buscar.`);
    return null;
  }
  if (v.length < 2) throw new Error(`Escreva pelo menos 2 letras no nome (${campo}).`);
  return v.slice(0, 60);
}

/** Cada palavra precisa aparecer no nome (filtro no banco, nunca na tela). */
const palavras = (t: string) => t.split(/\s+/).filter(Boolean).slice(0, 5).map((p) => `%${semCuringa(p)}%`);

function inteiro(v: unknown, padrao: number, min: number, max: number) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && v != null ? Math.min(max, Math.max(min, n)) : padrao;
}

/** Preço por unidade: 2 casas; item barato (luva, sachê) fica com 4. */
const preco = (n: number) => (Math.abs(n) < 1 ? Math.round(n * 10000) / 10000 : r2(n));

const fatorDe = (f: unknown) => (Number(f) > 0 ? Number(f) : 1);

const umDe = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const quando = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

type ProdutoAchado = { id: string; nome: string; unidade: string };

async function acharProdutos(db: Db, ctx: ContextoFerramenta, t: string, limite: number, campos = "id, nome, unidade") {
  let q = db.from("produtos").select(campos).eq("empresa_id", ctx.empresaId).eq("ativo", true);
  for (const p of palavras(t)) q = q.ilike("nome", p);
  const { data, error } = await q.order("nome").limit(limite);
  if (error) throw new Error("Não consegui buscar os produtos agora. Tente de novo.");
  return (data as unknown as (ProdutoAchado & Obj)[]) ?? [];
}

/** Notas (não canceladas) do período cujo fornecedor casa com o texto: pelo cadastro ou pelo nome do emitente. */
async function notasDoFornecedor(db: Db, ctx: ContextoFerramenta, t: string, de: string, ate: string) {
  let qf = db.from("fornecedores").select("id").eq("empresa_id", ctx.empresaId);
  for (const p of palavras(t)) qf = qf.ilike("nome", p);
  const { data: fs } = await qf.limit(30);
  const fIds = ((fs as { id: string }[]) ?? []).map((f) => f.id);

  const base = () =>
    db
      .from("notas_fiscais")
      .select("id, valor, data_emissao, situacao, emit_nome, fornecedores(nome)")
      .eq("empresa_id", ctx.empresaId)
      .gte("data_emissao", de)
      .lte("data_emissao", ate)
      .neq("situacao", "cancelada");
  const [porCadastro, porEmitente] = await Promise.all([
    fIds.length
      ? buscarTodas<Obj>((a, b) => base().in("fornecedor_id", fIds).order("id").range(a, b))
      : Promise.resolve([] as Obj[]),
    buscarTodas<Obj>((a, b) => {
      let q = base();
      for (const p of palavras(t)) q = q.ilike("emit_nome", p);
      return q.order("id").range(a, b);
    }),
  ]);
  const notas = new Map<string, Obj>();
  for (const n of [...porCadastro, ...porEmitente]) notas.set(String(n.id), n);
  return { notas: [...notas.values()], achouCadastro: fIds.length > 0 };
}

const nomeFornecedor = (n: Obj) =>
  umDe(n.fornecedores as { nome: string } | { nome: string }[] | null)?.nome ?? (n.emit_nome as string | null) ?? "Sem fornecedor";

// ---------------------------------------------------------------------------

const buscarProduto: Ferramenta = {
  nome: "estoque_buscar_produto",
  descricao:
    "Procura produtos do estoque pelo nome (até 8). Para cada um devolve: unidade em que é contado, categoria, estoque ideal, fardo, " +
    "preço de referência (preço por unidade da última compra lançada), fornecedores ligados (só o nome), a quantidade na ÚLTIMA " +
    "contagem finalizada que incluiu o produto (com data e nome da contagem) e quanto gasta por semana (média das últimas 8 semanas, " +
    "mesma conta da tela Consumo). Use para 'quanto tem de queijo', 'qual o estoque ideal da embalagem coex', 'quem fornece tal produto', " +
    "'quanto a gente gasta de farinha por semana'.",
  telas: ["/produtos", "/contagens"],
  parametros: {
    type: "object",
    properties: {
      busca: { type: "string", minLength: 2, maxLength: 60, description: "Parte do nome do produto, ex.: 'queijo', 'embalagem coex'." },
    },
    required: ["busca"],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const t = termo(args, "busca", true)!;
    const achados = await acharProdutos(
      db, ctx, t, 9,
      "id, nome, unidade, estoque_ideal, fardo, preco_referencia, contagem_sim_nao, medida, tamanhos, categorias(nome)",
    );
    if (achados.length === 0) return { encontrados: 0, aviso: `Nenhum produto ativo com "${t}" no nome.` };
    const prods = achados.slice(0, 8);
    const ids = prods.map((p) => p.id);
    const desde8 = somaDias(ctx.hoje, -56);

    const [{ data: vinc }, ultimas, periodos] = await Promise.all([
      db.from("fornecedor_produto").select("produto_id, fornecedores(nome, ativo)").eq("empresa_id", ctx.empresaId).in("produto_id", ids),
      Promise.all(
        ids.map((id) =>
          db
            .from("contagem_itens")
            .select("qtd_estoque, precisa_comprar, contagens!inner(data, criado_em, descricao, status, empresa_id)")
            .eq("produto_id", id)
            .eq("contagens.status", "finalizada")
            .eq("contagens.empresa_id", ctx.empresaId)
            .order("contagens(data)", { ascending: false })
            .order("contagens(criado_em)", { ascending: false })
            .limit(1)
            .then((r) => ((r.data as Obj[] | null) ?? [])[0] ?? null),
        ),
      ),
      // Mesma função e mesma média da tela /contagens/consumo.
      buscarTodas<{ produto_id: string; fim: string; consumo: number; dias: number; fator_suspeito: number | null }>((a, b) =>
        db.rpc("consumo_periodos", { p_desde: desde8 }).in("produto_id", ids).order("produto_id").order("fim").range(a, b),
      ),
    ]);

    const fornPor = new Map<string, string[]>();
    for (const v of (vinc as Obj[] | null) ?? []) {
      const f = umDe(v.fornecedores as { nome: string; ativo: boolean } | null);
      if (!f || !f.ativo) continue;
      const l = fornPor.get(String(v.produto_id)) ?? [];
      l.push(f.nome);
      fornPor.set(String(v.produto_id), l);
    }

    return {
      encontrados: achados.length > 8 ? "mais de 8 (mostrando os 8 primeiros; peça um nome mais completo)" : achados.length,
      produtos: prods.map((p, i) => {
        const u = ultimas[i];
        const c = u ? umDe(u.contagens as Obj | Obj[]) : null;
        const ps = periodos.filter((x) => x.produto_id === p.id && Number(x.consumo) >= 0 && x.fator_suspeito == null && x.fim.slice(0, 10) >= desde8);
        const dias = ps.reduce((s, x) => s + Number(x.dias), 0);
        const consumo = dias >= 3 ? r2((ps.reduce((s, x) => s + Number(x.consumo), 0) / dias) * 7) : null;
        const fardo = Number(p.fardo) || 0;
        const tamanhos = (p.tamanhos as number[] | null) ?? [];
        return {
          nome: p.nome,
          unidade: p.unidade,
          categoria: umDe(p.categorias as { nome: string } | null)?.nome ?? "Sem categoria",
          estoque_ideal: Number(p.estoque_ideal) || 0,
          ...(fardo > 1 ? { fardo } : {}),
          ...(tamanhos.length ? { tamanhos: `${tamanhos.join(" / ")} ${p.medida ?? "kg"} (contado em unidade)` } : {}),
          ...(p.contagem_sim_nao ? { contagem: "só 'precisa comprar?' (sem quantidade)" } : {}),
          preco_referencia: p.preco_referencia != null ? preco(Number(p.preco_referencia)) : null,
          fornecedores: fornPor.get(p.id) ?? [],
          ultima_contagem: c
            ? {
                data: String(c.data),
                contagem: c.descricao ?? null,
                ...(typeof u!.precisa_comprar === "boolean"
                  ? { precisa_comprar: u!.precisa_comprar ? "sim" : "não" }
                  : { quantidade: r2(Number(u!.qtd_estoque)) }),
              }
            : null,
          consumo_por_semana: consumo,
        };
      }),
    };
  },
};

// ---------------------------------------------------------------------------

const contagens: Ferramenta = {
  nome: "estoque_contagens",
  descricao:
    "Lista as últimas contagens de estoque (data, nome, finalizada ou rascunho, nº de itens). Com `tipo` filtra pelo nome da contagem " +
    "('Estoque', 'Bebidas', 'Embalagens'). Com `faltas: true` também devolve, da contagem FINALIZADA mais recente da lista, o que está " +
    "abaixo do estoque ideal e a sugestão de compra (mesma conta da cotação: ideal − contado, arredondado para fardo fechado). " +
    "Use para 'quando foi a última contagem de bebidas', 'o que está faltando no estoque', 'o que precisa comprar'.",
  telas: ["/contagens"],
  parametros: {
    type: "object",
    properties: {
      tipo: { type: "string", minLength: 2, maxLength: 60, description: "Parte do nome da contagem, ex.: 'Bebidas', 'Estoque', 'Embalagens'." },
      limite: { type: "integer", minimum: 1, maximum: 15, description: "Quantas contagens listar (padrão 8)." },
      faltas: { type: "boolean", description: "true = trazer também o que ficou abaixo do ideal na última contagem finalizada." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const t = termo(args, "tipo", false);
    const limite = inteiro(args.limite, 8, 1, 15);
    let q = db
      .from("contagens")
      .select("id, descricao, data, status, contagem_itens(count)")
      .eq("empresa_id", ctx.empresaId);
    if (t) for (const p of palavras(t)) q = q.ilike("descricao", p);
    const { data, error } = await q.order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(limite);
    if (error) throw new Error("Não consegui ler as contagens agora. Tente de novo.");
    const lista = (data as Obj[] | null) ?? [];
    if (lista.length === 0) return { contagens: [], aviso: t ? `Nenhuma contagem com "${t}" no nome.` : "Nenhuma contagem ainda." };

    const resposta: Obj = {
      contagens: lista.map((c) => ({
        data: c.data,
        nome: c.descricao,
        status: c.status === "finalizada" ? "finalizada" : "rascunho",
        itens: Number(umDe(c.contagem_itens as { count: number }[])?.count ?? 0),
      })),
    };
    if (args.faltas !== true) return resposta;

    const base = lista.find((c) => c.status === "finalizada");
    if (!base) return { ...resposta, faltas: "Nenhuma contagem finalizada nesta lista." };
    const cid = String(base.id);
    const [itens, { data: atrib }, prods] = await Promise.all([
      buscarTodas<{ produto_id: string; qtd_estoque: number; precisa_comprar: boolean | null }>((a, b) =>
        db.from("contagem_itens").select("produto_id, qtd_estoque, precisa_comprar").eq("contagem_id", cid).order("id").range(a, b),
      ),
      db.from("contagem_atribuicoes").select("categoria_id").eq("contagem_id", cid),
      buscarTodas<{ id: string; nome: string; unidade: string; estoque_ideal: number; fardo: number; categoria_id: string | null }>((a, b) =>
        db
          .from("produtos")
          .select("id, nome, unidade, estoque_ideal, fardo, categoria_id")
          .eq("empresa_id", ctx.empresaId)
          .eq("ativo", true)
          .order("nome")
          .order("id")
          .range(a, b),
      ),
    ]);
    // Igual à cotação feita a partir da contagem: entra o que foi contado e o
    // que era da lista (categorias atribuídas) — deixado em branco vale 0.
    const contado = new Map<string, number>();
    const simNao = new Map<string, boolean>();
    for (const i of itens) {
      contado.set(i.produto_id, Number(i.qtd_estoque) || 0);
      if (typeof i.precisa_comprar === "boolean") simNao.set(i.produto_id, i.precisa_comprar);
    }
    const cats = new Set(((atrib as { categoria_id: string | null }[]) ?? []).map((a) => a.categoria_id).filter(Boolean));
    const faltas: Obj[] = [];
    for (const p of prods) {
      if (!contado.has(p.id) && !(p.categoria_id && cats.has(p.categoria_id))) continue;
      const cont = contado.get(p.id) ?? 0;
      const ideal = Number(p.estoque_ideal) || 0;
      const fardo = Number(p.fardo) || 0;
      const sn = simNao.get(p.id);
      const bruta = sn === undefined ? Math.max(0, ideal - cont) : sn ? Math.max(ideal, fardo > 1 ? fardo : 1) : 0;
      const sugestao = fardo > 1 && bruta > 0 ? Math.ceil(bruta / fardo) * fardo : bruta;
      if (sugestao <= 0) continue;
      faltas.push({
        produto: p.nome,
        unidade: p.unidade,
        ...(sn === undefined ? { contado: r2(cont) } : { precisa_comprar: "sim" }),
        ideal,
        sugestao: r2(sugestao),
      });
    }
    return {
      ...resposta,
      faltas_da_contagem: { data: base.data, nome: base.descricao, total_abaixo_do_ideal: faltas.length, itens: faltas.slice(0, 30) },
      ...(faltas.length > 30 ? { aviso: `Mostrando 30 de ${faltas.length}. A lista inteira está na contagem / cotação.` } : {}),
    };
  },
};

// ---------------------------------------------------------------------------

type ItemNota = {
  produto_id: string | null;
  qtd: number;
  valor_unit: number | null;
  valor_total: number | null;
  fator: number | null;
  unidade: string | null;
  notas_fiscais: Obj | Obj[];
};

const SEL_ITEM_NOTA =
  "produto_id, qtd, valor_unit, valor_total, fator, unidade, notas_fiscais!inner(id, data_emissao, situacao, emit_nome, empresa_id, fornecedores(nome))";

/** Itens de nota (não cancelada, sem destino) desses produtos, no período de emissão. */
function itensDosProdutos(db: Db, ctx: ContextoFerramenta, ids: string[], de: string, ate: string) {
  return buscarTodas<ItemNota>((a, b) =>
    db
      .from("nota_itens")
      .select(SEL_ITEM_NOTA)
      .in("produto_id", ids)
      .is("destino", null)
      .eq("notas_fiscais.empresa_id", ctx.empresaId)
      .neq("notas_fiscais.situacao", "cancelada")
      .gte("notas_fiscais.data_emissao", de)
      .lte("notas_fiscais.data_emissao", ate)
      .order("id")
      .range(a, b),
  );
}

const compras: Ferramenta = {
  nome: "compras_no_periodo",
  descricao:
    "Compras pelas notas fiscais de entrada (data de EMISSÃO; inclui notas ainda não lançadas, exclui canceladas e itens para sócios/" +
    "funcionário — igual ao CMV). Sem filtro: total gasto, nº de notas e os fornecedores que mais venderam. Com `fornecedor`: total, nº de " +
    "notas e os produtos que mais pesaram. Com `produto`: por produto, quantidade comprada (na unidade da contagem), total, preço médio por " +
    "unidade e o último preço pago (com fornecedor e data). Período até 93 dias; sem datas = últimos 30 dias. Use para 'quanto pagamos no " +
    "queijo no último mês', 'quanto gastamos com o fornecedor de embalagens em outubro', 'quem mais vendeu pra nós'.",
  telas: ["/notas"],
  parametros: {
    type: "object",
    properties: {
      de: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Início (AAAA-MM-DD), pela data de emissão da nota." },
      ate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Fim (AAAA-MM-DD). Sem ele = até hoje." },
      fornecedor: { type: "string", minLength: 2, maxLength: 60, description: "Parte do nome do fornecedor." },
      produto: { type: "string", minLength: 2, maxLength: 60, description: "Parte do nome do produto." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const { de, ate } = periodoPadrao(args, ctx, 30, 93);
    const tf = termo(args, "fornecedor", false);
    const tp = termo(args, "produto", false);

    // Por produto (com ou sem fornecedor junto).
    if (tp) {
      const achados = await acharProdutos(db, ctx, tp, 11);
      if (achados.length === 0) return { periodo: { de, ate }, aviso: `Nenhum produto ativo com "${tp}" no nome.` };
      const prods = achados.slice(0, 10);
      let itens = await itensDosProdutos(db, ctx, prods.map((p) => p.id), de, ate);
      if (tf) {
        const { notas } = await notasDoFornecedor(db, ctx, tf, de, ate);
        const ok = new Set(notas.map((n) => String(n.id)));
        itens = itens.filter((i) => ok.has(String(umDe(i.notas_fiscais)?.id)));
      }
      const linhas = prods.map((p) => {
        const its = itens.filter((i) => i.produto_id === p.id);
        let qtd = 0;
        let total = 0;
        const notas = new Set<string>();
        let ultimo: { data: string; fornecedor: string; preco: number } | null = null;
        for (const i of its) {
          const nf = umDe(i.notas_fiscais)!;
          qtd += Number(i.qtd) * fatorDe(i.fator);
          total += Number(i.valor_total ?? 0);
          notas.add(String(nf.id));
          const data = String(nf.data_emissao);
          if (i.valor_unit != null && (!ultimo || data >= ultimo.data))
            ultimo = { data, fornecedor: nomeFornecedor(nf), preco: preco(Number(i.valor_unit) / fatorDe(i.fator)) };
        }
        return its.length === 0
          ? { produto: p.nome, compras: 0 }
          : {
              produto: p.nome,
              unidade: p.unidade,
              notas: notas.size,
              quantidade: r2(qtd),
              total: r2(total),
              preco_medio_por_unidade: qtd > 0 ? preco(total / qtd) : null,
              ultimo_preco: ultimo,
            };
      });
      return {
        periodo: { de, ate },
        ...(tf ? { fornecedor_filtro: tf } : {}),
        produtos: linhas,
        ...(achados.length > 10 ? { aviso: "Mais de 10 produtos com esse nome; mostrando 10. Peça um nome mais completo." } : {}),
        obs: "Quantidade e preço na unidade em que o produto é contado (nota em caixa já convertida pelo fator).",
      };
    }

    // Por fornecedor.
    if (tf) {
      const { notas } = await notasDoFornecedor(db, ctx, tf, de, ate);
      if (notas.length === 0) return { periodo: { de, ate }, aviso: `Nenhuma nota de fornecedor com "${tf}" no nome nesse período.` };
      const porForn = new Map<string, { total: number; notas: number }>();
      for (const n of notas) {
        const k = nomeFornecedor(n);
        const o = porForn.get(k) ?? { total: 0, notas: 0 };
        o.total += Number(n.valor ?? 0);
        o.notas += 1;
        porForn.set(k, o);
      }
      const itens = await buscarPorLotes<{ produto_id: string | null; qtd: number; valor_total: number | null; fator: number | null; produtos: Obj | null }>(
        notas.map((n) => String(n.id)),
        (lote) =>
          db.from("nota_itens").select("produto_id, qtd, valor_total, fator, produtos(nome, unidade)").in("nota_id", lote).is("destino", null),
      );
      const porProd = new Map<string, { nome: string; unidade: string; qtd: number; total: number }>();
      let semProduto = 0;
      for (const i of itens) {
        const pr = umDe(i.produtos as Obj | Obj[] | null);
        if (!i.produto_id || !pr) { semProduto += Number(i.valor_total ?? 0); continue; }
        const o = porProd.get(i.produto_id) ?? { nome: String(pr.nome), unidade: String(pr.unidade), qtd: 0, total: 0 };
        o.qtd += Number(i.qtd) * fatorDe(i.fator);
        o.total += Number(i.valor_total ?? 0);
        porProd.set(i.produto_id, o);
      }
      const top = [...porProd.values()].sort((a, b) => b.total - a.total);
      return {
        periodo: { de, ate },
        total_das_notas: r2(notas.reduce((s, n) => s + Number(n.valor ?? 0), 0)),
        notas: notas.length,
        nao_lancadas: notas.filter((n) => n.situacao === "pendente").length,
        fornecedores: [...porForn.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([nome, o]) => ({ nome, total: r2(o.total), notas: o.notas })),
        produtos_que_mais_pesaram: top.slice(0, 15).map((p) => ({
          produto: p.nome,
          quantidade: r2(p.qtd),
          unidade: p.unidade,
          total: r2(p.total),
          preco_medio_por_unidade: p.qtd > 0 ? preco(p.total / p.qtd) : null,
        })),
        ...(semProduto > 0 ? { itens_sem_produto_ligado: r2(semProduto) } : {}),
      };
    }

    // Geral: por fornecedor.
    const notas = await buscarTodas<Obj>((a, b) =>
      db
        .from("notas_fiscais")
        .select("id, valor, situacao, emit_nome, fornecedores(nome)")
        .eq("empresa_id", ctx.empresaId)
        .gte("data_emissao", de)
        .lte("data_emissao", ate)
        .neq("situacao", "cancelada")
        .order("id")
        .range(a, b),
    );
    const porForn = new Map<string, { total: number; notas: number }>();
    for (const n of notas) {
      const k = nomeFornecedor(n);
      const o = porForn.get(k) ?? { total: 0, notas: 0 };
      o.total += Number(n.valor ?? 0);
      o.notas += 1;
      porForn.set(k, o);
    }
    return {
      periodo: { de, ate },
      total_das_notas: r2(notas.reduce((s, n) => s + Number(n.valor ?? 0), 0)),
      notas: notas.length,
      nao_lancadas: notas.filter((n) => n.situacao === "pendente").length,
      fornecedores: [...porForn.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 15).map(([nome, o]) => ({ nome, total: r2(o.total), notas: o.notas })),
      ...(porForn.size > 15 ? { outros_fornecedores: porForn.size - 15 } : {}),
    };
  },
};

// ---------------------------------------------------------------------------

const historicoPreco: Ferramenta = {
  nome: "preco_historico_produto",
  descricao:
    "Histórico de preço de UM produto pelas notas de entrada (data de emissão, sem canceladas): cada compra com data, fornecedor, " +
    "quantidade e preço por unidade do produto (nota em caixa já dividida pelo fator), mais menor, maior, primeiro × último e o preço " +
    "de referência atual. Se o nome casar com vários produtos, devolve a lista para a pessoa escolher. Use para 'o queijo subiu?', " +
    "'quanto pagamos na mussarela nos últimos meses', 'qual fornecedor fez o menor preço'.",
  telas: ["/notas", "/produtos"],
  parametros: {
    type: "object",
    properties: {
      produto: { type: "string", minLength: 2, maxLength: 60, description: "Nome (ou parte) do produto." },
      meses: { type: "integer", minimum: 1, maximum: 12, description: "Quantos meses para trás (padrão 6)." },
    },
    required: ["produto"],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const t = termo(args, "produto", true)!;
    const meses = inteiro(args.meses, 6, 1, 12);
    const achados = await acharProdutos(db, ctx, t, 8, "id, nome, unidade, preco_referencia");
    if (achados.length === 0) return { aviso: `Nenhum produto ativo com "${t}" no nome.` };
    const exato = achados.find((p) => p.nome.trim().toLowerCase() === t.toLowerCase());
    if (!exato && achados.length > 1)
      return { varios_produtos: achados.map((p) => p.nome), aviso: "Mais de um produto com esse nome: pergunte qual e chame de novo com o nome completo." };
    const p = exato ?? achados[0];
    const de = somaDias(ctx.hoje, -Math.round(meses * 30.5));
    const itens = (await itensDosProdutos(db, ctx, [p.id], de, ctx.hoje)).filter((i) => i.valor_unit != null && Number(i.valor_unit) > 0);
    const linhas = itens
      .map((i) => {
        const nf = umDe(i.notas_fiscais)!;
        const f = fatorDe(i.fator);
        return {
          data: String(nf.data_emissao),
          fornecedor: nomeFornecedor(nf),
          quantidade: r2(Number(i.qtd) * f),
          preco_por_unidade: preco(Number(i.valor_unit) / f),
          ...(f !== 1 ? { na_nota: `${r2(Number(i.qtd))} ${i.unidade ?? ""} × ${f} a ${preco(Number(i.valor_unit))}`.replace(/\s+/g, " ") } : {}),
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data));
    const base = { produto: p.nome, unidade: p.unidade, preco_referencia: p.preco_referencia != null ? preco(Number(p.preco_referencia)) : null, desde: de };
    if (linhas.length === 0) return { ...base, compras: 0, aviso: "Nenhuma compra desse produto nas notas do período." };
    const precos = linhas.map((l) => l.preco_por_unidade);
    const menor = linhas.reduce((m, l) => (l.preco_por_unidade < m.preco_por_unidade ? l : m));
    const maior = linhas.reduce((m, l) => (l.preco_por_unidade > m.preco_por_unidade ? l : m));
    const primeiro = linhas[linhas.length - 1];
    const ultimo = linhas[0];
    return {
      ...base,
      compras: linhas.length,
      menor: { preco: menor.preco_por_unidade, data: menor.data, fornecedor: menor.fornecedor },
      maior: { preco: maior.preco_por_unidade, data: maior.data, fornecedor: maior.fornecedor },
      media_simples: preco(precos.reduce((s, x) => s + x, 0) / precos.length),
      variacao_primeiro_ultimo_pct: primeiro.preco_por_unidade > 0 ? r2(((ultimo.preco_por_unidade - primeiro.preco_por_unidade) / primeiro.preco_por_unidade) * 100) : null,
      ultimas_compras: linhas.slice(0, 20),
    };
  },
};

// ---------------------------------------------------------------------------

const cotacoes: Ferramenta = {
  nome: "cotacoes_recentes",
  descricao:
    "Últimas cotações de compra: nome, data, aberta/fechada (aberta com prazo de resposta vencido conta como fechada), prazo de resposta, " +
    "nº de itens, quantos fornecedores foram convidados e responderam (com o nome de quem ainda não respondeu) e quantos pedidos foram " +
    "gerados. Use para 'a cotação de hoje já foi respondida?', 'quem falta responder', 'quantos pedidos saíram da cotação'.",
  telas: ["/cotacoes"],
  parametros: {
    type: "object",
    properties: {
      limite: { type: "integer", minimum: 1, maximum: 10, description: "Quantas cotações (padrão 5)." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const limite = inteiro(args.limite, 5, 1, 10);
    const { data, error } = await db
      .from("cotacoes")
      .select("descricao, data, status, respostas_ate, cotacao_itens(count), pedidos(count), cotacao_fornecedores(status, fornecedores(nome)), contagens(descricao)")
      .eq("empresa_id", ctx.empresaId)
      .order("criado_em", { ascending: false })
      .limit(limite);
    if (error) throw new Error("Não consegui ler as cotações agora. Tente de novo.");
    const agora = Date.now();
    return {
      cotacoes: ((data as Obj[] | null) ?? []).map((c) => {
        const forn = (c.cotacao_fornecedores as { status: string; fornecedores: { nome: string } | null }[] | null) ?? [];
        const faltam = forn.filter((f) => f.status !== "respondido").map((f) => umDe(f.fornecedores)?.nome ?? "?");
        const prazo = c.respostas_ate as string | null;
        const venceu = !!prazo && new Date(prazo).getTime() <= agora;
        return {
          nome: c.descricao,
          data: c.data,
          status: c.status === "fechada" ? "fechada" : venceu ? "fechada (prazo de resposta venceu)" : "aberta",
          ...(prazo ? { respostas_ate: quando(prazo) } : {}),
          base: umDe(c.contagens as { descricao: string } | null)?.descricao ?? "sem contagem (só o ideal)",
          itens: Number(umDe(c.cotacao_itens as { count: number }[])?.count ?? 0),
          fornecedores_convidados: forn.length,
          responderam: forn.length - faltam.length,
          ...(faltam.length ? { faltam_responder: faltam.slice(0, 12) } : {}),
          pedidos_gerados: Number(umDe(c.pedidos as { count: number }[])?.count ?? 0),
        };
      }),
    };
  },
};

// ---------------------------------------------------------------------------

const pedidos: Ferramenta = {
  nome: "pedidos_de_compra",
  descricao:
    "Pedidos de compra aos fornecedores (os da tela Conferência) num período pela data do pedido (padrão: últimos 14 dias, até 62). " +
    "Para cada um: fornecedor, data, dia previsto de entrega, total, situação da entrega (aguardando, atrasado sem resposta, não veio, " +
    "chegou — confirmado pela equipe —, conferido no painel), se tem nota ligada e nº de divergências. `so_abertos: true` traz só o que " +
    "ainda não chegou. Use para 'o pedido da Deale já chegou?', 'o que está para chegar', 'quais entregas atrasaram'.",
  telas: ["/conferencia"],
  parametros: {
    type: "object",
    properties: {
      de: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Início (AAAA-MM-DD), pela data do pedido." },
      ate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Fim (AAAA-MM-DD)." },
      fornecedor: { type: "string", minLength: 2, maxLength: 60, description: "Parte do nome do fornecedor." },
      so_abertos: { type: "boolean", description: "true = só pedidos que ainda não chegaram." },
    },
    required: [],
    additionalProperties: false,
  },
  async executar(db, args, ctx) {
    const { de, ate } = periodoPadrao(args, ctx, 14, 62);
    const tf = termo(args, "fornecedor", false);
    let q = db
      .from("pedidos")
      .select(
        "id, data, status, conf_colab_em, conf_colab_por, nao_veio_em, cobrar_conf, divergencias_n, dia_entrega:pedido_dia_entrega, fornecedores(nome), cotacoes(descricao), pedido_itens(qtd, preco_unit), notas_fiscais(id)",
      )
      .eq("empresa_id", ctx.empresaId)
      .gte("data", de)
      .lte("data", ate);
    if (tf) {
      let qf = db.from("fornecedores").select("id").eq("empresa_id", ctx.empresaId);
      for (const p of palavras(tf)) qf = qf.ilike("nome", p);
      const { data: fs } = await qf.limit(30);
      const ids = ((fs as { id: string }[]) ?? []).map((f) => f.id);
      if (ids.length === 0) return { periodo: { de, ate }, aviso: `Nenhum fornecedor com "${tf}" no nome.` };
      q = q.in("fornecedor_id", ids);
    }
    if (args.so_abertos === true) q = q.in("status", ["rascunho", "enviado"]).is("conf_colab_em", null).is("nao_veio_em", null);
    const { data, error } = await q.order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(300);
    if (error) throw new Error("Não consegui ler os pedidos agora. Tente de novo.");

    const linhas = ((data as Obj[] | null) ?? []).map((p) => {
      const dia = String(p.dia_entrega ?? p.data).slice(0, 10);
      const itens = (p.pedido_itens as { qtd: number; preco_unit: number | null }[] | null) ?? [];
      const situacao = p.nao_veio_em
        ? "não veio"
        : p.conf_colab_em
          ? `chegou (equipe${p.conf_colab_por ? `: ${String(p.conf_colab_por).trim().split(/\s+/)[0]}` : ""}, ${quando(p.conf_colab_em as string)})`
          : p.status === "conferido"
            ? "conferido no painel"
            : p.status === "recebido"
              ? "recebido no painel"
              : dia < ctx.hoje
                ? p.cobrar_conf
                  ? "atrasado / sem resposta da equipe"
                  : "sem confirmação de chegada"
                : "aguardando entrega";
      return {
        fornecedor: umDe(p.fornecedores as { nome: string } | null)?.nome ?? "—",
        data: p.data,
        entrega: dia,
        cotacao: umDe(p.cotacoes as { descricao: string } | null)?.descricao ?? "compra direta",
        total: r2(itens.reduce((s, i) => s + (Number(i.preco_unit) || 0) * Number(i.qtd), 0)),
        situacao,
        nota_ligada: ((p.notas_fiscais as unknown[] | null) ?? []).length > 0,
        ...(Number(p.divergencias_n) > 0 ? { divergencias: Number(p.divergencias_n) } : {}),
      };
    });
    const resumo: Record<string, number> = {};
    for (const l of linhas) {
      const k = l.situacao.startsWith("chegou") ? "chegou" : l.situacao;
      resumo[k] = (resumo[k] ?? 0) + 1;
    }
    return {
      periodo: { de, ate },
      pedidos: linhas.length,
      total: r2(linhas.reduce((s, l) => s + l.total, 0)),
      por_situacao: resumo,
      lista: linhas.slice(0, 25),
      ...(linhas.length > 25 ? { aviso: `Mostrando 25 de ${linhas.length}; filtre por fornecedor ou período menor.` } : {}),
    };
  },
};

export const FERRAMENTAS_ESTOQUE: Ferramenta[] = [buscarProduto, contagens, compras, historicoPreco, cotacoes, pedidos];
