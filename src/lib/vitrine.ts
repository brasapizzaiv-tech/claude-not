// Vitrine do app (migration 0236): o que o /pedir mostra além do cardápio —
// destaques do topo, sugestões e os cupons dos gatilhos. Lido no servidor com
// a chave administrativa e SEMPRE filtrado pela empresa do endereço.
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type CupomVitrine = { codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null };

export type VitrineApp = {
  destaques: {
    id: string; titulo: string; subtitulo: string | null; itemId: string | null;
    precoDe: number | null; precoPor: number | null; foto: string | null; selo: string | null;
  }[];
  /** categoria ('__pizzas__' = pizza montada) → itens sugeridos */
  sugestoesProduto: Record<string, string[]>;
  sugestoesCarrinho: string[];
  gatilhos: {
    boasVindas: CupomVitrine | null;
    parado: (CupomVitrine & { minutos: number; validadeMin: number }) | null;
    abandonado: (CupomVitrine & { minutos: number }) | null;
  };
};

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Cupom cadastrado, ativo, dentro da validade e com uso sobrando — senão null. */
async function cupomValido(admin: Admin, empresaId: string, codigo: string | null): Promise<CupomVitrine | null> {
  const cod = (codigo || "").trim().toUpperCase();
  if (!cod) return null;
  const { data } = await admin.from("cupons").select("codigo, tipo, valor, minimo, validade, max_usos, usos, ativo").eq("empresa_id", empresaId).ilike("codigo", cod).maybeSingle();
  const c = data as { codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null; validade: string | null; max_usos: number | null; usos: number; ativo: boolean } | null;
  if (!c || !c.ativo) return null;
  if (c.validade && c.validade < hojeSP()) return null;
  if (c.max_usos != null && c.usos >= c.max_usos) return null;
  return { codigo: c.codigo, tipo: c.tipo, valor: Number(c.valor), minimo: c.minimo != null ? Number(c.minimo) : null };
}

export async function carregarVitrine(admin: Admin, empresaId: string, itensDisponiveis: Set<string>): Promise<VitrineApp> {
  const agora = new Date().toISOString();
  const [{ data: dRows }, { data: sRows }, { data: gRows }] = await Promise.all([
    admin.from("vitrine_destaques").select("id, titulo, subtitulo, item_id, preco_de, preco_por, foto_url, selo, inicio, fim").eq("empresa_id", empresaId).eq("ativo", true).order("ordem").order("criado_em"),
    admin.from("vitrine_sugestoes").select("momento, categoria, item_id").eq("empresa_id", empresaId).order("ordem").order("criado_em"),
    admin.from("vitrine_gatilhos").select("chave, ativo, cupom, minutos, validade_min").eq("empresa_id", empresaId),
  ]);

  type D = { id: string; titulo: string; subtitulo: string | null; item_id: string | null; preco_de: number | null; preco_por: number | null; foto_url: string | null; selo: string | null; inicio: string | null; fim: string | null };
  const destaques = ((dRows as D[]) ?? [])
    .filter((d) => (!d.inicio || d.inicio <= agora) && (!d.fim || d.fim > agora))
    // Produto fora do cardápio agora (fora do horário, esgotado): o destaque some.
    .filter((d) => !d.item_id || itensDisponiveis.has(d.item_id))
    .map((d) => ({
      id: d.id, titulo: d.titulo, subtitulo: d.subtitulo, itemId: d.item_id,
      precoDe: d.preco_de != null ? Number(d.preco_de) : null, precoPor: d.preco_por != null ? Number(d.preco_por) : null,
      foto: d.foto_url, selo: d.selo,
    }));

  const sugestoesProduto: Record<string, string[]> = {};
  const sugestoesCarrinho: string[] = [];
  for (const s of (sRows as { momento: string; categoria: string | null; item_id: string }[]) ?? []) {
    if (!itensDisponiveis.has(s.item_id)) continue;
    if (s.momento === "carrinho") sugestoesCarrinho.push(s.item_id);
    else if (s.categoria) (sugestoesProduto[s.categoria] ??= []).push(s.item_id);
  }

  const g = new Map(((gRows as { chave: string; ativo: boolean; cupom: string | null; minutos: number | null; validade_min: number | null }[]) ?? []).map((x) => [x.chave, x]));
  const ligado = async (chave: string) => {
    const x = g.get(chave);
    return x?.ativo ? { x, cupom: await cupomValido(admin, empresaId, x.cupom) } : null;
  };
  const [bv, pa, ab] = await Promise.all([ligado("boas_vindas"), ligado("parado"), ligado("abandonado")]);
  return {
    destaques,
    sugestoesProduto,
    sugestoesCarrinho,
    gatilhos: {
      boasVindas: bv?.cupom ?? null,
      parado: pa?.cupom ? { ...pa.cupom, minutos: Math.max(1, pa.x.minutos ?? 2), validadeMin: Math.max(1, pa.x.validade_min ?? 15) } : null,
      abandonado: ab?.cupom ? { ...ab.cupom, minutos: Math.max(5, ab.x.minutos ?? 20) } : null,
    },
  };
}
