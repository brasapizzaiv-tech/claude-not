-- Status do agente (heartbeat): qual PC, quais impressoras ele enxerga e quando
-- foi visto por último. Usado pela Central para mostrar "conectado" e a lista.
alter table public.impressao_config
  add column if not exists hostname   text,
  add column if not exists printers   jsonb,
  add column if not exists visto_em   timestamptz;
