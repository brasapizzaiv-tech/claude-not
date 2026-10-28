// Caixa do motoboy (migration 0262): o que está com cada boy — pedidos
// entregues e ainda não pagos — e a conta da conferência no fim do turno.
// Dinheiro esperado = troco que ele levou + pedidos em dinheiro; máquina
// esperada = o resto (cartão, pix na máquina...). Pix online já sai pago e
// não aparece aqui; convênio (Saldo cliente, ex.: Kern) e Compra da equipe
// também não — não é dinheiro com o boy, recebe na tela do pedido.
import type { createClient } from "@/lib/supabase/server";
import { formasParaTipo, listarFormas } from "@/lib/formas-pagamento-server";
import { tipoDe } from "@/lib/formas-pagamento";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type PedidoComBoy = {
  id: string; entregadorId: string; numero: number | null; nome: string; total: number;
  formaBoy: string | null; // o que ele marcou no "Entreguei"
  valorBoy: number | null;
  formaPedido: string | null; // o que o cliente disse
  entregueEm: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Formas que o boy cobra na porta: dinheiro e o que passa na maquininha.
const TIPOS_DA_RUA = ["dinheiro", "cartao", "credito", "debito", "pix_maquina", "pix", "vale"];
export async function formasDoMotoboy() {
  return (await listarFormas("delivery")).filter((f) => TIPOS_DA_RUA.includes(f.tipo) && !f.pedeCodigo);
}

export async function pedidosComMotoboy(supabase: Supa, entregadorId?: string): Promise<PedidoComBoy[]> {
  let q = supabase.from("delivery_pedidos")
    .select("id, entregador_id, comanda_id, nome, taxa_entrega, desconto, forma_pagamento, recebido_forma, recebido_valor, entregue_em, numero_turno, pdv_comandas(numero)")
    .eq("tipo", "entrega").eq("status", "entregue").eq("pago", false).not("entregador_id", "is", null)
    .order("entregue_em").limit(500);
  if (entregadorId) q = q.eq("entregador_id", entregadorId);
  const { data } = await q;
  type Row = { id: string; entregador_id: string; comanda_id: string | null; nome: string; taxa_entrega: number | null; desconto: number | null; forma_pagamento: string | null; recebido_forma: string | null; recebido_valor: number | null; entregue_em: string | null; numero_turno: number | null; pdv_comandas: { numero: number } | { numero: number }[] | null };
  const tipos = await formasParaTipo();
  const rows = ((data as Row[] | null) ?? []).filter((r) => !["saldo", "equipe"].includes(tipoDe(r.forma_pagamento, tipos)));
  const ids = [...new Set(rows.map((r) => r.comanda_id).filter(Boolean))] as string[];
  const soma = new Map<string, number>();
  if (ids.length) {
    const { data: itens } = await supabase.from("pdv_comanda_itens").select("comanda_id, qtd, preco_unit").in("comanda_id", ids);
    for (const it of (itens as { comanda_id: string; qtd: number; preco_unit: number | null }[]) ?? []) soma.set(it.comanda_id, (soma.get(it.comanda_id) ?? 0) + Number(it.qtd) * Number(it.preco_unit || 0));
  }
  return rows.map((r) => {
    const c = Array.isArray(r.pdv_comandas) ? r.pdv_comandas[0] : r.pdv_comandas;
    return {
      id: r.id, entregadorId: r.entregador_id, numero: r.numero_turno ?? c?.numero ?? null, nome: r.nome,
      total: r2((soma.get(r.comanda_id ?? "") ?? 0) + Number(r.taxa_entrega ?? 0) - Number(r.desconto ?? 0)),
      formaBoy: r.recebido_forma, valorBoy: r.recebido_valor != null ? Number(r.recebido_valor) : null,
      formaPedido: r.forma_pagamento, entregueEm: r.entregue_em,
    };
  });
}

/** Forma sugerida pro caixa: a que o boy marcou ("Pix" na porta = máquina). */
export function formaSugerida(p: PedidoComBoy, formas: string[]) {
  const tem = (n: string) => formas.find((f) => f.toLowerCase() === n.toLowerCase());
  const boy = p.formaBoy === "Já pago" ? null : p.formaBoy;
  if (boy === "Pix") return tem("Pix na máquina") ?? tem("Pix") ?? formas[0];
  return (boy && tem(boy)) || (p.formaPedido && tem(p.formaPedido)) || tem("Dinheiro") || formas[0];
}

/** A conta da conferência. ehDinheiro diz se a forma é dinheiro. */
export function contaDoMotoboy(troco: number, itens: { total: number; forma: string }[], ehDinheiro: (forma: string) => boolean, contado: number, maquina: number) {
  const vendasDinheiro = r2(itens.filter((i) => ehDinheiro(i.forma)).reduce((s, i) => s + i.total, 0));
  const esperadoMaquina = r2(itens.filter((i) => !ehDinheiro(i.forma)).reduce((s, i) => s + i.total, 0));
  const esperadoDinheiro = r2(troco + vendasDinheiro);
  return { vendasDinheiro, esperadoDinheiro, esperadoMaquina, difDinheiro: r2(contado - esperadoDinheiro), difMaquina: r2(maquina - esperadoMaquina) };
}
