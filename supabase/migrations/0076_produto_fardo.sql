-- Tamanho do fardo (unidades por fardo) por produto. Usado na cotação para
-- arredondar a sugestão de compra e fechar fardos inteiros.
-- 0 (ou 1) = produto vendido por unidade, sem arredondamento.
alter table public.produtos
  add column if not exists fardo numeric not null default 0;
