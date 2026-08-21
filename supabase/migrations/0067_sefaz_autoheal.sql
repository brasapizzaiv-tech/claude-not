-- SEFAZ auto-cura: marca quando foi o último reprocessamento automático, para o
-- cron recuperar (no máximo a cada 8h) notas manifestadas que ficaram sem itens
-- além da janela normal (a busca anda só para frente; docs perdidos só voltam
-- reprocessando desde o início).
alter table public.config_sefaz
  add column if not exists reprocessado_em timestamptz;
