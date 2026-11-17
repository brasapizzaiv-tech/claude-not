import { criarContagemAvulsa } from "@/app/(painel)/contagens/actions";
import { salvarIdealFardo } from "@/app/(painel)/produtos/actions";
import { criarCotacaoId } from "@/app/(painel)/cotacoes/actions";
import { semCuringa } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import type { ContextoFerramenta, Db } from "../ferramentas/tipos";
import { texto, type Acao } from "./tipos";

// Ações do Ajudante: ESTOQUE E COMPRAS. `preparar` só lê (cliente da sessão,
// busca por nome sempre no banco com ilike); `executar` chama a mesma função da
// tela. "+ Nova contagem" (criarContagem) ficou de fora porque termina em
// redirect(); a cotação usa criarCotacaoId (a mesma conta, sem ir pra página).

type Obj = Record<string, unknown>;

const MAX_IDEAL = 100000;
const MAX_FARDO = 10000;
const MAX_CATEGORIAS = 15;

/** Cada palavra precisa aparecer no nome (até 5 palavras, curingas escapados). */
const palavras = (t: string) =>
  t
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((p) => `%${semCuringa(p)}%`);

const normal = (s: string) => s.trim().toLocaleLowerCase("pt-BR");

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Nome de busca: 2 a 60 letras. */
function nomeBusca(v: unknown, rotulo: string): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < 2) throw new Error(`Escreva pelo menos 2 letras do nome (${rotulo}).`);
  if (t.length > 60) throw new Error(`O nome (${rotulo}) está comprido demais: até 60 letras.`);
  return t;
}

/** Número opcional ≥ 0 e ≤ máximo (aceita "1,5"). `undefined` quando não veio. */
function numeroOpcional(args: Obj, campo: string, maximo: number, rotulo: string): number | undefined {
  const v = args[campo];
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${rotulo} precisa ser um número.`);
  if (n < 0) throw new Error(`${rotulo} não pode ser negativo.`);
  if (n > maximo) throw new Error(`${rotulo} acima de ${num(maximo)} não parece certo. Confira o valor.`);
  return Math.round(n * 1000) / 1000;
}

type Linha = { id: string; nome: string } & Obj;

/**
 * Acha UM registro pelo nome, no banco. Vários com o nome → fica com o de nome
 * igual (sem maiúscula); senão pede pra escolher. Nenhum → sugere até 5 pela
 * palavra mais comprida.
 */
async function acharUm(
  db: Db,
  ctx: ContextoFerramenta,
  busca: { tabela: string; colunas: string; soAtivos: boolean },
  t: string,
  rotulo: string,
): Promise<Linha> {
  const consulta = () => {
    const q = db.from(busca.tabela).select(busca.colunas).eq("empresa_id", ctx.empresaId);
    return busca.soAtivos ? q.eq("ativo", true) : q;
  };
  let q = consulta();
  for (const p of palavras(t)) q = q.ilike("nome", p);
  const { data, error } = await q.order("nome").limit(20);
  if (error) throw new Error(`Não consegui buscar ${rotulo} agora. Tente de novo.`);
  const lista = (data as unknown as Linha[] | null) ?? [];
  if (lista.length === 1) return lista[0];
  if (lista.length > 1) {
    const iguais = lista.filter((x) => normal(x.nome) === normal(t));
    if (iguais.length === 1) return iguais[0];
    const nomes = lista.slice(0, 5).map((x) => x.nome).join("; ");
    throw new Error(`Achei mais de um ${rotulo} com "${t}": ${nomes}${lista.length > 5 ? "; …" : ""}. Qual deles?`);
  }
  // Nenhum: sugestões pela palavra mais comprida.
  const maior = t.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? t;
  const raiz = maior.slice(0, 3);
  const { data: sug } = await consulta().ilike("nome", `%${semCuringa(raiz)}%`).order("nome").limit(5);
  const nomes = ((sug as unknown as Linha[] | null) ?? []).map((x) => x.nome);
  throw new Error(
    nomes.length
      ? `Não achei ${rotulo} com "${t}". Parecidos: ${nomes.join("; ")}.`
      : `Não achei ${rotulo} com "${t}".`,
  );
}

// ---------------------------------------------------------------------------

const criarContagem: Acao = {
  nome: "acao_criar_contagem",
  descricao:
    "Cria uma CONTAGEM AVULSA de estoque (igual ao botão 'Contagem avulsa' em /contagens): só as categorias de produto escolhidas, " +
    "atribuídas a UM colaborador, e já gera o link /contar/... pra ele contar pelo celular. Precisa do nome de pelo menos uma categoria " +
    "(ex.: 'Embalagens', 'Bebidas') e do nome do colaborador que vai contar. Não manda WhatsApp: devolve o link pra pessoa enviar. " +
    "A contagem COMPLETA (botão '+ Nova contagem') não dá pra criar por aqui: diga pra clicar no botão em /contagens.",
  telas: ["/contagens"],
  parametros: {
    type: "object",
    properties: {
      categorias: {
        type: "array",
        minItems: 1,
        maxItems: MAX_CATEGORIAS,
        items: { type: "string", minLength: 2, maxLength: 60 },
        description: "Nomes das categorias de produto a contar, ex.: ['Embalagens'] ou ['Bebidas', 'Laticínios'].",
      },
      colaborador: { type: "string", minLength: 2, maxLength: 60, description: "Nome do colaborador (ativo) que vai fazer a contagem." },
    },
    required: ["categorias", "colaborador"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx: ContextoFerramenta) {
    const brutas = Array.isArray(args.categorias) ? args.categorias : [];
    if (brutas.length === 0) throw new Error("Diga quais categorias contar (ex.: Embalagens).");
    if (brutas.length > MAX_CATEGORIAS) throw new Error(`No máximo ${MAX_CATEGORIAS} categorias numa contagem avulsa.`);
    const nomeColab = nomeBusca(texto(args, "colaborador"), "colaborador");

    const cats: Linha[] = [];
    for (const b of brutas) {
      const t = nomeBusca(b, "categoria");
      const c = await acharUm(db, ctx, { tabela: "categorias", colunas: "id, nome", soAtivos: false }, t, "categoria");
      if (!cats.some((x) => x.id === c.id)) cats.push(c);
    }
    const colab = await acharUm(
      db,
      ctx,
      { tabela: "colaboradores", colunas: "id, nome", soAtivos: true },
      nomeColab,
      "colaborador ativo",
    );

    const { count, error } = await db
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", ctx.empresaId)
      .eq("ativo", true)
      .in(
        "categoria_id",
        cats.map((c) => c.id),
      );
    if (error) throw new Error("Não consegui contar os produtos dessas categorias. Tente de novo.");
    const produtos = count ?? 0;
    if (produtos === 0) throw new Error(`Não há produto ativo em ${cats.map((c) => c.nome).join(", ")}. Nada pra contar.`);

    const nomesCats = cats.map((c) => c.nome).join(", ");
    return {
      resumo: `Criar contagem avulsa de ${nomesCats} para ${colab.nome} contar.`,
      detalhes: [
        `Categorias: ${nomesCats}`,
        `Produtos ativos nelas: ${produtos}`,
        `Quem conta: ${colab.nome}`,
        "Gera o link pra contagem pelo celular (você envia; nada vai sozinho)",
      ],
      dados: { categoria_ids: cats.map((c) => c.id), categorias: nomesCats, colaborador_id: colab.id, colaborador: colab.nome },
    };
  },
  async executar(dados) {
    const ids = Array.isArray(dados.categoria_ids) ? dados.categoria_ids.filter((x): x is string => typeof x === "string") : [];
    const colaboradorId = typeof dados.colaborador_id === "string" ? dados.colaborador_id : "";
    if (!ids.length || !colaboradorId) throw new Error("Faltou a categoria ou o colaborador. Peça de novo.");
    const r = await criarContagemAvulsa(ids, colaboradorId);
    if (!r.ok) throw new Error("Não consegui criar a contagem avulsa. Confira a internet e tente de novo.");
    return `Contagem avulsa de ${String(dados.categorias ?? "")} criada para ${String(dados.colaborador ?? "")}. Link pra mandar: ${SITE_URL}/contar/${r.token}`;
  },
};

// ---------------------------------------------------------------------------

const ajustarProduto: Acao = {
  nome: "acao_ajustar_produto",
  descricao:
    "Muda o ESTOQUE IDEAL e/ou o FARDO de um produto (as colunas 'Ideal' e 'Fardo' da lista em /produtos). Estoque ideal = quanto se " +
    "quer ter sempre (a cotação sugere ideal − contado); fardo = quantas unidades vêm por fardo/caixa (a sugestão fecha fardos inteiros; " +
    "0 = sem fardo). Ambos na unidade do produto. Informe o nome do produto e pelo menos um dos dois valores; se o nome casar com vários " +
    "produtos, a resposta lista os parecidos pra escolher.",
  telas: ["/produtos"],
  parametros: {
    type: "object",
    properties: {
      produto: { type: "string", minLength: 2, maxLength: 60, description: "Nome (ou parte do nome) do produto, ex.: 'mussarela'." },
      estoque_ideal: { type: "number", minimum: 0, maximum: MAX_IDEAL, description: "Novo estoque ideal, na unidade do produto." },
      fardo: { type: "number", minimum: 0, maximum: MAX_FARDO, description: "Novas unidades por fardo (0 = sem fardo)." },
    },
    required: ["produto"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const t = nomeBusca(texto(args, "produto"), "produto");
    const ideal = numeroOpcional(args, "estoque_ideal", MAX_IDEAL, "Estoque ideal");
    const fardo = numeroOpcional(args, "fardo", MAX_FARDO, "Fardo");
    if (ideal === undefined && fardo === undefined) throw new Error("Diga o novo estoque ideal e/ou o fardo.");

    const p = await acharUm(
      db,
      ctx,
      { tabela: "produtos", colunas: "id, nome, unidade, estoque_ideal, fardo", soAtivos: true },
      t,
      "produto",
    );
    const un = String(p.unidade ?? "un");
    const idealAtual = Number(p.estoque_ideal) || 0;
    const fardoAtual = Number(p.fardo) || 0;

    const detalhes: string[] = [`Produto: ${p.nome} (${un})`];
    const dados: Obj = { produto_id: p.id, produto: p.nome };
    const mudancas: string[] = [];
    if (ideal !== undefined) {
      detalhes.push(`Estoque ideal: ${num(idealAtual)} → ${num(ideal)} ${un}`);
      if (ideal !== idealAtual) {
        dados.estoque_ideal = ideal;
        mudancas.push(`ideal ${num(idealAtual)} → ${num(ideal)}`);
      }
    }
    if (fardo !== undefined) {
      const fmt = (n: number) => (n > 0 ? `${num(n)} ${un} por fardo` : "sem fardo");
      detalhes.push(`Fardo: ${fmt(fardoAtual)} → ${fmt(fardo)}`);
      if (fardo !== fardoAtual) {
        dados.fardo = fardo;
        mudancas.push(`fardo ${num(fardoAtual)} → ${num(fardo)}`);
      }
    }
    if (mudancas.length === 0) throw new Error(`${p.nome} já está assim (ideal ${num(idealAtual)}, fardo ${num(fardoAtual)}). Nada pra mudar.`);
    return { resumo: `Mudar ${p.nome}: ${mudancas.join(", ")}.`, detalhes, dados };
  },
  async executar(dados) {
    const id = typeof dados.produto_id === "string" ? dados.produto_id : "";
    if (!id) throw new Error("Faltou o produto. Peça de novo.");
    const nome = String(dados.produto ?? "o produto");
    const feitos: string[] = [];
    for (const campo of ["estoque_ideal", "fardo"] as const) {
      if (typeof dados[campo] !== "number") continue;
      const valor = dados[campo] as number;
      const r = await salvarIdealFardo(id, campo, valor);
      const rotulo = campo === "fardo" ? "fardo" : "estoque ideal";
      if (!r.ok) {
        const antes = feitos.length ? ` (já salvei: ${feitos.join(", ")})` : "";
        throw new Error(`Não consegui salvar o ${rotulo} de ${nome}: ${r.mensagem}${antes}`);
      }
      feitos.push(`${rotulo} ${num(valor)}`);
    }
    if (!feitos.length) throw new Error("Não havia nada pra mudar. Peça de novo.");
    return `${nome}: ${feitos.join(" e ")} salvo${feitos.length > 1 ? "s" : ""}.`;
  },
};

const gerarCotacao: Acao = {
  nome: "acao_gerar_cotacao",
  descricao:
    "Cria uma COTAÇÃO a partir de uma contagem FINALIZADA (igual ao '+ Nova cotação' de /cotacoes escolhendo a contagem). " +
    "Sem nome de contagem, usa a última finalizada; com nome (ex.: 'Bebidas', 'Estoque', 'Embalagens'), usa a mais recente finalizada com esse nome. " +
    "Só CRIA a cotação: as quantidades, os convites e o WhatsApp a pessoa faz na tela da cotação.",
  telas: ["/cotacoes"],
  parametros: {
    type: "object",
    properties: {
      contagem: { type: "string", description: "Parte do nome da contagem (ex.: 'Bebidas'). Vazio = última finalizada." },
      descricao: { type: "string", description: "Nome da cotação (opcional; padrão 'Cotação dd/mm/aaaa')." },
    },
    required: [],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const busca = typeof args.contagem === "string" ? args.contagem.trim().slice(0, 60) : "";
    const descricao = typeof args.descricao === "string" ? args.descricao.trim().slice(0, 80) : "";
    let q = db.from("contagens").select("id, descricao, data, criado_em").eq("empresa_id", ctx.empresaId).eq("status", "finalizada");
    for (const p of busca ? palavras(busca) : []) q = q.ilike("descricao", p);
    const { data, error } = await q.order("criado_em", { ascending: false }).limit(1);
    if (error) throw new Error("Não consegui buscar as contagens agora. Tente de novo.");
    const c = (data as { id: string; descricao: string; data: string | null }[] | null)?.[0];
    if (!c) throw new Error(busca ? `Não achei contagem finalizada com "${busca}".` : "Não achei nenhuma contagem finalizada.");
    const [{ count: itens }, { data: jaTem }] = await Promise.all([
      db.from("contagem_itens").select("id", { count: "exact", head: true }).eq("contagem_id", c.id),
      db.from("cotacoes").select("descricao").eq("contagem_id", c.id).limit(3),
    ]);
    const nomeCot = descricao || `Cotação ${new Date(`${ctx.hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
    const detalhes = [`Contagem: ${c.descricao}`, `Itens contados: ${itens ?? 0}`, `Nome da cotação: ${nomeCot}`];
    const outras = (jaTem as { descricao: string }[] | null) ?? [];
    if (outras.length) detalhes.push(`Atenção: essa contagem já tem cotação (${outras.map((o) => o.descricao).join("; ")}).`);
    detalhes.push("Depois é só abrir a cotação, conferir as quantidades e convidar os fornecedores.");
    return { resumo: `Criar a cotação a partir da contagem "${c.descricao}"`, detalhes, dados: { contagem_id: c.id, descricao: descricao || null } };
  },
  async executar(dados) {
    const r = await criarCotacaoId((dados.descricao as string | null) ?? null, String(dados.contagem_id ?? ""));
    if (!r.ok) throw new Error(r.erro);
    return "Cotação criada. Abra em Estoque e compras → Cotações para conferir as quantidades e convidar os fornecedores.";
  },
};

export const ACOES_ESTOQUE: Acao[] = [criarContagem, ajustarProduto, gerarCotacao];
