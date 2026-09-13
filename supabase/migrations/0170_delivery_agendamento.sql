-- Delivery: pedido agendado (cliente escolhe um horário exato dentro do turno).
-- Os horários dos turnos, o intervalo, o limite por horário e o pedido mínimo
-- ficam em delivery_config.config (jsonb) — sem coluna nova.
alter table public.delivery_pedidos
  add column if not exists agendado_para timestamptz;
create index if not exists idx_delivery_pedidos_agendado on public.delivery_pedidos (agendado_para) where agendado_para is not null;
