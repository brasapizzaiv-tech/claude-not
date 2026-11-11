import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTodas } from "@/lib/supabase/todas";

// Saldo do fiado (Saldo cliente) = débitos − pagamentos de `cliente_fiado`.
// COD-006: era somado em 5 lugares, cada um com a sua busca, e o banco corta em
// 1000 linhas — o Kern sozinho lança ~53 por mês. Aqui busca em páginas.

type Linha = { cliente_id: string; tipo: string; valor: number };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo em aberto de cada cliente pedido (quem não tem lançamento fica 0). */
export async function saldosFiado(db: SupabaseClient, clienteIds: string[]): Promise<Map<string, number>> {
  const saldo = new Map<string, number>(clienteIds.map((id) => [id, 0]));
  if (clienteIds.length === 0) return saldo;
  const linhas = await buscarTodas<Linha>((de, ate) =>
    db.from("cliente_fiado").select("cliente_id, tipo, valor").in("cliente_id", clienteIds).order("id").range(de, ate),
  );
  for (const l of linhas) {
    const v = Number(l.valor) * (l.tipo === "debito" ? 1 : -1);
    saldo.set(l.cliente_id, r2((saldo.get(l.cliente_id) ?? 0) + v));
  }
  return saldo;
}

export async function saldoFiado(db: SupabaseClient, clienteId: string): Promise<number> {
  return (await saldosFiado(db, [clienteId])).get(clienteId) ?? 0;
}
