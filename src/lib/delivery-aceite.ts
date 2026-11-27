// Aceite automático dos pedidos do app (pedido do Rafael, 27/11/2026: "deixar
// ele entrar como padrão já aceito"). Liga em Delivery → Config
// (delivery_config.config.aceitarAuto). Ligado:
// - pedido normal entra aceito: imprime na cozinha na hora e o cliente recebe
//   o "pedido confirmado" (em vez do "recebido");
// - agendado entra aceito e imprime sozinho perto do horário (delivery-agendados);
// - Pix online espera o Pix cair (delivery-pix chama aqui quando vira pago) —
//   cozinha não faz pedido que ainda não foi pago.
import { imprimirComandaDoPedido, type Db } from "@/lib/delivery-core";
import { avisarPedido } from "@/lib/whatsapp";

export async function aceiteAutomaticoLigado(db: Db, empresaId: string | null): Promise<boolean> {
  let q = db.from("delivery_config").select("config").limit(1);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q.maybeSingle();
  const cfg = (data as { config?: { aceitarAuto?: unknown } | null } | null)?.config;
  return cfg?.aceitarAuto === true;
}

// Pendente → aceito, uma vez só (dois caminhos ao mesmo tempo não imprimem 2×).
export async function aceitarPedidoAuto(db: Db, pedidoId: string): Promise<boolean> {
  const { data } = await db
    .from("delivery_pedidos")
    .update({ status: "aceito", aceito_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status", "pendente")
    .select("agendado_para");
  const p = (data as { agendado_para: string | null }[] | null)?.[0];
  if (!p) return false;
  if (!p.agendado_para) {
    try { await imprimirComandaDoPedido(db, pedidoId); } catch { /* reimprime pelo painel */ }
  }
  await avisarPedido(pedidoId, "confirmado");
  return true;
}
