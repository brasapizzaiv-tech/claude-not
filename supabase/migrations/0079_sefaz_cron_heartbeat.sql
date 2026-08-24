-- Batimento (heartbeat) dos crons da SEFAZ: registra a última vez que cada cron
-- REALMENTE executou (passou pela autenticação). Serve para verificar se o
-- Vercel Cron está disparando de fato.
alter table public.config_sefaz
  add column if not exists cron_completar_em timestamptz,
  add column if not exists cron_hora_em      timestamptz;
