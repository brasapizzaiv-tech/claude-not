-- Desconto por pessoa na semana (atraso, falta, etc.) — abate do total a pagar.
alter table public.semana_extras
  add column if not exists desconto numeric not null default 0,
  add column if not exists desconto_motivo text;
