-- Fechamento Z do caixa: guarda o dinheiro contado, o esperado, a quebra
-- (diferença) e um resumo por forma de pagamento no momento do fechamento.
alter table public.pdv_caixas
  add column if not exists dinheiro_contado  numeric,
  add column if not exists dinheiro_esperado numeric,
  add column if not exists quebra            numeric,
  add column if not exists resumo            jsonb,
  add column if not exists obs               text;
