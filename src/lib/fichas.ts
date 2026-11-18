// Fichas técnicas (migration 0320): custo de cada prato com o preço de HOJE.
// Sem servidor aqui (o cálculo roda na tela também). Quem carrega do banco é
// carregarFichas(db).
//
// Custo de um ingrediente:
//  - ligado a PRODUTO: quantidade ÷ conversão × preco_referencia do produto
//    (conversão = quantas unidades da receita cabem em 1 unidade do produto;
//    "Arroz Branco 5kg" (un) com receita em kg → 5). Produto sem preço usa o
//    valor da planilha de 2025 e a ficha avisa.
//  - ligado a OUTRA FICHA (molho branco, massa de panqueca): kg × custo/kg dela.
// Custo/kg da ficha = soma ÷ rendimento (kg que sai pronto).
import { buscarTodas } from "@/lib/supabase/todas";

export type ProdutoPreco = { id: string; nome: string; unidade: string; preco_referencia: number | null };
export type FichaItem = {
  id: string; ficha_id: string; ordem: number; descricao: string;
  produto_id: string | null; sub_ficha_id: string | null;
  quantidade: number; unidade: string; conversao: number | null; preco_planilha: number | null;
};
export type Ficha = {
  id: string; nome: string; categoria: string | null; rendimento_kg: number | null; rendimento_texto: string | null;
  base: boolean; cardapio_item_id: string | null; custo_kg_planilha: number | null; obs: string | null; ativo: boolean;
};
export type Problema = "sem_ligacao" | "sem_preco" | "sem_conversao" | "sub_sem_custo";
export type CustoItem = { custo: number | null; fonte: "produto" | "planilha" | "ficha" | null; problema: Problema | null; conversaoUsada: number | null };
export type CustoFicha = { total: number | null; custoKg: number | null; itens: Map<string, CustoItem>; pendencias: number; usaPlanilha: number };

export const UNIDADES = ["kg", "g", "L", "ml", "un"] as const;

const familia = (u: string) => {
  const x = (u || "").trim().toLowerCase();
  if (["kg", "kgs", "quilo"].includes(x)) return "kg";
  if (["g", "gr", "grama", "gramas"].includes(x)) return "g";
  if (["l", "lt", "litro", "litros"].includes(x)) return "l";
  if (["ml"].includes(x)) return "ml";
  if (["un", "und", "unid", "unidade", "pc", "pç"].includes(x)) return "un";
  return x;
};

/** Tamanho escrito no nome do produto: "Arroz 5kg" → {qtd:5, un:"kg"}; "Bandeja 30und" → {30,"un"}. */
export function tamanhoNoNome(nome: string): { qtd: number; un: "kg" | "g" | "l" | "ml" | "un" } | null {
  const m = (nome || "").toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|und|un|unid)\b/);
  if (!m) return null;
  const q = Number(m[1]);
  if (!(q > 0)) return null;
  const u = m[2] === "gr" ? "g" : m[2] === "lt" ? "l" : ["und", "unid"].includes(m[2]) ? "un" : (m[2] as "kg" | "g" | "l" | "ml" | "un");
  return { qtd: q, un: u };
}

/**
 * Conversão automática (quando a ficha não tem uma escrita): mesma família de
 * unidade (kg↔kg, g→kg...) ou o tamanho do nome do produto quando o produto é
 * vendido por unidade/caixa ("Creme Culinario 1L" un, receita em L → 1).
 */
export function conversaoAutomatica(unidadeReceita: string, produto: Pick<ProdutoPreco, "nome" | "unidade">): number | null {
  const r = familia(unidadeReceita), p = familia(produto.unidade);
  const fator: Record<string, Record<string, number>> = { kg: { kg: 1, g: 1000 }, g: { kg: 0.001, g: 1 }, l: { l: 1, ml: 1000 }, ml: { l: 0.001, ml: 1 }, un: { un: 1 } };
  if (fator[p]?.[r] != null) return fator[p][r];
  const t = tamanhoNoNome(produto.nome);
  if (!t) return null;
  // produto vendido em "un/cx/pct/bandeja" com o tamanho no nome. Líquido em
  // litro com receita em kg (ou o contrário) conta 1 L ≈ 1 kg — erro pequeno no custo.
  const base: Record<string, Record<string, number>> = { kg: { kg: 1, g: 1000, l: 1, ml: 1000 }, g: { kg: 0.001, g: 1, l: 0.001, ml: 1 }, l: { l: 1, ml: 1000, kg: 1, g: 1000 }, ml: { l: 0.001, ml: 1, kg: 0.001, g: 1 }, un: { un: 1 } };
  const f = base[t.un]?.[r];
  return f != null ? t.qtd * f : null;
}

/** kg de um ingrediente que é outra ficha (receita em kg ou g). */
const emKg = (qtd: number, unidade: string) => (familia(unidade) === "g" ? qtd / 1000 : qtd);

/** Calcula todas as fichas de uma vez (sub-fichas primeiro, sem laço infinito). */
export function calcularCustos(fichas: Ficha[], itens: FichaItem[], produtos: Map<string, ProdutoPreco>): Map<string, CustoFicha> {
  const porFicha = new Map<string, FichaItem[]>();
  for (const i of itens) porFicha.set(i.ficha_id, [...(porFicha.get(i.ficha_id) ?? []), i]);
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
  const pronto = new Map<string, CustoFicha>();
  const calculando = new Set<string>();

  const calc = (fid: string): CustoFicha => {
    const ja = pronto.get(fid);
    if (ja) return ja;
    const f = fichaPorId.get(fid);
    const vazio: CustoFicha = { total: null, custoKg: null, itens: new Map(), pendencias: 0, usaPlanilha: 0 };
    if (!f || calculando.has(fid)) return vazio; // laço (A usa B que usa A): não calcula
    calculando.add(fid);
    const res: CustoFicha = { total: 0, custoKg: null, itens: new Map(), pendencias: 0, usaPlanilha: 0 };
    for (const it of porFicha.get(fid) ?? []) {
      let c: CustoItem;
      if (it.sub_ficha_id) {
        const sub = calc(it.sub_ficha_id);
        c = sub.custoKg != null
          ? { custo: emKg(Number(it.quantidade), it.unidade) * sub.custoKg, fonte: "ficha", problema: null, conversaoUsada: null }
          : it.preco_planilha != null
            ? { custo: Number(it.preco_planilha), fonte: "planilha", problema: "sub_sem_custo", conversaoUsada: null }
            : { custo: null, fonte: null, problema: "sub_sem_custo", conversaoUsada: null };
      } else if (it.produto_id && produtos.get(it.produto_id)) {
        const p = produtos.get(it.produto_id)!;
        const conv = it.conversao ?? conversaoAutomatica(it.unidade, p);
        const preco = p.preco_referencia != null ? Number(p.preco_referencia) : null;
        if (preco != null && conv) c = { custo: (Number(it.quantidade) / conv) * preco, fonte: "produto", problema: null, conversaoUsada: conv };
        else if (it.preco_planilha != null) c = { custo: Number(it.preco_planilha), fonte: "planilha", problema: preco == null ? "sem_preco" : "sem_conversao", conversaoUsada: conv };
        else c = { custo: null, fonte: null, problema: preco == null ? "sem_preco" : "sem_conversao", conversaoUsada: conv };
      } else {
        // Água, sal "a gosto"... sem ligação: usa o da planilha se tiver; quantidade 0 não pesa.
        c = it.preco_planilha != null
          ? { custo: Number(it.preco_planilha), fonte: "planilha", problema: "sem_ligacao", conversaoUsada: null }
          : { custo: Number(it.quantidade) > 0 && !/^[aá]gua\b/i.test(it.descricao) ? null : 0, fonte: null, problema: Number(it.quantidade) > 0 && !/^[aá]gua\b/i.test(it.descricao) ? "sem_ligacao" : null, conversaoUsada: null };
      }
      res.itens.set(it.id, c);
      if (c.problema) res.pendencias++;
      if (c.fonte === "planilha") res.usaPlanilha++;
      if (c.custo == null) res.total = null;
      else if (res.total != null) res.total += c.custo;
    }
    res.custoKg = res.total != null && f.rendimento_kg ? res.total / Number(f.rendimento_kg) : null;
    calculando.delete(fid);
    pronto.set(fid, res);
    return res;
  };
  for (const f of fichas) calc(f.id);
  return pronto;
}

type DbLike = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Carrega fichas, ingredientes e os preços dos produtos usados (passa das 1000 linhas). */
export async function carregarFichas(db: DbLike, opts: { soAtivas?: boolean } = {}) {
  const [fichas, itens] = await Promise.all([
    buscarTodas<Ficha>((de, ate) => {
      let q = db.from("fichas_tecnicas").select("id, nome, categoria, rendimento_kg, rendimento_texto, base, cardapio_item_id, custo_kg_planilha, obs, ativo").order("nome").range(de, ate);
      if (opts.soAtivas !== false) q = q.eq("ativo", true);
      return q;
    }),
    buscarTodas<FichaItem>((de, ate) => db.from("ficha_itens").select("id, ficha_id, ordem, descricao, produto_id, sub_ficha_id, quantidade, unidade, conversao, preco_planilha").order("ficha_id").order("ordem").range(de, ate)),
  ]);
  const ids = [...new Set(itens.map((i) => i.produto_id).filter((x): x is string => !!x))];
  const produtos = new Map<string, ProdutoPreco>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from("produtos").select("id, nome, unidade, preco_referencia").in("id", ids.slice(i, i + 150));
    for (const p of (data as ProdutoPreco[] | null) ?? []) produtos.set(p.id, p);
  }
  return { fichas, itens, produtos, custos: calcularCustos(fichas, itens, produtos) };
}

export const TEXTO_PROBLEMA: Record<Problema, string> = {
  sem_ligacao: "não ligado a um produto",
  sem_preco: "produto sem preço (usa o da planilha)",
  sem_conversao: "unidade diferente do produto — diga quanto vem em 1 unidade",
  sub_sem_custo: "a ficha usada aqui ainda não tem custo",
};
