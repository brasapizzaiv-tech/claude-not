// Quando um pedido do delivery está ATRASADO (layout novo, out/2026: meta de
// 45 min, pedida pelo Rafael). Uma regra só, usada na tela inicial e na lista
// de pedidos.
//
// O relógio começa quando o pedido entrou. Pedido agendado começa 45 min antes
// do horário marcado — assim ele só fica vermelho se passar da hora combinada.

export const META_DELIVERY_MIN = 45;

type P = { status: string; criado_em: string; agendado_para?: string | null; entregue_em?: string | null };

/** Minutos desde que o pedido "começou a contar". */
export function minutosDoPedido(p: P, agora: number): number {
  const inicio = p.agendado_para
    ? new Date(p.agendado_para).getTime() - META_DELIVERY_MIN * 60000
    : new Date(p.criado_em).getTime();
  return Math.max(0, Math.round((agora - inicio) / 60000));
}

export function pedidoAtrasado(p: P, agora: number): boolean {
  if (p.entregue_em || p.status === "entregue" || p.status === "cancelado") return false;
  return minutosDoPedido(p, agora) > META_DELIVERY_MIN;
}
