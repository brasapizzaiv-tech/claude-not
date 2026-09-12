import { createAdminClient } from "@/lib/supabase/admin";
import { PRONTO_SOME_SEG, type PedidoRodizio } from "@/lib/rodizio";

// Fila do rodízio pra TV (cliente administrativo: a TV não tem login).
// Pendentes e no forno de qualquer hora + prontos recentes (a TV mostra por 90 s).
export async function filaTv(): Promise<PedidoRodizio[]> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - (PRONTO_SOME_SEG + 30) * 1000).toISOString();
  const { data, error } = await admin
    .from("pedidos_rodizio")
    .select("id, mesa, sabor, tipo, fracao, quantidade, observacao, status, criado_em, forno_em, pronto_em, garcom")
    .or(`status.in.(pendente,forno),and(status.eq.pronto,pronto_em.gte.${desde})`)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as PedidoRodizio[]) ?? [];
}

export function chaveTvOk(chave: string | undefined) {
  const esperada = (process.env.RODIZIO_TV_CHAVE ?? "").trim();
  return { configurada: !!esperada, ok: !!esperada && (chave ?? "") === esperada };
}

// Hora atual (fora do componente por causa da regra de pureza do React).
export const agoraMs = () => Date.now();
