import { createClient } from "@/lib/supabase/server";

export type FiltroContas = {
  status?: string; // "aberto" (padrão) | "pagas" | "todas"
  comp?: string; // competência AAAA-MM
  vde?: string; // vencimento de
  vate?: string; // vencimento até
  lde?: string; // lançamento de
  late?: string; // lançamento até
  banco?: string; // origem do pagamento
  forma?: string; // tipo de pagamento
  cat?: string; // categoria_id
};

export type LinhaConta = {
  id: string;
  ids?: string[]; // lançamentos agrupados neste boleto (nota) — para pagar juntos
  nota_id?: string | null;
  data: string | null;
  lancamento_em: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  pago: boolean;
  pago_em: string | null;
  banco: string | null;
  forma_pagamento: string | null;
  origem: string;
  categoria_id: string | null;
  dre_categorias: { nome?: string; tipo?: string } | null;
  fornecedores: { nome?: string } | null;
};

// Agrupa os lançamentos de uma MESMA nota + vencimento (= um boleto) numa linha
// só, somando o valor. Usado só na TELA de Contas a pagar (o relatório da
// contabilidade continua detalhado por categoria).
export function agruparContas(linhas: LinhaConta[]): LinhaConta[] {
  const grupos = new Map<string, LinhaConta>();
  const cats = new Map<string, Set<string>>();
  for (const l of linhas) {
    const key =
      l.nota_id && l.origem === "nota"
        ? `nota|${l.nota_id}|${l.vencimento ?? ""}|${l.pago ? "1" : "0"}`
        : `lanc|${l.id}`;
    const g = grupos.get(key);
    if (!g) {
      grupos.set(key, { ...l, ids: [l.id] });
      cats.set(key, new Set(l.dre_categorias?.nome ? [l.dre_categorias.nome] : []));
    } else {
      g.valor = Math.round((Number(g.valor) + Number(l.valor)) * 100) / 100;
      g.ids!.push(l.id);
      if (l.dre_categorias?.nome) cats.get(key)!.add(l.dre_categorias.nome);
    }
  }
  // Categoria mostrada: única se só tem uma; senão "Vários itens".
  for (const [key, g] of grupos) {
    const nomes = [...(cats.get(key) ?? [])];
    if (nomes.length > 1) g.dre_categorias = { nome: "Vários itens", tipo: "despesa" };
  }
  return [...grupos.values()];
}

function proxMes(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function consultarContas(f: FiltroContas): Promise<LinhaConta[]> {
  const supabase = await createClient();
  let q = supabase
    .from("lancamentos")
    .select(
      "id, nota_id, data, lancamento_em, descricao, valor, vencimento, pago, pago_em, banco, forma_pagamento, origem, categoria_id, dre_categorias(nome, tipo), fornecedores(nome)",
    );

  if (f.status === "pagas") q = q.eq("pago", true);
  else if (f.status !== "todas") q = q.eq("pago", false);

  if (f.comp && /^\d{4}-\d{2}$/.test(f.comp)) {
    q = q.gte("data", `${f.comp}-01`).lt("data", proxMes(f.comp));
  }
  if (f.vde) q = q.gte("vencimento", f.vde);
  if (f.vate) q = q.lte("vencimento", f.vate);
  if (f.lde) q = q.gte("lancamento_em", f.lde);
  if (f.late) q = q.lte("lancamento_em", f.late);
  if (f.banco) q = q.eq("banco", f.banco);
  if (f.forma) q = q.eq("forma_pagamento", f.forma);
  if (f.cat) q = q.eq("categoria_id", f.cat);

  const { data } = await q
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(2000);

  // Só despesas (não receitas) entram em contas a pagar.
  return ((data as unknown as LinhaConta[]) ?? []).filter(
    (l) => l.dre_categorias?.tipo !== "receita",
  );
}
