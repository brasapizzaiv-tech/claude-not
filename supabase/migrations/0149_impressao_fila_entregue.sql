-- Reserva do job pro agente: quando a fila entrega um item, marca entregue_em.
-- Outro agente (ou o mesmo, no ciclo seguinte) só pega de novo se passar 90 s
-- sem baixa — evita impressão em dobro com dois agentes rodando.
alter table public.impressao_fila add column if not exists entregue_em timestamptz;
