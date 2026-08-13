-- Trava anti "consumo indevido" (656): guarda até quando a próxima busca
-- na SEFAZ fica bloqueada.
alter table public.config_sefaz
  add column if not exists bloqueado_ate timestamptz;
