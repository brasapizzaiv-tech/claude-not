-- Estoque ideal por produto: usado para a sugestão de compra na cotação.
-- Sugestão = max(0, estoque_ideal − quantidade contada).
alter table public.produtos
  add column if not exists estoque_ideal numeric not null default 0;
