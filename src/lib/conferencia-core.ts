// Conferência de compras — regra compartilhada entre o painel (/conferencia),
// o app da equipe (/eu, "A conferir") e a tela da nota (/notas).
//
// Cruza três fontes de cada pedido: o PEDIDO (qtd e preço cotado), o que a
// EQUIPE contou ao receber (qtd_conf_colab, pelo app) ou o painel conferiu
// (qtd_recebida) e a NOTA FISCAL ligada ao pedido (nota_itens × fator, por
// produto). O resultado vira a lista de divergências gravada no pedido
// (pedidos.divergencias / divergencias_n) — é isso que a lista e o relatório
// mostram. Qualquer diferença conta (regra do Rafael): preço 1 centavo acima
// do cotado já é divergência.
import type { createAdminClient } from "@/lib/supabase/admin";

export type Db = ReturnType<typeof createAdminClient>;

export type TipoDivergencia =
  | "qtd_recebida"      // recebido ≠ pedido (equipe/painel)
  | "faltou"            // recebido = 0
  | "preco_nota_acima"  // preço da nota > cotado
  | "preco_nota_abaixo" // preço da nota < cotado (informativo)
  | "qtd_nota"          // qtd da nota ≠ pedido
  | "cobrado_nao_recebido" // nota cobra mais do que foi recebido
  | "nota_sem_pedido"   // item na nota que não estava no pedido
  | "unidade_diferente" // nota em caixa/fardo sem o fator configurado (preço ≥ 1,5× o cotado)
  | "veio_a_mais";      // item recebido que não estava no pedido (qtd pedida 0)

export type Divergencia = {
  tipo: TipoDivergencia;
  produto: string;
  produto_id: string | null;
  pedido?: number | null;
  recebido?: number | null;
  nota?: number | null;
  preco_cotado?: number | null;
  preco_nota?: number | null;
  valor?: number; // impacto em R$ (positivo = pagou a mais / recebeu a menos)
};

export type ResumoDivergencias = {
  n: number;
  gravidade: "ok" | "aviso" | "grave"; // grave = faltou/cobrado sem receber/preço acima
  valor_a_mais: number; // R$ pagos a mais (preço acima + cobrado sem receber)
  tem_nota: boolean;
  tem_conferencia: boolean;
  itens: Divergencia[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

type PedItem = {
  id: string; produto_id: string | null; qtd: number; preco_unit: number | null;
  qtd_recebida: number | null; preco_recebido: number | null; qtd_conf_colab: number | null;
  produtos: { nome?: string } | { nome?: string }[] | null;
};
type NotaItem = { produto_id: string | null; descricao: string | null; qtd: number; valor_unit: number | null; fator: number | null };

const nomeDe = (p: PedItem["produtos"]) => (Array.isArray(p) ? p[0]?.nome : p?.nome) ?? "—";

// Calcula as divergências de um pedido (sem gravar).
export async function calcularDivergencias(db: Db, pedidoId: string): Promise<ResumoDivergencias> {
  const [{ data: ped }, { data: itens }, { data: nota }] = await Promise.all([
    db.from("pedidos").select("id, status, conf_colab_em, conferido_em").eq("id", pedidoId).maybeSingle(),
    db.from("pedido_itens").select("id, produto_id, qtd, preco_unit, qtd_recebida, preco_recebido, qtd_conf_colab, produtos(nome)").eq("pedido_id", pedidoId),
    db.from("notas_fiscais").select("id, nota_itens(produto_id, descricao, qtd, valor_unit, fator)").eq("pedido_id", pedidoId).limit(1).maybeSingle(),
  ]);
  const p = ped as { status: string; conf_colab_em: string | null; conferido_em: string | null } | null;
  const pis = (itens as unknown as PedItem[]) ?? [];
  const nis = ((nota as unknown as { nota_itens: NotaItem[] } | null)?.nota_itens ?? []) as NotaItem[];
  const temNota = !!nota;
  // Painel conferiu (status conferido/recebido com qtd_recebida) vale mais que a
  // contagem da equipe; sem painel, vale a equipe.
  const painelConferiu = !!p && (p.status === "conferido" || p.status === "recebido") && pis.some((i) => i.qtd_recebida != null);
  const temConf = painelConferiu || !!p?.conf_colab_em;

  const out: Divergencia[] = [];
  // nota agrupada por produto (a mesma mercadoria pode vir em 2 linhas)
  const notaPorProduto = new Map<string, { qtd: number; valor: number }>();
  const notaSemProduto: NotaItem[] = [];
  for (const ni of nis) {
    if (!ni.produto_id) { notaSemProduto.push(ni); continue; }
    const f = Number(ni.fator ?? 1) || 1;
    const a = notaPorProduto.get(ni.produto_id) ?? { qtd: 0, valor: 0 };
    a.qtd += Number(ni.qtd) * f;
    a.valor += Number(ni.qtd) * Number(ni.valor_unit ?? 0);
    notaPorProduto.set(ni.produto_id, a);
  }

  const produtosDoPedido = new Set<string>();
  for (const i of pis) {
    if (i.produto_id) produtosDoPedido.add(i.produto_id);
    const nome = nomeDe(i.produtos);
    const pedido = Number(i.qtd);
    const cotado = i.preco_unit != null ? Number(i.preco_unit) : null;
    const recebido = painelConferiu ? (i.qtd_recebida != null ? Number(i.qtd_recebida) : null) : (i.qtd_conf_colab != null ? Number(i.qtd_conf_colab) : null);

    if (pedido === 0 && (recebido ?? 0) > 0) {
      out.push({ tipo: "veio_a_mais", produto: nome, produto_id: i.produto_id, pedido, recebido });
    } else if (recebido != null && r3(recebido) !== r3(pedido)) {
      const tipo: TipoDivergencia = recebido === 0 ? "faltou" : "qtd_recebida";
      const valor = cotado != null ? r2((pedido - recebido) * cotado) : undefined;
      out.push({ tipo, produto: nome, produto_id: i.produto_id, pedido, recebido, preco_cotado: cotado, valor });
    }

    if (temNota && i.produto_id) {
      const n = notaPorProduto.get(i.produto_id);
      if (n && n.qtd > 0) {
        const precoNota = r2(n.valor / n.qtd); // já por unidade do produto (fator aplicado)
        // Preço da nota 1,5× (ou mais) o cotado quase sempre é a nota em CAIXA/FARDO
        // com o fator ainda em 1 — não é preço maior, é unidade diferente. Avisa pra
        // ajustar o fator na nota e não compara quantidade/preço desse item.
        if (cotado != null && cotado > 0 && precoNota / cotado >= 1.5) {
          out.push({ tipo: "unidade_diferente", produto: nome, produto_id: i.produto_id, pedido, nota: r3(n.qtd), preco_cotado: cotado, preco_nota: precoNota, recebido: Math.round(precoNota / cotado) });
          continue;
        }
        if (cotado != null && precoNota > cotado + 0.004) {
          out.push({ tipo: "preco_nota_acima", produto: nome, produto_id: i.produto_id, preco_cotado: cotado, preco_nota: precoNota, nota: n.qtd, valor: r2((precoNota - cotado) * n.qtd) });
        } else if (cotado != null && precoNota < cotado - 0.004) {
          out.push({ tipo: "preco_nota_abaixo", produto: nome, produto_id: i.produto_id, preco_cotado: cotado, preco_nota: precoNota, nota: n.qtd, valor: r2((precoNota - cotado) * n.qtd) });
        }
        if (r3(n.qtd) !== r3(pedido) && pedido > 0) {
          out.push({ tipo: "qtd_nota", produto: nome, produto_id: i.produto_id, pedido, nota: r3(n.qtd), preco_nota: precoNota });
        }
        if (recebido != null && n.qtd > recebido + 0.0005) {
          out.push({ tipo: "cobrado_nao_recebido", produto: nome, produto_id: i.produto_id, recebido, nota: r3(n.qtd), preco_nota: precoNota, valor: r2((n.qtd - recebido) * precoNota) });
        }
      }
    }
  }
  if (temNota) {
    for (const [pid, n] of notaPorProduto) {
      if (produtosDoPedido.has(pid)) continue;
      const { data: prod } = await db.from("produtos").select("nome").eq("id", pid).maybeSingle();
      out.push({ tipo: "nota_sem_pedido", produto: (prod?.nome as string) ?? "produto", produto_id: pid, nota: r3(n.qtd), preco_nota: n.qtd > 0 ? r2(n.valor / n.qtd) : null, valor: r2(n.valor) });
    }
    for (const ni of notaSemProduto) {
      out.push({ tipo: "nota_sem_pedido", produto: `${ni.descricao ?? "item da nota"} (não vinculado a produto)`, produto_id: null, nota: Number(ni.qtd), preco_nota: ni.valor_unit != null ? Number(ni.valor_unit) : null, valor: r2(Number(ni.qtd) * Number(ni.valor_unit ?? 0)) });
    }
  }

  const graves = new Set<TipoDivergencia>(["faltou", "cobrado_nao_recebido", "preco_nota_acima", "nota_sem_pedido"]);
  const gravidade = out.length === 0 ? "ok" : out.some((d) => graves.has(d.tipo)) ? "grave" : "aviso";
  const valorAMais = r2(out.filter((d) => d.tipo === "preco_nota_acima" || d.tipo === "cobrado_nao_recebido" || d.tipo === "nota_sem_pedido").reduce((s, d) => s + (d.valor ?? 0), 0));
  return { n: out.length, gravidade, valor_a_mais: valorAMais, tem_nota: temNota, tem_conferencia: temConf, itens: out };
}

// Recalcula e grava no pedido. Chamar sempre que: a equipe confere, o painel
// salva a conferência, uma nota é ligada/desligada ou um item da nota muda de
// produto/fator.
export async function recalcularDivergencias(db: Db, pedidoId: string) {
  const r = await calcularDivergencias(db, pedidoId);
  await db.from("pedidos").update({ divergencias: r, divergencias_n: r.n }).eq("id", pedidoId);
  return r;
}

// Liga (ou desliga, pedidoId = null) uma nota a um pedido. A conta provisória
// gerada pela conferência do pedido sai, pra não duplicar com a da nota.
export async function ligarNotaAoPedido(db: Db, notaId: string, pedidoId: string | null) {
  const { data: antes } = await db.from("notas_fiscais").select("pedido_id").eq("id", notaId).maybeSingle();
  const pedidoAntigo = (antes?.pedido_id as string | null) ?? null;
  const { error } = await db
    .from("notas_fiscais")
    .update({ pedido_id: pedidoId, status: pedidoId ? "conciliada" : "importada" })
    .eq("id", notaId);
  if (error) return { ok: false as const, mensagem: error.message };
  if (pedidoId) await db.from("lancamentos").delete().eq("pedido_id", pedidoId).eq("origem", "pedido");
  if (pedidoAntigo && pedidoAntigo !== pedidoId) await recalcularDivergencias(db, pedidoAntigo);
  if (pedidoId) await recalcularDivergencias(db, pedidoId);
  return { ok: true as const };
}

// Notas do mesmo fornecedor perto da data do pedido, ainda sem pedido — pra
// sugerir a ligação na tela da conferência.
export async function notasSugeridas(db: Db, fornecedorId: string | null, data: string, dias = 12) {
  if (!fornecedorId) return [];
  const [a, m, d] = data.split("-").map(Number);
  const de = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
  const ate = new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("notas_fiscais")
    .select("id, numero, valor, data_emissao, pedido_id, tipo")
    .eq("fornecedor_id", fornecedorId)
    .is("pedido_id", null)
    .gte("data_emissao", de)
    .lte("data_emissao", ate)
    .order("data_emissao", { ascending: false })
    .limit(8);
  return ((rows as { id: string; numero: string | null; valor: number; data_emissao: string | null; tipo: string | null }[]) ?? []).filter((n) => n.tipo !== "servico");
}

export const ROTULO_DIVERGENCIA: Record<TipoDivergencia, string> = {
  qtd_recebida: "quantidade diferente",
  faltou: "não veio",
  preco_nota_acima: "preço acima do cotado",
  preco_nota_abaixo: "preço abaixo do cotado",
  qtd_nota: "nota com quantidade diferente",
  cobrado_nao_recebido: "cobrado sem receber",
  nota_sem_pedido: "na nota, fora do pedido",
  unidade_diferente: "unidade da nota diferente (fator não configurado)",
  veio_a_mais: "veio a mais",
};

// Um item da nota mudou (produto ou fator): recalcula o pedido ligado à nota.
export async function recalcularDoItemNota(db: Db, itemId: string) {
  const { data: it } = await db.from("nota_itens").select("nota_id").eq("id", itemId).maybeSingle();
  if (!it?.nota_id) return;
  const { data: nota } = await db.from("notas_fiscais").select("pedido_id").eq("id", it.nota_id as string).maybeSingle();
  if (nota?.pedido_id) await recalcularDivergencias(db, nota.pedido_id as string);
}
