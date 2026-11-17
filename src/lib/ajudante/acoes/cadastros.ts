import { semCuringa } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { salvarProduto, definirFornecedoresDoProduto, vincularProdutosAoFornecedor } from "@/app/(painel)/produtos/actions";
import { salvarItem, toggleDisponivelItem } from "@/app/(painel)/salao/actions";
import type { ContextoFerramenta, Db } from "../ferramentas/tipos";
import { formData, texto, type Acao } from "./tipos";

// Ações do Ajudante: CADASTROS (produto de estoque, fornecedor do produto,
// preço/disponível de item do cardápio). `preparar` só lê com o cliente da
// sessão; `executar` chama a MESMA server action da tela:
//  - /produtos: salvarProduto ("+ Adicionar"), vincularProdutosAoFornecedor
//    ("Ligar em lote") e definirFornecedoresDoProduto (coluna Fornecedores).
//  - /salao/cardapio: salvarItem (Editar → preço) e toggleDisponivelItem.
// Essas actions não devolvem erro (gravam e pronto); por isso, depois de
// chamar, o `executar` relê pela sessão e confere se ficou gravado.
// Fornecedor sai só pelo nome (nada de CNPJ, telefone, e-mail).

type Obj = Record<string, unknown>;
type Achado = { id: string; nome: string } & Obj;

/** Mesmas unidades do formulário de /produtos. */
const UNIDADES = ["un", "kg", "g", "L", "ml", "cx", "pct", "fardo", "dz", "saco", "bandeja"];

const moeda = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const num = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/** Texto obrigatório com tamanho máximo. */
function nomeArg(args: Obj, campo: string, max: number): string {
  const v = texto(args, campo, 2);
  if (v.length > max) throw new Error(`O ${campo.replace(/_/g, " ")} passa de ${max} letras.`);
  return v;
}

/** Número opcional ≥ 0 com teto. `null` quando não veio. */
function numeroArg(args: Obj, campo: string, max: number): number | null {
  const v = args[campo];
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${campo.replace(/_/g, " ")} precisa ser um número de 0 pra cima.`);
  if (n > max) throw new Error(`${campo.replace(/_/g, " ")} grande demais (máximo ${num(max)}).`);
  return Math.round(n * 1000) / 1000;
}

/** Cada palavra (de 2+ letras) precisa aparecer no nome. */
const palavras = (t: string) =>
  t.split(/\s+/).filter((p) => p.length >= 2).slice(0, 5).map((p) => `%${semCuringa(p)}%`);

/**
 * Acha UM registro pelo nome (filtro no banco, nunca na tela): nome igual
 * (sem diferença de maiúscula) ganha; senão, todas as palavras no nome.
 * Nenhum ou vários → Error com até 5 sugestões.
 */
async function acharUm(
  db: Db,
  ctx: ContextoFerramenta,
  o: { tabela: string; campos: string; t: string; rotulo: string; ativos?: boolean },
): Promise<Achado> {
  const base = () => {
    let q = db.from(o.tabela).select(o.campos).eq("empresa_id", ctx.empresaId);
    if (o.ativos) q = q.eq("ativo", true);
    return q;
  };
  const { data: iguais, error } = await base().ilike("nome", semCuringa(o.t)).limit(3);
  if (error) throw new Error(`Não consegui buscar ${o.rotulo} agora. Tente de novo.`);
  const ig = (iguais as unknown as Achado[]) ?? [];
  if (ig.length === 1) return ig[0];
  if (ig.length > 1) throw new Error(`Tem ${ig.length} cadastros com o nome "${o.t}" em ${o.rotulo}. Resolva pela tela.`);

  let q = base();
  for (const p of palavras(o.t)) q = q.ilike("nome", p);
  const { data } = await q.order("nome").limit(6);
  const achados = (data as unknown as Achado[]) ?? [];
  if (achados.length === 1) return achados[0];
  if (achados.length > 1) {
    const nomes = achados.slice(0, 5).map((a) => `"${a.nome}"`).join(", ");
    throw new Error(`Achei mais de um em ${o.rotulo} com "${o.t}": ${nomes}${achados.length > 5 ? " e outros" : ""}. Diga qual (nome exato).`);
  }
  // Nenhum: sugere pelo pedaço mais comprido do nome.
  const maior = o.t.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? o.t;
  const { data: perto } = await base().ilike("nome", `%${semCuringa(maior.slice(0, 5))}%`).order("nome").limit(5);
  const sug = ((perto as unknown as Achado[]) ?? []).map((a) => `"${a.nome}"`);
  throw new Error(`Não achei "${o.t}" em ${o.rotulo}.${sug.length ? ` Parecidos: ${sug.join(", ")}.` : ""}`);
}

/** Chama a server action e vira Error com frase se ela lançar ou devolver erro. */
async function chamar<T>(fn: () => Promise<T>, oQue: string): Promise<T> {
  let r: T;
  try {
    r = await fn();
  } catch (e) {
    const m = e instanceof Error && e.message ? e.message : "";
    throw new Error(`Não consegui ${oQue}.${m ? ` ${m}` : ""}`);
  }
  const o = (r ?? {}) as Obj;
  if (o.ok === false || typeof o.erro === "string") {
    const m = (o.erro as string) || (o.mensagem as string) || "Confira na tela e tente de novo.";
    throw new Error(`Não consegui ${oQue}. ${m}`);
  }
  return r;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ---------------------------------------------------------------------------

const cadastrarProduto: Acao = {
  nome: "acao_cadastrar_produto",
  descricao:
    "Cadastra um produto NOVO de estoque (o '+ Adicionar' de /produtos): nome, categoria do estoque, unidade em que é contado, " +
    "estoque ideal (quanto quer ter sempre; a cotação sugere ideal − contado) e fardo (unidades por fardo; 0 = compra por unidade). " +
    "Os fornecedores que atendem a categoria já entram sozinhos; em `fornecedores` dá pra ligar outros pelo nome. " +
    "Antes de criar, procura produto com nome parecido e recusa se achar (pra não duplicar) — aí mostre os parecidos pra pessoa. " +
    "Pergunte categoria e unidade se a pessoa não disse. Dados fiscais, validade e tamanhos ficam pra tela.",
  telas: ["/produtos"],
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", minLength: 2, maxLength: 80, description: "Nome do produto como vai aparecer na contagem, ex.: 'Queijo Prato Fatiado'." },
      categoria: { type: "string", minLength: 2, maxLength: 60, description: "Categoria do ESTOQUE (não do cardápio), ex.: 'Laticínios', 'Embalagens'." },
      unidade: { type: "string", enum: UNIDADES, description: "Unidade em que é contado." },
      estoque_ideal: { type: "number", minimum: 0, maximum: 100000, description: "Quanto quer ter sempre, na unidade. Padrão 0." },
      fardo: { type: "number", minimum: 0, maximum: 10000, description: "Unidades por fardo/caixa (ex.: 12). 0 ou vazio = por unidade." },
      fornecedores: {
        type: "array",
        maxItems: 5,
        items: { type: "string", minLength: 2, maxLength: 60 },
        description: "Opcional: nomes de fornecedores pra ligar ao produto (além dos que atendem a categoria).",
      },
    },
    required: ["nome", "categoria", "unidade"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const nome = nomeArg(args, "nome", 80).replace(/\s+/g, " ");
    const catTxt = nomeArg(args, "categoria", 60);
    const unidade = str(args.unidade).trim();
    if (!UNIDADES.includes(unidade)) throw new Error(`Unidade inválida. Use uma destas: ${UNIDADES.join(", ")}.`);
    const estoqueIdeal = numeroArg(args, "estoque_ideal", 100000) ?? 0;
    const fardo = numeroArg(args, "fardo", 10000) ?? 0;
    const fornTxts = Array.isArray(args.fornecedores)
      ? [...new Set((args.fornecedores as unknown[]).map((f) => str(f).trim()).filter(Boolean))]
      : [];
    if (fornTxts.length > 5) throw new Error("No máximo 5 fornecedores por vez.");
    for (const f of fornTxts) if (f.length > 60) throw new Error("Nome de fornecedor passa de 60 letras.");

    // Trava de duplicado: nome igual ou com todas as palavras (sem o último
    // caractere das maiores, pra pegar plural/feminino: "queijos" ~ "queijo").
    const radicais = nome
      .split(" ")
      .filter((p) => p.length >= 3)
      .slice(0, 5)
      .map((p) => `%${semCuringa(p.length >= 5 ? p.slice(0, -1) : p)}%`);
    let q = db.from("produtos").select("id, nome").eq("empresa_id", ctx.empresaId).eq("ativo", true);
    for (const r of radicais.length ? radicais : [`%${semCuringa(nome)}%`]) q = q.ilike("nome", r);
    const [{ data: parecidos, error: e1 }, { data: igual }] = await Promise.all([
      q.order("nome").limit(6),
      db.from("produtos").select("id, nome").eq("empresa_id", ctx.empresaId).eq("ativo", true).ilike("nome", semCuringa(nome)).limit(1),
    ]);
    if (e1) throw new Error("Não consegui conferir os produtos agora. Tente de novo.");
    const lista = [...((igual as Achado[]) ?? []), ...((parecidos as Achado[]) ?? [])];
    const nomes = [...new Set(lista.map((p) => p.nome))];
    if (nomes.length) {
      throw new Error(
        `Já existe produto parecido: ${nomes.slice(0, 5).map((n) => `"${n}"`).join(", ")}${nomes.length > 5 ? " e outros" : ""}. ` +
          "Não cadastrei pra não duplicar. Se for mesmo outro produto, cadastre pela tela Produtos (+ Adicionar).",
      );
    }

    const cat = await acharUm(db, ctx, { tabela: "categorias", campos: "id, nome", t: catTxt, rotulo: "categorias do estoque" });
    const forns: Achado[] = [];
    for (const f of fornTxts) {
      const a = await acharUm(db, ctx, { tabela: "fornecedores", campos: "id, nome", t: f, rotulo: "fornecedores", ativos: true });
      if (!forns.some((x) => x.id === a.id)) forns.push(a);
    }
    // Os que a tela liga sozinha (cadastro do fornecedor → categorias que vende).
    const { data: auto } = await db
      .from("fornecedores")
      .select("id, nome")
      .eq("empresa_id", ctx.empresaId)
      .eq("ativo", true)
      .contains("categoria_ids", [cat.id])
      .order("nome")
      .limit(20);
    const autos = ((auto as Achado[]) ?? []).filter((a) => !forns.some((f) => f.id === a.id));

    const detalhes = [
      `Nome: ${nome}`,
      `Categoria: ${cat.nome}`,
      `Unidade: ${unidade}`,
      `Estoque ideal: ${num(estoqueIdeal)} ${unidade}`,
      `Fardo: ${fardo > 0 ? `${num(fardo)} por fardo` : "por unidade"}`,
    ];
    if (forns.length) detalhes.push(`Ligar aos fornecedores: ${forns.map((f) => f.nome).join(", ")}`);
    if (autos.length) detalhes.push(`Entram sozinhos (atendem ${cat.nome}): ${autos.map((f) => f.nome).join(", ")}`);
    if (!forns.length && !autos.length) detalhes.push("Fica sem fornecedor (dá pra ligar depois na coluna Fornecedores).");

    return {
      resumo: `Cadastrar o produto "${nome}" em ${cat.nome}, contado em ${unidade}.`,
      detalhes,
      dados: {
        nome,
        categoria_id: cat.id,
        categoria_nome: cat.nome,
        unidade,
        estoque_ideal: estoqueIdeal,
        fardo,
        fornecedor_ids: forns.map((f) => f.id),
        fornecedor_nomes: forns.map((f) => f.nome),
      },
    };
  },
  async executar(dados, ctx) {
    const nome = str(dados.nome);
    if (!nome) throw new Error("Pedido sem o nome do produto.");
    const supabase = await createClient();
    const doNome = () =>
      supabase
        .from("produtos")
        .select("id")
        .eq("empresa_id", ctx.empresaId)
        .eq("ativo", true)
        .ilike("nome", semCuringa(nome))
        .order("criado_em", { ascending: false })
        .limit(1);
    // Clique duplo / outra pessoa cadastrou no meio tempo.
    const { data: antes } = await doNome();
    if ((antes ?? []).length) throw new Error(`Já existe o produto "${nome}". Não cadastrei de novo.`);

    await chamar(
      () =>
        salvarProduto(
          formData({
            nome,
            categoria_id: str(dados.categoria_id),
            unidade: str(dados.unidade) || "un",
            estoque_ideal: Number(dados.estoque_ideal) || 0,
            fardo: Number(dados.fardo) || 0,
            estoque_minimo: 0,
            origem: "0",
          }),
        ),
      "cadastrar o produto",
    );
    const { data: depois } = await doNome();
    const id = (depois as { id: string }[] | null)?.[0]?.id;
    if (!id) throw new Error("Não consegui cadastrar o produto. Confira na tela Produtos e tente por lá.");

    const fIds = Array.isArray(dados.fornecedor_ids) ? (dados.fornecedor_ids as unknown[]).map(str).filter(Boolean) : [];
    const ligados: string[] = [];
    const nomesF = Array.isArray(dados.fornecedor_nomes) ? (dados.fornecedor_nomes as unknown[]).map(str) : [];
    for (const [i, fid] of fIds.entries()) {
      try {
        await chamar(() => vincularProdutosAoFornecedor([id], fid), "ligar o fornecedor");
        ligados.push(nomesF[i] || "fornecedor");
      } catch {
        // Produto já existe; segue e avisa no fim.
      }
    }
    const faltou = fIds.length - ligados.length;
    return (
      `Produto "${nome}" cadastrado em ${str(dados.categoria_nome) || "estoque"}.` +
      (ligados.length ? ` Ligado a: ${ligados.join(", ")}.` : "") +
      (faltou > 0 ? ` ${faltou} fornecedor(es) não ligaram — ligue na coluna Fornecedores de Produtos.` : "")
    );
  },
};

// ---------------------------------------------------------------------------

type Vinculo = { fornecedor_id: string; fornecedores: { nome: string } | { nome: string }[] | null };
const nomeDoVinculo = (v: Vinculo) => (Array.isArray(v.fornecedores) ? v.fornecedores[0]?.nome : v.fornecedores?.nome) ?? "?";

/** A lista nova de fornecedores do produto, igual ao que a janela "Fornecedores" de /produtos monta. */
function novaLista(atuais: string[], fornecedorId: string, ligar: boolean, exclusivo: boolean): string[] {
  if (!ligar) return atuais.filter((f) => f !== fornecedorId);
  if (exclusivo) return [fornecedorId];
  return atuais.includes(fornecedorId) ? atuais : [...atuais, fornecedorId];
}

const ligarFornecedor: Acao = {
  nome: "acao_ligar_fornecedor",
  descricao:
    "Liga ou desliga um produto do estoque a um fornecedor (a coluna 'Fornecedores' de /produtos). Produto ligado entra na cotação " +
    "daquele fornecedor. `exclusivo: true` = o produto passa a ir SÓ pra esse fornecedor (os outros saem); `exclusivo: false` = deixa de " +
    "ser exclusivo; sem `exclusivo` = mantém como está. Produto exclusivo de outro fornecedor não ganha um segundo: peça exclusivo do novo " +
    "(troca) ou tire o exclusivo antes.",
  telas: ["/produtos"],
  parametros: {
    type: "object",
    properties: {
      produto: { type: "string", minLength: 2, maxLength: 80, description: "Nome do produto do estoque (nome exato de preferência)." },
      fornecedor: { type: "string", minLength: 2, maxLength: 60, description: "Nome do fornecedor." },
      operacao: { type: "string", enum: ["ligar", "desligar"], description: "'ligar' (padrão) ou 'desligar'." },
      exclusivo: { type: "boolean", description: "Opcional. true = só esse fornecedor; false = deixa de ser exclusivo." },
    },
    required: ["produto", "fornecedor"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const pTxt = nomeArg(args, "produto", 80);
    const fTxt = nomeArg(args, "fornecedor", 60);
    const op = str(args.operacao) || "ligar";
    if (op !== "ligar" && op !== "desligar") throw new Error("Operação deve ser 'ligar' ou 'desligar'.");
    const ligar = op === "ligar";
    const excArg = typeof args.exclusivo === "boolean" ? args.exclusivo : null;
    if (!ligar && excArg === true) throw new Error("Não dá pra desligar e marcar exclusivo ao mesmo tempo.");

    const prod = await acharUm(db, ctx, { tabela: "produtos", campos: "id, nome, exclusivo", t: pTxt, rotulo: "produtos", ativos: true });
    const forn = await acharUm(db, ctx, { tabela: "fornecedores", campos: "id, nome", t: fTxt, rotulo: "fornecedores", ativos: true });
    const { data: vs, error } = await db
      .from("fornecedor_produto")
      .select("fornecedor_id, fornecedores(nome)")
      .eq("produto_id", prod.id)
      .limit(200);
    if (error) throw new Error("Não consegui ler os fornecedores do produto agora. Tente de novo.");
    const vinculos = (vs as unknown as Vinculo[]) ?? [];
    const atuais = vinculos.map((v) => v.fornecedor_id);
    const nomeDe = new Map(vinculos.map((v) => [v.fornecedor_id, nomeDoVinculo(v)]));
    nomeDe.set(forn.id, forn.nome);
    const eraExclusivo = !!prod.exclusivo;
    let exclusivo = excArg ?? eraExclusivo;
    const jaLigado = atuais.includes(forn.id);

    if (ligar && jaLigado && exclusivo === eraExclusivo && (!exclusivo || atuais.length <= 1))
      throw new Error(`"${prod.nome}" já está ligado a ${forn.nome}${eraExclusivo ? " (exclusivo)" : ""}.`);
    if (!ligar && !jaLigado) throw new Error(`"${prod.nome}" não está ligado a ${forn.nome}.`);
    if (ligar && !jaLigado && eraExclusivo && excArg === null && atuais.length > 0)
      throw new Error(
        `"${prod.nome}" é exclusivo de ${atuais.map((f) => nomeDe.get(f)).join(", ")}. ` +
          `Pra trocar, peça exclusivo de ${forn.nome} (o atual sai); pra ter os dois, peça pra tirar o exclusivo.`,
      );
    let nova = novaLista(atuais, forn.id, ligar, exclusivo);
    // Exclusivo sem nenhum fornecedor não faz sentido: sai o exclusivo junto.
    if (!nova.length && exclusivo) {
      exclusivo = false;
      nova = novaLista(atuais, forn.id, ligar, exclusivo);
    }
    const saem = atuais.filter((f) => !nova.includes(f));
    // Produto com muitos fornecedores: mostra os 6 primeiros e a contagem.
    const nomesDe = (ids: string[]) =>
      !ids.length
        ? "sem fornecedor"
        : ids.slice(0, 6).map((f) => nomeDe.get(f) ?? "?").join(", ") + (ids.length > 6 ? ` e mais ${ids.length - 6}` : "");
    const detalhes = [
      `Produto: ${prod.nome}`,
      `Antes: ${nomesDe(atuais)}${eraExclusivo ? " (exclusivo)" : ""}`,
      `Depois: ${nomesDe(nova.includes(forn.id) ? [forn.id, ...nova.filter((f) => f !== forn.id)] : nova)}${exclusivo ? " (exclusivo)" : ""}`,
    ];
    if (saem.length && ligar) detalhes.push(`Saem por ser exclusivo: ${nomesDe(saem)}`);
    if (!nova.length) detalhes.push("O produto fica sem fornecedor e não entra em nenhuma cotação.");

    const resumo = ligar
      ? `Ligar "${prod.nome}" a ${forn.nome}${exclusivo ? " como exclusivo" : ""}${saem.length ? ` (sai ${nomesDe(saem)})` : ""}${!exclusivo && eraExclusivo ? " e tirar o exclusivo" : ""}.`
      : `Desligar "${prod.nome}" de ${forn.nome}${!exclusivo && eraExclusivo ? " e tirar o exclusivo" : ""}.`;
    return {
      resumo,
      detalhes,
      dados: { produto_id: prod.id, produto_nome: prod.nome, fornecedor_id: forn.id, fornecedor_nome: forn.nome, ligar, exclusivo },
    };
  },
  async executar(dados, ctx) {
    const produtoId = str(dados.produto_id);
    const fornecedorId = str(dados.fornecedor_id);
    if (!produtoId || !fornecedorId) throw new Error("Pedido sem produto ou fornecedor.");
    const ligar = dados.ligar !== false;
    const exclusivo = dados.exclusivo === true;
    // A action troca a lista inteira: relê a lista de agora pra não apagar
    // um fornecedor ligado por outra pessoa entre o preparar e o clique.
    const supabase = await createClient();
    const { data: vs, error } = await supabase
      .from("fornecedor_produto")
      .select("fornecedor_id")
      .eq("empresa_id", ctx.empresaId)
      .eq("produto_id", produtoId)
      .limit(200);
    if (error) throw new Error("Não consegui ler os fornecedores do produto. Confira a internet e tente de novo.");
    const atuais = ((vs as { fornecedor_id: string }[]) ?? []).map((v) => v.fornecedor_id);
    const nova = novaLista(atuais, fornecedorId, ligar, exclusivo);
    await chamar(() => definirFornecedoresDoProduto(produtoId, nova, exclusivo), "salvar os fornecedores do produto");

    const { data: depois } = await supabase
      .from("fornecedor_produto")
      .select("fornecedor_id")
      .eq("produto_id", produtoId)
      .eq("fornecedor_id", fornecedorId)
      .limit(1);
    if (((depois ?? []).length > 0) !== ligar) throw new Error("Não consegui salvar. Confira na tela Produtos e tente por lá.");
    const p = str(dados.produto_nome) || "Produto";
    const f = str(dados.fornecedor_nome) || "o fornecedor";
    return ligar ? `"${p}" ligado a ${f}${exclusivo ? " (exclusivo)" : ""}.` : `"${p}" desligado de ${f}.`;
  },
};

// ---------------------------------------------------------------------------

type ItemCardapio = {
  id: string;
  nome: string;
  categoria: string | null;
  preco: number;
  promo_preco: number | null;
  ativo: boolean;
  disponivel: boolean;
  por_kg: boolean | null;
  combo: boolean | null;
};
const CAMPOS_ITEM = "id, nome, categoria, preco, promo_preco, ativo, disponivel, por_kg, combo";

const itemCardapio: Acao = {
  nome: "acao_item_cardapio",
  descricao:
    "Muda o PREÇO e/ou deixa DISPONÍVEL / INDISPONÍVEL (ex.: esgotou) um item do cardápio do salão, garçom, PDV e app (tela " +
    "/salao/cardapio). Mostra preço atual → novo. Preço novo precisa ficar entre metade e o dobro do atual; fora disso, ou item com " +
    "preço zero, é pela tela. Não mexe em sabor de pizza, adicional, promoção nem canais. Use o nome exato do item quando houver " +
    "parecidos (ex.: 'Coca Cola Lata' × 'Coca Cola Lata Zero').",
  telas: ["/salao/cardapio"],
  parametros: {
    type: "object",
    properties: {
      item: { type: "string", minLength: 2, maxLength: 80, description: "Nome do item do cardápio, ex.: 'Coca Cola Lata'." },
      preco_novo: { type: "number", minimum: 0.01, maximum: 10000, description: "Opcional: preço novo em reais, ex.: 8.5." },
      disponivel: { type: "boolean", description: "Opcional: true = disponível; false = indisponível (esgotou)." },
    },
    required: ["item"],
    additionalProperties: false,
  },
  async preparar(db, args, ctx) {
    const t = nomeArg(args, "item", 80);
    const precoNovoArg = numeroArg(args, "preco_novo", 10000);
    const dispArg = typeof args.disponivel === "boolean" ? args.disponivel : null;
    if (precoNovoArg == null && dispArg == null) throw new Error("Diga o preço novo e/ou se fica disponível ou indisponível.");

    const item = (await acharUm(db, ctx, { tabela: "pdv_itens", campos: CAMPOS_ITEM, t, rotulo: "itens do cardápio" })) as unknown as ItemCardapio;
    const atual = Math.round(Number(item.preco) * 100) / 100;
    let precoNovo: number | null = null;
    if (precoNovoArg != null) {
      const n = Math.round(precoNovoArg * 100) / 100;
      if (n !== atual) {
        if (n <= 0) throw new Error("Preço novo precisa ser maior que zero.");
        if (atual <= 0) throw new Error(`"${item.nome}" está com preço zero hoje. Mude pela tela Cardápio.`);
        if (n < atual * 0.5 || n > atual * 2)
          throw new Error(
            `${moeda(atual)} → ${moeda(n)} é mudança grande demais pra fazer por aqui (aceito entre ${moeda(atual * 0.5)} e ${moeda(atual * 2)}). ` +
              "Se for isso mesmo, mude pela tela Cardápio (Editar).",
          );
        precoNovo = n;
      }
    }
    const dispNovo = dispArg != null && dispArg !== item.disponivel ? dispArg : null;
    if (precoNovo == null && dispNovo == null)
      throw new Error(`"${item.nome}" já está assim: ${moeda(atual)}, ${item.disponivel ? "disponível" : "indisponível"}.`);

    const detalhes = [`Item: ${item.nome}${item.categoria ? ` (${item.categoria})` : ""}`];
    detalhes.push(precoNovo != null ? `Preço: ${moeda(atual)} → ${moeda(precoNovo)}${item.por_kg ? " o kg" : ""}` : `Preço: ${moeda(atual)} (não muda)`);
    detalhes.push(
      dispNovo != null
        ? `${item.disponivel ? "Disponível" : "Indisponível"} → ${dispNovo ? "Disponível" : "Indisponível"} (em todos os canais)`
        : `${item.disponivel ? "Disponível" : "Indisponível"} (não muda)`,
    );
    if (precoNovo != null && item.promo_preco != null && Number(item.promo_preco) > 0)
      detalhes.push(`Atenção: está em promoção por ${moeda(Number(item.promo_preco))}; o cliente paga a promoção até tirarem na tela.`);
    if (!item.ativo) detalhes.push("Atenção: este item está desativado no cardápio (não aparece pra venda).");
    if (item.combo) detalhes.push("É um combo (só delivery/app).");

    const partes: string[] = [];
    if (precoNovo != null) partes.push(`mudar o preço de "${item.nome}" de ${moeda(atual)} para ${moeda(precoNovo)}`);
    if (dispNovo != null) partes.push(`deixar "${item.nome}" ${dispNovo ? "disponível" : "indisponível"}`);
    const resumo = partes.join(" e ");
    return {
      resumo: resumo.charAt(0).toUpperCase() + resumo.slice(1) + ".",
      detalhes,
      dados: { item_id: item.id, item_nome: item.nome, preco_atual: atual, preco_novo: precoNovo, disponivel: dispNovo },
    };
  },
  async executar(dados, ctx) {
    const id = str(dados.item_id);
    if (!id) throw new Error("Pedido sem o item.");
    const precoNovo = typeof dados.preco_novo === "number" ? dados.preco_novo : null;
    const disp = typeof dados.disponivel === "boolean" ? dados.disponivel : null;
    const supabase = await createClient();
    const ler = async () => {
      const { data, error } = await supabase.from("pdv_itens").select(CAMPOS_ITEM).eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
      if (error) throw new Error("Não consegui ler o item. Confira a internet e tente de novo.");
      if (!data) throw new Error("Esse item não existe mais no cardápio.");
      return data as unknown as ItemCardapio;
    };
    const item = await ler();
    const feito: string[] = [];

    if (precoNovo != null) {
      const atual = Math.round(Number(item.preco) * 100) / 100;
      if (atual !== Number(dados.preco_atual))
        throw new Error(`O preço de "${item.nome}" mudou para ${moeda(atual)} depois do pedido. Peça de novo.`);
      // Sem "completo": a action só grava nome, categoria e preço — manda
      // nome e categoria como estão hoje. Preço com vírgula (a action tira pontos).
      await chamar(
        () => salvarItem(formData({ id, nome: item.nome, categoria: item.categoria ?? "", preco: precoNovo.toFixed(2).replace(".", ",") })),
        "mudar o preço",
      );
      feito.push(`preço ${moeda(atual)} → ${moeda(precoNovo)}`);
    }
    if (disp != null) {
      await chamar(() => toggleDisponivelItem(formData({ id, disponivel: disp ? "1" : "0" })), "mudar a disponibilidade");
      feito.push(disp ? "disponível" : "indisponível");
    }

    const depois = await ler();
    if (precoNovo != null && Math.round(Number(depois.preco) * 100) / 100 !== precoNovo)
      throw new Error(`Não consegui salvar o preço de "${item.nome}". Confira na tela Cardápio.`);
    if (disp != null && depois.disponivel !== disp)
      throw new Error(`Não consegui mudar a disponibilidade de "${item.nome}". Confira na tela Cardápio.`);
    return `"${item.nome}": ${feito.join(", ")}.`;
  },
};

export const ACOES_CADASTROS: Acao[] = [cadastrarProduto, ligarFornecedor, itemCardapio];
