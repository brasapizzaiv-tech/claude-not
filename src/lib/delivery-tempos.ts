// Tempo prometido ao cliente, separado por tipo (pedido do Rafael, 27/11/2026,
// igual ao "Buscar 10 / Entregar 25" do sistema antigo): muda na hora no topo
// do Delivery, aparece no app de pedidos e vira a previsão do pedido novo.
// Mora em delivery_config.config.tempos; sem ele, os dois usam o
// tempo_preparo_min antigo (Config), que segue igual ao de entrega.

export type TemposDelivery = { entrega: number; retirada: number };

/** Opções dos seletores (de 5 em 5 até 2 h). */
export const OPCOES_TEMPO = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 105, 120];

const ok = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 240 ? n : null;
};

export function lerTempos(row: { tempo_preparo_min?: number | null; config?: unknown } | null | undefined): TemposDelivery {
  const base = ok(row?.tempo_preparo_min) ?? 40;
  const t = ((row?.config ?? {}) as { tempos?: { entrega?: unknown; retirada?: unknown } }).tempos ?? {};
  return { entrega: ok(t.entrega) ?? base, retirada: ok(t.retirada) ?? base };
}

export const tempoDoTipo = (t: TemposDelivery, tipo: string | null | undefined) => (tipo === "retirada" ? t.retirada : t.entrega);

/** Lista de opções que sempre contém o valor atual (caso venha um 33 da Config). */
export const opcoesCom = (v: number) => (OPCOES_TEMPO.includes(v) ? OPCOES_TEMPO : [...OPCOES_TEMPO, v].sort((a, b) => a - b));
