// Quando as pizzas aparecem no app do cliente (Rafael, 28/10/2026: "amanhã
// quando tiver indisponível as pizzas não vai aparecer?"). As pizzas não são
// itens do cardápio, então o horário mora no pdv_config: pizzas_horarios (o
// mesmo {dias, turnos} das categorias) e pizzas_disponivel ("0" = desligadas,
// ex.: acabou a massa). Fora do horário somem a seção Pizzas, as Novidades e os
// destaques de pizza, e o envio do pedido recusa pizza.
import { disponivelAgora, type Horarios } from "@/lib/disponibilidade";

export type ConfigPizzas = { horarios: Horarios; disponivel: boolean };

export function lerConfigPizzas(cfg: Record<string, string | undefined>): ConfigPizzas {
  let horarios: Horarios = null;
  try { horarios = cfg.pizzas_horarios ? (JSON.parse(cfg.pizzas_horarios) as Horarios) : null; } catch { horarios = null; }
  return { horarios, disponivel: cfg.pizzas_disponivel !== "0" };
}

export const pizzasAgora = (c: ConfigPizzas, nowMs: number) => c.disponivel && disponivelAgora(c.horarios, nowMs);
